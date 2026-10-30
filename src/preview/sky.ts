// Color del cielo según la posición real del sol en Madrid (amanecer y atardecer de Open-Meteo).

export type Phase = 'night' | 'dawn' | 'day' | 'golden' | 'dusk'

const MIN = 60_000

export function skyPhase(now: Date, sunrise?: Date, sunset?: Date): Phase {
  // Sin previsión todavía: una aproximación por la hora
  const rise = sunrise ?? new Date(new Date(now).setHours(8, 0, 0, 0))
  const set = sunset ?? new Date(new Date(now).setHours(19, 0, 0, 0))
  const t = now.getTime()
  if (t < rise.getTime() - 40 * MIN || t > set.getTime() + 45 * MIN) return 'night'
  if (t < rise.getTime() + 40 * MIN) return 'dawn'
  if (t > set.getTime() - 15 * MIN) return 'dusk'
  if (t > set.getTime() - 75 * MIN) return 'golden'
  return 'day'
}

/** Degradado del cielo (de arriba abajo) y color de los edificios para cada fase; más gris si está cubierto. */
export function skyColors(phase: Phase, overcast: boolean) {
  const base: Record<Phase, { sky: string[]; city: string; haze: string }> = {
    night: { sky: ['#03051a', '#0b1238', '#1b1f55', '#2b2366'], city: '#05071a', haze: 'rgba(120, 90, 255, .18)' },
    dawn: { sky: ['#1d2b6b', '#5b4a9e', '#d97a9a', '#ffc59a'], city: '#1a1636', haze: 'rgba(255, 170, 150, .35)' },
    day: { sky: ['#1f6fd1', '#3d95e8', '#7cc1f5', '#c6e8ff'], city: '#22304f', haze: 'rgba(200, 235, 255, .45)' },
    golden: { sky: ['#2b5fb8', '#6d8fd6', '#f2b27a', '#ffd89a'], city: '#2a2140', haze: 'rgba(255, 200, 140, .45)' },
    dusk: { sky: ['#0f1446', '#3a2a78', '#b4497a', '#ff8a5c'], city: '#120d2a', haze: 'rgba(255, 120, 110, .35)' },
  }
  const b = base[phase]
  if (!overcast) return b
  const grey: Record<Phase, string[]> = {
    night: ['#05060f', '#0d1020', '#171a2e', '#20233a'],
    dawn: ['#2a2f4a', '#4a4f6e', '#8a7f95', '#b4a6a8'],
    day: ['#4f6178', '#6b7d94', '#94a3b5', '#c3ccd6'],
    golden: ['#4a5470', '#6c7088', '#a8918a', '#cdb39a'],
    dusk: ['#1a1b33', '#33304f', '#6b4a66', '#93605f'],
  }
  return { ...b, sky: grey[phase] }
}

export const isLit = (p: Phase) => p === 'night' || p === 'dusk' || p === 'dawn'
