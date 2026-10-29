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
