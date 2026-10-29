import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Tarjeta con halo de luz que sigue al ratón. `i` escalona la animación de entrada. */
export function Card({
  children, className = '', style, i = 0, accent, onClick,
}: { children: ReactNode; className?: string; style?: CSSProperties; i?: number; accent?: string; onClick?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect()
    ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
    ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <div
      ref={ref}
      className={`card ${onClick ? 'clickable' : ''} ${className}`}
      style={{ '--i': i, ...(accent ? { '--accent-c': accent } : {}), ...style } as CSSProperties}
      onMouseMove={onMove}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardTitle({ icon, title, color, right }: { icon: ReactNode; title: ReactNode; color?: string; right?: ReactNode }) {
  return (
    <div className="card-title">
      <h3>
        <span className="title-icon" style={color ? { '--c': color } as CSSProperties : undefined}>{icon}</span>
        {title}
      </h3>
      {right}
    </div>
  )
}

/** Número que cuenta hasta su valor. */
export function CountUp({ value, duration = 900, decimals = 0 }: { value: number; duration?: number; decimals?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(a + (value - a) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</>
}

/** Anillo de progreso con degradado. */
export function Ring({
  pct, size = 150, stroke = 12, children, colors = ['#a78bfa', '#22d3ee'],
}: { pct: number; size?: number; stroke?: number; children?: ReactNode; colors?: [string, string] }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = useRef(`rg${Math.random().toString(36).slice(2)}`).current
  const [p, setP] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setP(pct))
    return () => cancelAnimationFrame(t)
  }, [pct])
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.07)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${colors[0]}88)` }}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

/** Tiempo relativo en español: "en 3 h", "hace 5 min". */
export function relTime(d: Date, now = new Date()) {
  const diff = d.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), 'hour')
  return rtf.format(Math.round(diff / 86400_000), 'day')
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
