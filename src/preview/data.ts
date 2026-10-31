// Datos de Inicio compartidos por las maquetas: hora, tiempo, agenda, juegos, dinero, amiibos y correo.

import { useEffect, useMemo, useState } from 'react'
import { useGoogleCtx, type SectionId } from '../lib/nav'
import { useEvents, sameDay } from '../lib/events'
import { useForecast } from '../lib/useWeather'
import { MADRID } from '../lib/weather'
import { daysUntil, isUpcoming, todayYmd, useGames, type Game } from '../lib/games'
import { usePortfolio } from '../lib/portfolio'
import { monthFlow, monthKey, netWorth, spendByCategory, useAccounts, useTxs } from '../lib/finance'
import { useAmiiboCollection } from '../sections/Amiibos'
import { useInbox } from '../sections/Home'

export const open = (id: SectionId) => location.assign(`/#${id}`)
export const hhmm = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
export const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
export const fmtDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

export function useClock(every = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), every)
    return () => clearInterval(t)
  }, [every])
  return now
}

export function greeting(h: number) {
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Cuenta atrás: número y unidad por separado. */
export function countdown(date?: string, tba?: boolean) {
  if (tba || !date) return { n: null as number | null, u: 'Sin fecha' }
  const d = daysUntil(date)
  if (d <= 0) return { n: null, u: 'Ya a la venta' }
  if (d < 60) return { n: d, u: d === 1 ? 'día' : 'días' }
  const m = Math.round(d / 30.4)
  return { n: m, u: m === 1 ? 'mes' : 'meses' }
}

/** Tono estable para un texto (portadas sin imagen). */
export const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export function useHome() {
  const google = useGoogleCtx()
  const now = useClock()
  const madrid = useForecast(MADRID)
  const [from, to] = useMemo(() => {
    const f = new Date()
    f.setHours(0, 0, 0, 0)
    return [f, new Date(f.getTime() + 7 * 86400_000)]
  }, [])
  const { events } = useEvents(from, to, google.connected)
  const [games] = useGames()
  const today = todayYmd()
  const upcoming: Game[] = games
    .filter((g) => g.status !== 'done' && g.status !== 'dropped' && isUpcoming(g, today))
    .sort((a, b) => (a.tba || !a.released ? 1 : 0) - (b.tba || !b.released ? 1 : 0) || (a.released ?? '').localeCompare(b.released ?? ''))
  const playing = games.filter((g) => g.status === 'playing')

  const [accounts] = useAccounts()
  const [txs] = useTxs()
  const pf = usePortfolio()
  const worth = useMemo(() => netWorth(accounts, txs, pf.byAccount), [accounts, txs, pf.byAccount])
  const key = useMemo(() => {
    const k = monthKey(new Date())
    if (!txs.length || txs.some((t) => t.date.startsWith(k))) return k
    return monthKey(txs.reduce((m, t) => (t.date > m ? t.date : m), ''))
  }, [txs])
  const flow = monthFlow(txs, key)
  const cats = spendByCategory(txs, key)
  const month = new Date(key + '-01T12:00').toLocaleDateString('es-ES', { month: 'long' })

  const am = useAmiiboCollection()
  const figures = am.catalog.filter((a) => a.type === 'Figure')
  const owned = figures.filter((a) => am.collection[a.id]?.status === 'owned').length
  const wish = Object.values(am.collection).filter((c) => c.status === 'wishlist').length
  const latest = Object.entries(am.collection)
    .filter(([, c]) => c.status === 'owned')
    .sort((a, b) => b[1].addedAt.localeCompare(a[1].addedAt))
    .map(([id]) => am.catalog.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a) && a!.type === 'Figure')
    .slice(0, 12)

  const inbox = useInbox(google.connected)

  const todayEvents = events.filter((e) => sameDay(e.start, now) || (e.start < now && e.end > now && e.allDay))
  const later = events.filter((e) => sameDay(e.start, now) && !e.allDay && e.start > now)

  return {
    google, now, f: madrid.data, from, events, todayEvents, later,
    upcoming, playing, games,
    money: { hasData: txs.length > 0 || pf.positions.length > 0, worth, flow, cats, month, pf },
    amiibos: { owned, total: figures.length, wish, latest },
    inbox,
  }
}

export type HomeData = ReturnType<typeof useHome>

/** Frase de resumen del día. */
export function summary(h: HomeData) {
  const lines: string[] = []
  const { later, f, upcoming } = h
  if (later.length) lines.push(`Lo próximo: ${later[0].title}, a las ${hhmm(later[0].start)}${later.length > 1 ? `, y ${later.length - 1} más` : ''}.`)
  else lines.push('No te queda nada más en la agenda de hoy.')
  const next = upcoming[0]
  if (next?.released && !next.tba) {
    const n = daysUntil(next.released)
    if (n > 0) lines.push(n === 1 ? `${next.name} sale mañana.` : `${next.name} sale en ${n} días.`)
  }
  const tomorrow = f?.days[1]
  if (tomorrow && tomorrow.rainProb >= 50) lines.push(`Mañana llueve (${tomorrow.rainProb} %).`)
  return lines
}
