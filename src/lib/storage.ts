import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'pd:'
const LOCAL_EVENT = 'pd-store'

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
  } catch (e) {
    console.warn('No se pudo guardar', key, e)
  }
}

// Sesión de Google y cachés: no tiene sentido llevarlos a otro navegador o dominio
const NOT_EXPORTED = /^(google-|amiibo-catalog|games-checked-at|games-notified)/

/** Copia de seguridad de todos los datos del dashboard (para pasarlos de localhost a Vercel, etc.). */
export function exportAll() {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    if (!k.startsWith(PREFIX) || NOT_EXPORTED.test(k.slice(PREFIX.length))) continue
    data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)!)
  }
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
  const entries = Object.entries(json.data as Record<string, unknown>).filter(([k]) => !NOT_EXPORTED.test(k))
  for (const [k, v] of entries) localStorage.setItem(PREFIX + k, JSON.stringify(v))
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
    } catch (e) {
      console.warn('No se pudo guardar', key, e)
    }
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { key, raw } }))
  }, [key])
  return [value, update] as const
}
