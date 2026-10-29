import { createContext, useContext } from 'react'
import type { useGoogle } from './google'

export type SectionId = 'home' | 'calendar' | 'weather' | 'finance' | 'amiibos'

/** Color de acento de cada sección (iconos, halos, títulos). */
export const SECTION_COLOR: Record<SectionId | 'mail', string> = {
  home: '#22d3ee',
  calendar: '#a78bfa',
  weather: '#38bdf8',
  finance: '#4ade80',
  amiibos: '#fb7185',
  mail: '#fbbf24',
}

export function go(id: SectionId) {
  location.hash = id
}

type GoogleState = ReturnType<typeof useGoogle>
export const GoogleCtx = createContext<GoogleState | null>(null)
export const useGoogleCtx = () => useContext(GoogleCtx)!
