import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Droplets, MapPin, Sun, Sunrise, Sunset, Thermometer, Wind } from 'lucide-react'
import { sameDay } from '../lib/events'
import { wmoGradient, wmoIcon, wmoText, type DayPoint, type Forecast, type HourPoint } from '../lib/weather'
import WeatherScene from './WeatherScene'

export const hhmm = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const round = (n: number) => Math.round(n)

export function WeatherHero({ f, name }: { f: Forecast; name: string }) {
  const c = f.current
  const today = f.days[0]
  const stats = [
    { icon: <Thermometer size={13} />, l: 'Sensación', v: `${round(c.feels)}°` },
    { icon: <Droplets size={13} />, l: 'Lluvia', v: `${today.rainProb}%` },
    { icon: <Wind size={13} />, l: 'Viento', v: `${round(c.wind)} km/h` },
    { icon: <Sun size={13} />, l: 'Índice UV', v: `${round(today.uv)}` },
    { icon: <Sunrise size={13} />, l: 'Amanecer', v: hhmm(today.sunrise) },
    { icon: <Sunset size={13} />, l: 'Atardecer', v: hhmm(today.sunset) },
  ]
  return (
    <div className="wx-hero" style={{ background: wmoGradient(c.code, c.isDay) }}>
      <WeatherScene code={c.code} isDay={c.isDay} />
      <div className="wx-place"><MapPin size={13} /> {name}</div>
      <div className="wx-temp">{round(c.temp)}<sup>°</sup></div>
      <div className="wx-cond">{wmoText(c.code)}</div>
      <div style={{ opacity: 0.85, fontSize: 14, marginTop: 2 }}>
        Máx {round(today.max)}° · Mín {round(today.min)}°
      </div>
      <div className="wx-stats">
        {stats.map((s) => (
          <div key={s.l} className="wx-stat">
            <div className="l">{s.icon} {s.l}</div>
            <div className="v">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DayStrip({ days, selected, onSelect }: { days: DayPoint[]; selected: number; onSelect: (i: number) => void }) {
  const lo = Math.min(...days.map((d) => d.min))
  const hi = Math.max(...days.map((d) => d.max))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <div className="wx-days">
      {days.map((d, i) => (
        <button key={i} className={`wx-day ${i === selected ? 'active' : ''}`} style={{ '--i': i } as CSSProperties} onClick={() => onSelect(i)}>
          <div className="cap" style={{ fontSize: 13, fontWeight: 600 }}>
            {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
          </div>
          <div className="faint" style={{ fontSize: 11 }}>{d.date.getDate()}/{d.date.getMonth() + 1}</div>
          <div className="ico">{wmoIcon(d.code)}</div>
          <div className="max">{round(d.max)}°</div>
          <div className="min">{round(d.min)}°</div>
          <div className="temp-range">
            <div style={{ left: `${pct(d.min)}%`, right: `${100 - pct(d.max)}%` }} />
          </div>
          <div style={{ fontSize: 11, color: d.rainProb > 40 ? '#7dd3fc' : 'var(--faint)', marginTop: 4 }}>💧 {d.rainProb}%</div>
        </button>
      ))}
    </div>
  )
}

const COL = 64
const CHART_H = 100

/** Tira horaria con curva de temperatura en SVG + iconos, lluvia y viento. */
export function HourlyStrip({ hours, now = new Date() }: { hours: HourPoint[]; now?: Date }) {
  const scroller = useRef<HTMLDivElement>(null)
  // Si la tira incluye la hora actual, arrancamos desplazados hasta ella
  const nowIdx = hours.findIndex((h) => sameDay(h.time, now) && h.time.getHours() === now.getHours())
  useLayoutEffect(() => {
    if (scroller.current && nowIdx > 0) scroller.current.scrollLeft = (nowIdx - 1) * COL
  }, [nowIdx])
  if (!hours.length) return null
  const temps = hours.map((h) => h.temp)
  const lo = Math.min(...temps) - 1
  const hi = Math.max(...temps) + 1
  const y = (t: number) => 22 + (1 - (t - lo) / (hi - lo)) * (CHART_H - 36)
  const pts = hours.map((h, i) => [i * COL + COL / 2, y(h.temp)] as const)
  // Curva suavizada (Catmull-Rom → Bézier)
  let line = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    line += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`
  }
  const area = `${line} L ${pts[pts.length - 1][0]} ${CHART_H} L ${pts[0][0]} ${CHART_H} Z`
  const width = hours.length * COL
  const maxI = temps.indexOf(Math.max(...temps))
  const minI = temps.indexOf(Math.min(...temps))
  return (
    <div className="hourly-scroll" ref={scroller}>
      <div style={{ width }}>
        <svg width={width} height={CHART_H} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tl" x1="0" x2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#tg)" />
          <path d={line} fill="none" stroke="url(#tl)" strokeWidth="3" strokeLinecap="round" style={{ filter: 'drop-shadow(0 4px 8px rgba(251,191,36,.35))' }} />
          {pts.map(([x, yy], i) => {
            const special = i === maxI || i === minI || i === nowIdx
            return (
              <g key={i}>
                <circle cx={x} cy={yy} r={special ? 5 : 3} fill={i === nowIdx ? '#fff' : '#0b0d17'} stroke="#fff" strokeWidth="2" />
                <text x={x} y={yy - 11} textAnchor="middle" fontSize={special ? 13 : 12} fontWeight="700" fill={i === maxI ? '#fbbf24' : i === minI ? '#7dd3fc' : '#f1f2fa'} fontFamily="Outfit, Inter">
                  {round(hours[i].temp)}°
                </text>
              </g>
            )
          })}
        </svg>
        <div className="hourly-cols">
          {hours.map((h, i) => (
            <div key={i} className={`hour-col ${i === nowIdx ? 'now' : ''}`} title={wmoText(h.code)}>
              <div style={{ fontWeight: i === nowIdx ? 700 : 500 }}>{i === nowIdx ? 'Ahora' : `${h.time.getHours()}h`}</div>
              <div className="ico">{wmoIcon(h.code, h.isDay)}</div>
              <div className="rain-bar" title={`${h.rainProb}% lluvia`}>
                <div style={{ height: `${h.rainProb}%` }} />
              </div>
              <div style={{ fontSize: 11, color: h.rainProb > 30 ? '#7dd3fc' : 'var(--faint)' }}>{h.rainProb}%</div>
              <div className="faint" style={{ fontSize: 11 }}>{round(h.wind)} km/h</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Tarjeta del tiempo para la home, con escena animada. */
export function WeatherMini({ f, name, onClick, i = 0 }: { f: Forecast; name: string; onClick?: () => void; i?: number }) {
  const c = f.current
  const t = f.days[0]
  const next = f.hours.filter((h) => h.time > new Date()).slice(0, 6)
  return (
    <button className="wx-mini" style={{ background: wmoGradient(c.code, c.isDay), '--i': i } as CSSProperties} onClick={onClick}>
      <WeatherScene code={c.code} isDay={c.isDay} density={0.6} />
      <div className="wx-place" style={{ alignSelf: 'flex-start' }}><MapPin size={12} /> {name}</div>
      <div className="t">{round(c.temp)}°</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{wmoText(c.code)}</div>
      <div style={{ fontSize: 12.5, opacity: 0.8 }}>Máx {round(t.max)}° · Mín {round(t.min)}° · 💧 {t.rainProb}%</div>
      <div className="wx-mini-hours">
        {next.map((h, k) => (
          <div key={k}>
            <div style={{ opacity: 0.8 }}>{h.time.getHours()}h</div>
            <div style={{ fontSize: 18, margin: '2px 0' }}>{wmoIcon(h.code, h.isDay)}</div>
            <div style={{ fontWeight: 700 }}>{round(h.temp)}°</div>
          </div>
        ))}
      </div>
    </button>
  )
}
