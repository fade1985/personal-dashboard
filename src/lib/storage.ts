import { useCallback, useEffect, useRef, useState } from 'react'

export const PREFIX = 'pd:'
const LOCAL_EVENT = 'pd-store'
const META_KEY = PREFIX + 'sync-meta'

// Lo que no sale de este navegador (ni en la copia ni en la sincronización): sesión de Google,
// cachés, estado de la propia sincronización y preferencias de la vista (filtros, ubicación actual…)
const LOCAL_ONLY = /^(google-|amiibo-catalog|games-checked-at|games-notified|sync-|am-|quotes$|weather-selected$|here$)/

/** Si la clave (sin prefijo) viaja a la copia de seguridad y a Drive. */
export const isShared = (key: string) => !LOCAL_ONLY.test(key)

/** Cuándo se cambió cada clave en este navegador (para que en la sincronización gane la más reciente). */
export function readMeta(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function setMeta(changes: Record<string, number>) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...changes }))
  } catch (e) {
    console.warn('No se pudo guardar', META_KEY, e)
  }
}

function touch(key: string) {
  if (isShared(key)) setMeta({ [key]: Date.now() })
}

/** Claves (sin prefijo) de datos compartibles que hay en este navegador. */
export function sharedKeys() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    if (k.startsWith(PREFIX) && isShared(k.slice(PREFIX.length))) keys.push(k.slice(PREFIX.length))
  }
  return keys
}

/** Escribe un valor que llega de fuera (Drive) sin marcarlo como cambio local, y avisa a los componentes. */
export function applyExternal(key: string, raw: string, changedAt: number) {
  localStorage.setItem(PREFIX + key, raw)
  setMeta({ [key]: changedAt })
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { key, raw, external: true } }))
}

/** Avisa cada vez que cambia un dato compartible en esta pestaña (no los que llegan de Drive). */
export function onSharedChange(fn: (key: string) => void) {
  const h = (e: Event) => {
    const { key, external } = (e as CustomEvent<{ key: string; external?: boolean }>).detail
    if (!external && isShared(key)) fn(key)
  }
  window.addEventListener(LOCAL_EVENT, h)
  return () => window.removeEventListener(LOCAL_EVENT, h)
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeStore<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    touch(key)
  } catch (e) {
    console.warn('No se pudo guardar', key, e)
  }
}

/** Copia de seguridad de todos los datos del dashboard (para pasarlos de localhost a Vercel, etc.). */
export function exportAll() {
  const data: Record<string, unknown> = {}
  for (const k of sharedKeys()) data[k] = JSON.parse(localStorage.getItem(PREFIX + k)!)
  const blob = new Blob([JSON.stringify({ app: 'mi-dashboard', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `mi-dashboard-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Restaura una copia de exportAll(); sobrescribe las claves que traiga. Devuelve cuántas. */
export async function importAll(file: File) {
  const json = JSON.parse(await file.text())
  if (json?.app !== 'mi-dashboard' || typeof json.data !== 'object') throw new Error('No es una copia de este dashboard')
  const entries = Object.entries(json.data as Record<string, unknown>).filter(([k]) => isShared(k))
  // Cuentan como cambios de ahora: así la copia restaurada es lo que se sube a Drive
  for (const [k, v] of entries) writeStore(k, v)
  return entries.length
}

/**
 * useState persistido en localStorage. Todas las instancias con la misma clave
 * comparten valor (en esta pestaña y entre pestañas).
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStore(key, initial))
  const last = useRef<string>(JSON.stringify(value))
  const current = useRef(value)

  useEffect(() => {
    const apply = (k: string | null, raw: string | null) => {
      if (k !== key || raw == null || raw === last.current) return
      last.current = raw
      current.current = JSON.parse(raw)
      setValue(current.current)
    }
    const onStorage = (e: StorageEvent) => apply(e.key?.slice(PREFIX.length) ?? null, e.newValue)
    const onLocal = (e: Event) => {
      const { key: k, raw } = (e as CustomEvent<{ key: string; raw: string }>).detail
      apply(k, raw)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LOCAL_EVENT, onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LOCAL_EVENT, onLocal)
    }
  }, [key])

  // Se guarda en el momento (no en un efecto): así no se pierde si el componente
  // se desmonta justo después, p. ej. un modal que guarda y se cierra.
  const update = useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function' ? (v as (prev: T) => T)(current.current) : v
    const raw = JSON.stringify(next)
    current.current = next
    setValue(next)
    if (raw === last.current) return
    last.current = raw
    try {
      localStorage.setItem(PREFIX + key, raw)
      touch(key)
    } catch (e) {
      console.warn('No se pudo guardar', key, e)
    }
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { key, raw } }))
  }, [key])
  return [value, update] as const
}
