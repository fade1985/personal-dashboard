// Open-Meteo: gratis y sin API key. https://open-meteo.com

export interface Place {
  name: string
  lat: number
  lon: number
}

export interface HourPoint {
  time: Date
  temp: number
  feels: number
  rainProb: number
  rain: number
  wind: number
  code: number
  isDay: boolean
}

export interface DayPoint {
  date: Date
  max: number
  min: number
  code: number
  rainProb: number
  sunrise: Date
  sunset: Date
  uv: number
}

export interface Forecast {
  current: HourPoint
  hours: HourPoint[]
  days: DayPoint[]
  fetchedAt: number
}

export const MADRID: Place = { name: 'Madrid', lat: 40.4165, lon: -3.70256 }

export async function fetchForecast(p: Place): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    timezone: 'auto',
    forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    hourly:
      'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const d = await res.json()
  const h = d.hourly
  const hours: HourPoint[] = h.time.map((t: string, i: number) => ({
    time: new Date(t),
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    rainProb: h.precipitation_probability[i] ?? 0,
    rain: h.precipitation[i] ?? 0,
    wind: h.wind_speed_10m[i],
    code: h.weather_code[i],
    isDay: h.is_day[i] === 1,
  }))
  const dl = d.daily
  const days: DayPoint[] = dl.time.map((t: string, i: number) => ({
    date: new Date(t + 'T00:00'),
    max: dl.temperature_2m_max[i],
    min: dl.temperature_2m_min[i],
    code: dl.weather_code[i],
    rainProb: dl.precipitation_probability_max[i] ?? 0,
    sunrise: new Date(dl.sunrise[i]),
    sunset: new Date(dl.sunset[i]),
    uv: dl.uv_index_max[i] ?? 0,
  }))
  const c = d.current
  return {
    current: {
      time: new Date(c.time),
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      rainProb: hours.find((x) => x.time >= new Date(c.time))?.rainProb ?? 0,
      rain: c.precipitation,
      wind: c.wind_speed_10m,
      code: c.weather_code,
      isDay: c.is_day === 1,
    },
    hours,
    days,
    fetchedAt: Date.now(),
  }
}

/** Ubicación actual del navegador + nombre de la ciudad (BigDataCloud, sin key). */
export function locateMe(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalización no disponible'))
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = coords.latitude
        const lon = coords.longitude
        let name = `${lat.toFixed(2)}, ${lon.toFixed(2)}`
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`,
          )
          const j = await r.json()
          name = j.city || j.locality || j.principalSubdivision || name
        } catch {
          /* nos quedamos con las coordenadas */
        }
        resolve({ name, lat, lon })
      },
      (err) => reject(new Error(err.message)),
      { timeout: 10000, maximumAge: 15 * 60 * 1000 },
    )
  })
}

export async function searchPlace(q: string): Promise<Place[]> {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=es`,
  )
  const j = await r.json()
  return (j.results ?? []).map((x: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
    name: [x.name, x.admin1 && x.admin1 !== x.name ? x.admin1 : null, x.country].filter(Boolean).join(', '),
    lat: x.latitude,
    lon: x.longitude,
  }))
}

// Códigos WMO → icono + descripción
const WMO: Record<number, [string, string, string]> = {
  0: ['☀️', '🌙', 'Despejado'],
  1: ['🌤️', '🌙', 'Casi despejado'],
  2: ['⛅', '☁️', 'Parcialmente nuboso'],
  3: ['☁️', '☁️', 'Nublado'],
  45: ['🌫️', '🌫️', 'Niebla'],
  48: ['🌫️', '🌫️', 'Niebla con escarcha'],
  51: ['🌦️', '🌧️', 'Llovizna débil'],
  53: ['🌦️', '🌧️', 'Llovizna'],
  55: ['🌧️', '🌧️', 'Llovizna intensa'],
  56: ['🌧️', '🌧️', 'Llovizna helada'],
  57: ['🌧️', '🌧️', 'Llovizna helada intensa'],
  61: ['🌦️', '🌧️', 'Lluvia débil'],
  63: ['🌧️', '🌧️', 'Lluvia'],
  65: ['🌧️', '🌧️', 'Lluvia intensa'],
  66: ['🌧️', '🌧️', 'Lluvia helada'],
  67: ['🌧️', '🌧️', 'Lluvia helada intensa'],
  71: ['🌨️', '🌨️', 'Nieve débil'],
  73: ['🌨️', '🌨️', 'Nieve'],
  75: ['❄️', '❄️', 'Nieve intensa'],
  77: ['🌨️', '🌨️', 'Granizo fino'],
  80: ['🌦️', '🌧️', 'Chubascos débiles'],
  81: ['🌧️', '🌧️', 'Chubascos'],
  82: ['⛈️', '⛈️', 'Chubascos fuertes'],
  85: ['🌨️', '🌨️', 'Chubascos de nieve'],
  86: ['❄️', '❄️', 'Chubascos de nieve fuertes'],
  95: ['⛈️', '⛈️', 'Tormenta'],
  96: ['⛈️', '⛈️', 'Tormenta con granizo'],
  99: ['⛈️', '⛈️', 'Tormenta fuerte con granizo'],
}

export function wmoIcon(code: number, isDay = true) {
  const w = WMO[code] ?? WMO[3]
  return isDay ? w[0] : w[1]
}

export function wmoText(code: number) {
  return (WMO[code] ?? WMO[3])[2]
}

/** Gradiente de fondo según el tiempo, para tarjetas "vivas". */
export function wmoGradient(code: number, isDay: boolean) {
  if (!isDay) return 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)'
  if (code >= 95) return 'linear-gradient(135deg, #334155 0%, #475569 50%, #6b21a8 100%)'
  if (code >= 71 && code <= 86 && code !== 80 && code !== 81 && code !== 82)
    return 'linear-gradient(135deg, #64748b 0%, #94a3b8 50%, #cbd5e1 100%)'
  if (code >= 51) return 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #64748b 100%)'
  if (code >= 45) return 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)'
  if (code >= 2) return 'linear-gradient(135deg, #0369a1 0%, #38bdf8 60%, #94a3b8 100%)'
  return 'linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #fbbf24 120%)'
}
