import { useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { SECTION_COLOR, useGoogleCtx } from '../lib/nav'
import { Card, CardTitle, capitalize } from '../components/ui'
import { useForecast } from '../lib/useWeather'
import { MADRID, wmoIcon, wmoText } from '../lib/weather'
import { KIND_META, sameDay, useEvents, useLocalEvents, ymd, type LocalEvent } from '../lib/events'
import type { CalEvent } from '../lib/google'
import { hhmm } from '../components/WeatherParts'

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

/** Un evento ocupa el día d si empieza antes de que acabe d y termina después de que empiece. */
function onDay(e: CalEvent, d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const n = new Date(s.getTime() + 86400_000)
  return e.start < n && e.end > s
}

export default function CalendarSection() {
  const google = useGoogleCtx()
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const days = useMemo(() => monthGrid(cursor), [cursor])
  const from = days[0]
  const to = new Date(days[41].getTime() + 86400_000)
  const { events, loading, error } = useEvents(from, to, google.connected)

  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  const dayEvents = events.filter((e) => onDay(e, selected))

  const wx = useForecast(MADRID).data
  const wxFor = (d: Date) => wx?.days.find((x) => sameDay(x.date, d))

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ '--c': SECTION_COLOR.calendar } as CSSProperties}>
            <CalendarDays size={13} /> {google.connected ? 'Sincronizado con Google' : 'Eventos locales'}
            {loading && <RefreshCw size={12} className="spin" />}
          </div>
          <h1>{capitalize(cursor.toLocaleDateString('es-ES', { month: 'long' }))} <span className="faint" style={{ fontWeight: 400 }}>{cursor.getFullYear()}</span></h1>
          <p>{events.length} {events.length === 1 ? 'evento' : 'eventos'} en pantalla{!google.connected && ' · conecta Google para ver tu calendario'}</p>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => move(-1)} title="Mes anterior"><ChevronLeft size={18} /></button>
          <button className="btn sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today) }}>Hoy</button>
          <button className="icon-btn" onClick={() => move(1)} title="Mes siguiente"><ChevronRight size={18} /></button>
        </div>
      </div>
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="cal-layout">
        <Card i={0} accent={SECTION_COLOR.calendar} key={cursor.getTime()}>
          <div className="cal-grid">
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {days.map((d) => {
              const evs = events.filter((e) => onDay(e, d))
              const w = wxFor(d)
              const cls = [
                'cal-cell',
                d.getMonth() !== cursor.getMonth() && 'other',
                (d.getDay() === 0 || d.getDay() === 6) && 'weekend',
                sameDay(d, today) && 'today',
                sameDay(d, selected) && 'selected',
              ].filter(Boolean).join(' ')
              return (
                <button key={d.toISOString()} className={cls} onClick={() => setSelected(d)}>
                  <span className="cal-num">{d.getDate()}</span>
                  {w && <span className="cal-wx" title={wmoText(w.code)}>{wmoIcon(w.code)} {Math.round(w.max)}°</span>}
                  {evs.slice(0, 3).map((e) => (
                    <span key={e.id} className="cal-ev" style={{ background: e.color + '26', color: lighten(e.color) }}>
                      {e.kind === 'birthday' ? '🎂 ' : e.kind === 'reminder' ? '🔔 ' : ''}
                      {!e.allDay && `${hhmm(e.start)} `}{e.title}
                    </span>
                  ))}
                  {evs.length > 3 && <span className="cal-more">+{evs.length - 3} más</span>}
                </button>
              )
            })}
          </div>
        </Card>

        <div className="grid">
          <Card i={1} accent={SECTION_COLOR.calendar}>
            <div className="cal-day-head">
              <div className="num grad-text">{selected.getDate()}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{capitalize(selected.toLocaleDateString('es-ES', { weekday: 'long' }))}</div>
                <div className="muted" style={{ fontSize: 13 }}>{selected.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</div>
              </div>
              <div className="spacer" />
              {wxFor(selected) && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26 }}>{wmoIcon(wxFor(selected)!.code)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{Math.round(wxFor(selected)!.max)}° / {Math.round(wxFor(selected)!.min)}°</div>
                </div>
              )}
            </div>
            {dayEvents.length === 0 ? (
              <div className="empty" style={{ padding: '18px 0' }}><div className="big">🌿</div><p>Nada planeado</p></div>
            ) : (
              dayEvents.map((e) => <EventRow key={e.id} e={e} />)
            )}
          </Card>
          <AddEventCard date={selected} />
        </div>
      </div>
    </>
  )
}

function EventRow({ e }: { e: CalEvent }) {
  const [, setLocal] = useLocalEvents()
  const localId = e.source === 'local' ? e.id.split(':')[1] : null
  return (
    <div className="tl-item" style={{ '--c': e.color, padding: '10px 4px' } as CSSProperties}>
      <div className="tl-ico">{e.kind === 'birthday' ? '🎂' : e.kind === 'reminder' ? '🔔' : <i />}</div>
      <div className="tl-main">
        <div className="tl-title">{e.title}</div>
        <div className="tl-sub">
          {e.allDay ? 'Todo el día' : `${hhmm(e.start)} – ${hhmm(e.end)}`} · {e.calendar}
          {e.location && <> · <MapPin size={11} style={{ verticalAlign: -1 }} /> {e.location}</>}
        </div>
      </div>
      {e.link && <a className="icon-btn" href={e.link} target="_blank" rel="noreferrer" title="Abrir en Google Calendar"><ExternalLink size={14} /></a>}
      {localId && (
        <button className="icon-btn" title="Borrar" onClick={() => setLocal((l) => l.filter((x) => x.id !== localId))}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function AddEventCard({ date }: { date: Date }) {
  const [, setLocal] = useLocalEvents()
  const [kind, setKind] = useState<LocalEvent['kind']>('event')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [day, setDay] = useState<string | null>(null)
  const dateStr = day ?? ymd(date)

  const save = () => {
    if (!title.trim()) return
    setLocal((l) => [
      ...l,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        date: dateStr,
        time: kind === 'birthday' ? undefined : time || undefined,
        kind,
        yearly: kind === 'birthday',
        birthYear: kind === 'birthday' && birthYear ? Number(birthYear) : undefined,
      },
    ])
    setTitle('')
    setTime('')
    setBirthYear('')
    setDay(null)
  }

  return (
    <Card i={2} accent={KIND_META[kind].color}>
      <CardTitle icon={<Plus size={16} />} color={KIND_META[kind].color} title="Añadir" />
      <div className="form-grid">
        <div className="seg">
          {(Object.keys(KIND_META) as LocalEvent['kind'][]).map((k) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {KIND_META[k].icon} {KIND_META[k].label}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder={kind === 'birthday' ? '¿De quién es el cumple?' : kind === 'reminder' ? '¿Qué hay que recordar?' : 'Título del evento'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="row">
          <input className="input" type="date" value={dateStr} onChange={(e) => setDay(e.target.value)} style={{ flex: 1 }} />
          {kind === 'birthday' ? (
            <input className="input" type="number" placeholder="Año nac." value={birthYear} onChange={(e) => setBirthYear(e.target.value)} style={{ width: 110 }} />
          ) : (
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 120 }} />
          )}
        </div>
        <button className="btn primary" onClick={save} disabled={!title.trim()}>Guardar</button>
        <div className="faint" style={{ fontSize: 12 }}>
          Se guarda en este navegador. Los cumpleaños se repiten cada año.
        </div>
      </div>
    </Card>
  )
}

/** Aclara un color hex para usarlo como texto sobre fondo oscuro. */
export function lighten(hex: string) {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return hex
  const [r, g, b] = m.map((x) => parseInt(x, 16))
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}
