// Conexión con Google (Calendar + Gmail) solo desde el navegador, con OAuth 2.0
// por redirección (sin ventanas emergentes, que se cuelgan en algunos navegadores).
// No hay backend: el token se guarda en localStorage y caduca en ~1 h; al volver
// a abrir el dashboard se renueva solo con una redirección silenciosa (prompt=none).

import { useCallback, useEffect, useState } from 'react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')
const TOKEN_KEY = 'pd:google-token'
const CONNECTED_KEY = 'pd:google-connected'
const EMAIL_KEY = 'pd:google-email'
const STATE_KEY = 'pd:google-state'
const SILENT_KEY = 'pd:google-silent-at'

export const googleConfigured = Boolean(CLIENT_ID)
/** Debe estar en "URI de redireccionamiento autorizados" del cliente OAuth. */
export const redirectUri = location.origin

function storedToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const { token, exp } = JSON.parse(raw)
    return Date.now() < exp - 60_000 ? token : null
  } catch {
    return null
  }
}

function tokenExpiry(): number {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? '{}').exp ?? 0
  } catch {
    return 0
  }
}

/** Lleva al usuario a Google; vuelve a esta misma sección con el token en la URL. */
function startAuth(prompt: 'consent' | 'none') {
  if (!CLIENT_ID) throw new Error('Falta VITE_GOOGLE_CLIENT_ID en .env.local')
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, back: location.hash }))
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state,
    prompt: prompt === 'none' ? 'none' : 'consent',
  })
  const email = localStorage.getItem(EMAIL_KEY)
  if (email) params.set('login_hint', email)
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/** Error devuelto por Google en la última redirección, si lo hubo. */
let redirectError: string | null = null

// Al cargar: si venimos de Google, recogemos el token del fragmento de la URL
// y restauramos la sección en la que estaba el usuario.
;(function handleRedirect() {
  const h = new URLSearchParams(location.hash.slice(1))
  if (!h.has('access_token') && !h.has('error')) return
  let saved: { state: string; back: string } | null = null
  try {
    saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null')
  } catch {
    /* sin estado guardado */
  }
  sessionStorage.removeItem(STATE_KEY)
  history.replaceState(null, '', location.pathname + location.search + (saved?.back ?? ''))
  if (!saved || h.get('state') !== saved.state) {
    redirectError = 'Respuesta de Google no válida, vuelve a intentarlo'
    return
  }
  const err = h.get('error')
  if (err) {
    // prompt=none falla si hace falta interacción: no es un error para el usuario
    if (err === 'interaction_required' || err === 'login_required' || err === 'consent_required') {
      localStorage.removeItem(CONNECTED_KEY)
    } else {
      redirectError = err === 'access_denied' ? 'Has cancelado el acceso' : `Google: ${err}`
    }
    return
  }
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token: h.get('access_token'), exp: Date.now() + Number(h.get('expires_in') ?? 3600) * 1000 }),
  )
  localStorage.setItem(CONNECTED_KEY, '1')
})()

async function token(): Promise<string> {
  const t = storedToken()
  if (!t) throw new Error('Sesión de Google caducada: pulsa Conectar')
  return t
}

async function gapi<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    throw new Error('Sesión de Google caducada: pulsa Conectar')
  }
  if (res.status === 403) {
    const j = await res.json().catch(() => null)
    const msg: string = j?.error?.message ?? ''
    if (/has not been used|is disabled/i.test(msg)) throw new Error('Activa la API en Google Cloud (Biblioteca de APIs)')
    if (/insufficient/i.test(msg)) throw new Error('Faltan permisos: desconecta y vuelve a conectar marcando todas las casillas')
    throw new Error(`Google API 403: ${msg}`)
  }
  if (!res.ok) throw new Error(`Google API ${res.status}`)
  return res.json()
}

// ---------- Calendar ----------

export interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  color: string
  calendar: string
  location?: string
  link?: string
  source: 'google' | 'local'
  kind?: 'event' | 'birthday' | 'reminder'
}

interface GCalendar {
  id: string
  summary: string
  backgroundColor: string
  selected?: boolean
}
interface GEvent {
  id: string
  summary?: string
  location?: string
  htmlLink: string
  eventType?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
}

export async function fetchCalendarEvents(from: Date, to: Date): Promise<CalEvent[]> {
  const list = await gapi<{ items: GCalendar[] }>(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
  )
  const cals = list.items.filter((c) => c.selected !== false)
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const results = await Promise.allSettled(
    cals.map(async (cal) => {
      const r = await gapi<{ items: GEvent[] }>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
      )
      return r.items.map<CalEvent>((e) => {
        const allDay = Boolean(e.start.date)
        return {
          id: `${cal.id}:${e.id}`,
          title: e.summary || '(sin título)',
          start: new Date(e.start.dateTime ?? e.start.date + 'T00:00'),
          end: new Date(e.end.dateTime ?? e.end.date + 'T00:00'),
          allDay,
          color: cal.backgroundColor,
          calendar: cal.summary,
          location: e.location,
          link: e.htmlLink,
          source: 'google',
          kind: e.eventType === 'birthday' ? 'birthday' : 'event',
        }
      })
    }),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

// ---------- Gmail ----------

export interface Mail {
  id: string
  from: string
  subject: string
  snippet: string
  date: Date
  unread: boolean
  link: string
}

export async function fetchInbox(max = 12): Promise<{ mails: Mail[]; unreadCount: number }> {
  const [list, label] = await Promise.all([
    gapi<{ messages?: { id: string }[] }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent('in:inbox category:primary')}`,
    ),
    gapi<{ messagesUnread: number }>('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX'),
  ])
  const mails = await Promise.all(
    (list.messages ?? []).map(async ({ id }) => {
      const m = await gapi<{
        id: string
        snippet: string
        labelIds: string[]
        internalDate: string
        payload: { headers: { name: string; value: string }[] }
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      )
      const header = (n: string) => m.payload.headers.find((h) => h.name === n)?.value ?? ''
      return {
        id: m.id,
        from: header('From').replace(/<.*>/, '').replace(/"/g, '').trim() || header('From'),
        subject: header('Subject') || '(sin asunto)',
        snippet: decodeEntities(m.snippet),
        date: new Date(Number(m.internalDate)),
        unread: m.labelIds.includes('UNREAD'),
        link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
      }
    }),
  )
  return { mails, unreadCount: label.messagesUnread }
}

function decodeEntities(s: string) {
  const t = document.createElement('textarea')
  t.innerHTML = s
  return t.value
}

// ---------- Estado de conexión ----------

export function useGoogle() {
  const [connected, setConnected] = useState(() => Boolean(storedToken()))
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY))
  const [error, setError] = useState<string | null>(redirectError)

  useEffect(() => {
    if (!googleConfigured) return
    if (storedToken()) {
      gapi<{ email: string }>('https://www.googleapis.com/oauth2/v3/userinfo')
        .then((p) => {
          setEmail(p.email)
          localStorage.setItem(EMAIL_KEY, p.email)
        })
        .catch(() => {})
      // Al caducar el token, pasamos a desconectado (el botón permite reconectar)
      const t = setTimeout(() => setConnected(false), Math.max(0, tokenExpiry() - 60_000 - Date.now()))
      return () => clearTimeout(t)
    }
  }, [connected])

  // Al abrir el dashboard, si ya se conectó antes y el token caducó, lo renovamos
  // en silencio (como mucho una vez por minuto, para no entrar en bucle).
  useEffect(() => {
    if (!googleConfigured || storedToken() || !localStorage.getItem(CONNECTED_KEY)) return
    const last = Number(sessionStorage.getItem(SILENT_KEY) ?? 0)
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem(SILENT_KEY, String(Date.now()))
      startAuth('none')
    }
  }, [])

  const connect = useCallback(() => {
    setError(null)
    try {
      startAuth('consent')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const disconnect = useCallback(() => {
    const t = storedToken()
    if (t) fetch(`https://oauth2.googleapis.com/revoke?token=${t}`, { method: 'POST' }).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(CONNECTED_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setConnected(false)
    setEmail(null)
  }, [])

  return { configured: googleConfigured, connected, email, error, connect, disconnect }
}
