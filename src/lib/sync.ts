// Sincronización entre dispositivos con un archivo JSON en la carpeta oculta de la app en
// Google Drive (appDataFolder). Cada dato (amiibos, movimientos, juegos…) lleva la hora
// en que se cambió y, al sincronizar, gana la versión más reciente de cada uno.
// Si no hay conexión con Google no pasa nada: los cambios esperan con su hora y se suben
// en la siguiente sincronización.

import { useEffect, useSyncExternalStore } from 'react'
import { gapi, GoogleError, hasDriveAccess } from './google'
import { PREFIX, applyExternal, isShared, onSharedChange, readMeta, setMeta, sharedKeys } from './storage'

const FILE_NAME = 'mi-dashboard.json'
const STATE_KEY = PREFIX + 'sync-state'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

interface RemoteDoc {
  app: 'mi-dashboard'
  version: 1
  data: Record<string, { t: number; v: unknown }>
}

/** Lo que sabemos de Drive tras la última sincronización. */
interface SyncState {
  fileId?: string
  modified?: string
  /** Hora de cada dato tal como quedó en Drive */
  times: Record<string, number>
  at?: number
}

function readState(): SyncState {
  try {
    return { times: {}, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') }
  } catch {
    return { times: {} }
  }
}

function writeState(s: SyncState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s))
}

// ---------- Estado visible (barra lateral) ----------

export type SyncStatus =
  | { kind: 'off' } // sin Google o sin permiso de Drive
  | { kind: 'syncing'; at?: number }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; message: string; at?: number }

let status: SyncStatus = initialStatus()
const listeners = new Set<() => void>()

function initialStatus(): SyncStatus {
  const at = readState().at
  return hasDriveAccess() && at ? { kind: 'ok', at } : { kind: 'off' }
}

function setStatus(s: SyncStatus) {
  status = s
  listeners.forEach((l) => l())
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

/** Hay cambios locales que Drive aún no tiene. */
export function hasPendingChanges() {
  const meta = readMeta()
  const { times } = readState()
  return sharedKeys().some((k) => !(k in meta) || meta[k] > (times[k] ?? 0))
}

// ---------- Drive ----------

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const r = await gapi<{ files: { id: string; modifiedTime: string }[] }>(
    `${DRIVE}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
  )
  return r.files[0] ?? null
}

async function download(id: string): Promise<RemoteDoc> {
  const doc = await gapi<RemoteDoc>(`${DRIVE}/${id}?alt=media`)
  if (doc?.app !== 'mi-dashboard' || typeof doc.data !== 'object') throw new Error('El archivo de Drive no es de este dashboard')
  return doc
}

async function upload(doc: RemoteDoc, id?: string) {
  const body = JSON.stringify(doc)
  if (id) {
    return gapi<{ id: string; modifiedTime: string }>(`${UPLOAD}/${id}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }
  const boundary = `pd${crypto.randomUUID()}`
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })
  return gapi<{ id: string; modifiedTime: string }>(`${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body:
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
  })
}

// ---------- Sincronizar ----------

let running: Promise<void> | null = null

/** Sincroniza ahora (si ya hay una en marcha, espera a esa). */
export function syncNow(): Promise<void> {
  if (!hasDriveAccess()) {
    setStatus({ kind: 'off' })
    return Promise.resolve()
  }
  running ??= run().finally(() => (running = null))
  return running
}

async function run() {
  const prevAt = readState().at
  setStatus({ kind: 'syncing', at: prevAt })
  try {
    await merge()
    setStatus({ kind: 'ok', at: readState().at! })
  } catch (e) {
    if (e instanceof GoogleError && e.status === 404) writeState({ ...readState(), fileId: undefined, modified: undefined })
    setStatus({ kind: 'error', message: (e as Error).message, at: prevAt })
  }
}

async function merge() {
  const state = readState()
  const file = await findFile()

  // Nada nuevo en Drive ni aquí: no hace falta descargar
  if (file && file.id === state.fileId && file.modifiedTime === state.modified && !hasPendingChanges()) {
    writeState({ ...state, at: Date.now() })
    return
  }

  const remote = file ? (await download(file.id)).data : {}
  const meta = readMeta()
  const local = Object.fromEntries(sharedKeys().map((k) => [k, localStorage.getItem(PREFIX + k)!]))

  // Datos de antes de existir la sincronización (sin hora): si Drive tiene otra versión, que elija el usuario
  const untracked = Object.keys(local).filter((k) => !(k in meta))
  const differing = untracked.filter((k) => k in remote && JSON.stringify(remote[k].v) !== local[k])
  const preferLocal =
    differing.length > 0 &&
    !confirm(
      `Drive ya tiene datos de otro dispositivo y no coinciden con los de este navegador (${differing.join(', ')}).\n\n` +
        'Aceptar: usar los de Drive (se reemplazan los de aquí)\nCancelar: quedarse con los de este navegador (se suben a Drive)',
    )
  const now = Date.now()
  const fixed: Record<string, number> = {}
  for (const k of untracked) {
    if (!(k in remote)) fixed[k] = now
    else if (differing.includes(k)) fixed[k] = preferLocal ? now : 0
    else fixed[k] = remote[k].t
  }
  if (untracked.length) setMeta(fixed)
  const times = { ...meta, ...fixed }

  const out: RemoteDoc = { app: 'mi-dashboard', version: 1, data: {} }
  let changed = !file
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (!isShared(k)) continue
    const lt = k in local ? times[k] ?? 0 : -1
    const rt = remote[k]?.t ?? -1
    if (rt > lt) {
      applyExternal(k, JSON.stringify(remote[k].v), rt)
      out.data[k] = remote[k]
    } else {
      out.data[k] = { t: lt, v: JSON.parse(local[k]) }
      if (lt > rt) changed = true
    }
  }

  let { id, modifiedTime } = file ?? {}
  if (changed) ({ id, modifiedTime } = await upload(out, id))
  writeState({
    fileId: id,
    modified: modifiedTime,
    times: Object.fromEntries(Object.entries(out.data).map(([k, d]) => [k, d.t])),
    at: Date.now(),
  })
}

// ---------- Cuándo ----------

const DEBOUNCE = 4_000
const EVERY = 5 * 60_000
const ON_FOCUS_AFTER = 30_000

/** Sincroniza al conectar, poco después de cada cambio, al volver a la pestaña y cada 5 min. */
export function useAutoSync(connected: boolean) {
  useEffect(() => {
    if (!connected) {
      setStatus({ kind: 'off' })
      return
    }
    syncNow()

    let timer: ReturnType<typeof setTimeout> | undefined
    const offChange = onSharedChange(() => {
      clearTimeout(timer)
      timer = setTimeout(syncNow, DEBOUNCE)
    })
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        // Al irse de la pestaña, subir lo pendiente sin esperar al temporizador
        if (hasPendingChanges()) syncNow()
        return
      }
      if (Date.now() - (readState().at ?? 0) > ON_FOCUS_AFTER) syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    const every = setInterval(() => document.visibilityState === 'visible' && syncNow(), EVERY)
    return () => {
      offChange()
      clearTimeout(timer)
      clearInterval(every)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connected])
}
