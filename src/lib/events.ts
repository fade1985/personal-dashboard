// Eventos locales (cumpleaños, avisos, recordatorios) + unión con Google Calendar.

import { useEffect, useState } from 'react'
import { fetchCalendarEvents, type CalEvent } from './google'
import { usePersistentState } from './storage'

export interface LocalEvent {
  id: string
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM
  kind: 'event' | 'birthday' | 'reminder'
  yearly: boolean
  birthYear?: number
}

export const KIND_META: Record<LocalEvent['kind'], { label: string; icon: string; color: string }> = {
  event: { label: 'Evento', icon: '📌', color: '#6366f1' },
  birthday: { label: 'Cumpleaños', icon: '🎂', color: '#ec4899' },
  reminder: { label: 'Aviso', icon: '🔔', color: '#f59e0b' },
}

export function useLocalEvents() {
  return usePersistentState<LocalEvent[]>('local-events', [])
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Expande los eventos locales (incluidas repeticiones anuales) dentro de [from, to). */
export function expandLocal(events: LocalEvent[], from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = []
  for (const e of events) {
    const [y, m, d] = e.date.split('-').map(Number)
    const years = e.yearly ? range(from.getFullYear(), to.getFullYear()) : [y]
    for (const year of years) {
      const [hh, mm] = (e.time ?? '00:00').split(':').map(Number)
      const start = new Date(year, m - 1, d, hh, mm)
      if (start < from || start >= to) continue
      const age = e.kind === 'birthday' && e.birthYear ? year - e.birthYear : null
      out.push({
        id: `local:${e.id}:${year}`,
        title: age ? `${e.title} (${age})` : e.title,
        start,
        end: new Date(start.getTime() + (e.time ? 3600_000 : 86400_000)),
        allDay: !e.time,
        color: KIND_META[e.kind].color,
        calendar: KIND_META[e.kind].label,
        source: 'local',
        kind: e.kind,
      })
    }
  }
  return out
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/** Todos los eventos (Google + locales) en un rango, ordenados. */
export function useEvents(from: Date, to: Date, googleConnected: boolean) {
  const [local] = useLocalEvents()
  const [google, setGoogle] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = `${from.getTime()}-${to.getTime()}`

  useEffect(() => {
    if (!googleConnected) {
      setGoogle([])
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    fetchCalendarEvents(from, to)
      .then((ev) => alive && setGoogle(ev))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, googleConnected])

  const events = [...google, ...expandLocal(local, from, to)].sort((a, b) => a.start.getTime() - b.start.getTime())
  return { events, loading, error }
}
