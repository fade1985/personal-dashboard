// Silueta de Madrid (de izquierda a derecha: Palacio Real, Almudena, Edificio España, Torre de Madrid,
// Metrópolis, Torres KIO y las Cuatro Torres con Caleido). De noche se encienden las ventanas.

import { memo, useEffect, useState } from 'react'

const W = 1600
const G = 320 // línea del suelo

const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453
  return x - Math.floor(x)
}

interface Block { x: number; w: number; h: number; win?: boolean; skew?: number }

// Edificios cuyos rectángulos llevan ventanas
const BLOCKS: Block[] = [
  { x: 60, w: 240, h: 64, win: true }, // Palacio Real
  { x: 320, w: 74, h: 70, win: true }, // base de la Almudena
  { x: 440, w: 84, h: 120, win: true }, // Edificio España
  { x: 456, w: 52, h: 150, win: true },
  { x: 540, w: 46, h: 204, win: true }, // Torre de Madrid
  { x: 650, w: 76, h: 120, win: true }, // Metrópolis
  { x: 836, w: 58, h: 206, win: true, skew: -15 }, // KIO
  { x: 1030, w: 58, h: 206, win: true, skew: 15 },
  { x: 1150, w: 56, h: 272, win: true }, // Cepsa
  { x: 1232, w: 54, h: 252, win: true }, // PwC
  { x: 1312, w: 54, h: 262, win: true }, // Cristal
  { x: 1392, w: 56, h: 246, win: true }, // Espacio
  { x: 1474, w: 46, h: 190, win: true }, // Caleido
]

// Relleno bajo entre los edificios conocidos
const FILL: Block[] = (() => {
  const out: Block[] = []
  let x = 0
  let i = 0
  while (x < W) {
    const w = 26 + Math.round(rnd(i, 1) * 46)
    const h = 34 + Math.round(rnd(i, 2) * (x > 1080 && x < 1540 ? 90 : x > 700 && x < 860 ? 80 : 50))
    out.push({ x, w, h, win: rnd(i, 3) > 0.35 })
    x += w + Math.round(rnd(i, 4) * 6)
    i++
  }
  return out
})()

interface Win { x: number; y: number; on: boolean; d: number; skew?: number; bx: number }

function windows(blocks: Block[], seed: number): Win[] {
  const out: Win[] = []
  blocks.forEach((b, bi) => {
    if (!b.win) return
    for (let y = G - b.h + 10; y < G - 8; y += 11) {
      for (let x = b.x + 6; x < b.x + b.w - 7; x += 9) {
        if (b.x === 1150 && x > 1160 && x < 1192 && y > G - 262 && y < G - 210) continue // arco de Cepsa
        const k = out.length
        out.push({ x, y, on: rnd(k + bi, seed) > 0.58, d: (x / W) * 1.8 + rnd(k, seed + 7) * 0.9, skew: b.skew, bx: b.x })
      }
    }
  })
  return out
}

const WINS = [...windows(FILL, 11), ...windows(BLOCKS, 23)]

function Shapes({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      {FILL.map((b, i) => <rect key={`f${i}`} x={b.x} y={G - b.h} width={b.w} height={b.h} />)}
      {/* Palacio Real: cuerpo y torreones */}
      <rect x={60} y={G - 64} width={240} height={64} />
      <rect x={52} y={G - 80} width={28} height={80} />
      <rect x={280} y={G - 80} width={28} height={80} />
      <rect x={165} y={G - 74} width={30} height={10} />
      {/* Almudena: tambor, cúpula y linterna */}
      <rect x={320} y={G - 70} width={74} height={70} />
      <rect x={340} y={G - 104} width={34} height={36} />
      <path d={`M334 ${G - 102} A23 23 0 0 1 380 ${G - 102} Z`} />
      <rect x={353} y={G - 134} width={8} height={12} />
      <path d={`M352 ${G - 134} L357 ${G - 146} L362 ${G - 134} Z`} />
      {/* Edificio España y Torre de Madrid */}
      <rect x={440} y={G - 120} width={84} height={120} />
      <rect x={456} y={G - 150} width={52} height={150} />
      <rect x={540} y={G - 204} width={46} height={204} />
      <rect x={552} y={G - 214} width={22} height={10} />
      {/* Metrópolis: fachada curva, cúpula y la Victoria alada */}
      <rect x={650} y={G - 120} width={76} height={120} rx={10} />
      <rect x={670} y={G - 150} width={36} height={32} />
      <path d={`M666 ${G - 148} A22 22 0 0 1 710 ${G - 148} Z`} />
      <path d={`M686 ${G - 170} L688 ${G - 186} L683 ${G - 180} L688 ${G - 194} L693 ${G - 180} L689 ${G - 186} L691 ${G - 170} Z`} />
      {/* Torres KIO, inclinadas la una hacia la otra */}
      <rect x={836} y={G - 206} width={58} height={206} transform={`translate(836 ${G}) skewX(-15) translate(-836 ${-G})`} />
      <rect x={1030} y={G - 206} width={58} height={206} transform={`translate(1088 ${G}) skewX(15) translate(-1088 ${-G})`} />
      {/* Cuatro Torres */}
      <path fillRule="evenodd" d={`M1150 ${G} V${G - 272} H1206 V${G} Z M1166 ${G - 258} H1190 V${G - 214} H1166 Z`} />
      <rect x={1232} y={G - 252} width={54} height={252} rx={12} />
      <rect x={1252} y={G - 262} width={14} height={12} />
      <path d={`M1312 ${G} V${G - 252} L1340 ${G - 266} L1366 ${G - 256} V${G} Z`} />
      <path d={`M1392 ${G} V${G - 230} Q1420 ${G - 262} 1448 ${G - 240} V${G} Z`} />
      <rect x={1474} y={G - 190} width={46} height={190} />
      <rect x={1496} y={G - 222} width={3} height={32} />
    </g>
  )
}

/** Luces de aviso rojas en lo alto de las torres. */
const BEACONS = [[1178, G - 276], [1259, G - 266], [1340, G - 270], [1420, G - 248], [1497, G - 226], [563, G - 218]]

// En pantallas estrechas se recorta por la izquierda para que siempre se vean las Cuatro Torres
const NARROW = '(max-width: 1100px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = matchMedia(NARROW)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function SkylineImpl({ city, lit }: { city: string; lit: boolean }) {
  const narrow = useNarrow()
  return (
    <svg className={`nx-skyline ${lit ? 'lit' : ''}`} viewBox={`0 0 ${W} ${G}`} preserveAspectRatio={`${narrow ? 'xMax' : 'xMid'}YMax slice`} aria-hidden>
      <defs>
        <filter id="nx-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <Shapes fill={city} />
      <g filter={lit ? 'url(#nx-glow)' : undefined}>
        {WINS.map((w, i) => {
          const r = <rect key={i} className={`nx-win ${w.on ? 'on' : ''}`} x={w.x} y={w.y} width={4} height={6} style={{ animationDelay: `${w.d}s` }} />
          if (!w.skew) return r
          const ox = w.skew < 0 ? w.bx : w.bx + 58
          return <g key={i} transform={`translate(${ox} ${G}) skewX(${w.skew}) translate(${-ox} ${-G})`}>{r}</g>
        })}
      </g>
      {lit && BEACONS.map(([x, y], i) => <circle key={i} className="nx-beacon" cx={x} cy={y} r={2.6} style={{ animationDelay: `${i * 0.37}s` }} />)}
    </svg>
  )
}

export const Skyline = memo(SkylineImpl)
