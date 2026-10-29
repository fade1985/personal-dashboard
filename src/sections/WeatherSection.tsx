import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Clock, CloudSun, LocateFixed, Plus, RefreshCw, Search, X } from 'lucide-react'
import { DayStrip, HourlyStrip, WeatherHero } from '../components/WeatherParts'
import { Card, CardTitle, capitalize } from '../components/ui'
import { SECTION_COLOR } from '../lib/nav'
import { sameDay } from '../lib/events'
import { useForecast, useHere, useSavedPlaces } from '../lib/useWeather'
import { MADRID, searchPlace, type Place } from '../lib/weather'
import { usePersistentState } from '../lib/storage'

export default function WeatherSection() {
  const { here, locating, error: hereError, refresh } = useHere()
  const [places, setPlaces] = useSavedPlaces()
  const [sel, setSel] = usePersistentState<string>('weather-selected', 'here')
  const [day, setDay] = useState(0)

  // Sin ubicación disponible, "donde estoy" muestra Madrid
  const place: Place | null =
    sel === 'here' ? here ?? (hereError ? MADRID : null) : places.find((p) => p.name === sel) ?? MADRID
  const { data, error, loading, reload } = useForecast(place)

  const dayHours = useMemo(() => {
    if (!data) return []
    const d = data.days[day]?.date
    return d ? data.hours.filter((h) => sameDay(h.time, d)) : []
  }, [data, day])

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ '--c': SECTION_COLOR.weather } as CSSProperties}><CloudSun size={13} /> Previsión</div>
          <h1>El tiempo</h1>
          <p>Hoy y los próximos 7 días, hora a hora</p>
        </div>
        <button className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="chips">
          <button className={`chip ${sel === 'here' ? 'active' : ''}`} onClick={() => { setSel('here'); refresh() }}>
            <LocateFixed size={13} style={{ verticalAlign: -2 }} /> {locating ? 'Localizando…' : here?.name ?? 'Donde estoy'}
          </button>
          {places.map((p) => (
            <button key={p.name} className={`chip ${sel === p.name ? 'active' : ''}`} onClick={() => setSel(p.name)}>
              {p.name.split(',')[0]}
              {p.name !== MADRID.name && (
                <X
                  size={12}
                  style={{ marginLeft: 6, verticalAlign: -1 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPlaces((ps) => ps.filter((x) => x.name !== p.name))
                    if (sel === p.name) setSel(MADRID.name)
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <PlaceSearch
          onPick={(p) => {
            setPlaces((ps) => (ps.some((x) => x.name === p.name) ? ps : [...ps, p]))
            setSel(p.name)
          }}
        />
      </div>

      {sel === 'here' && !here && hereError && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <LocateFixed size={15} /> No tengo permiso de ubicación, así que te muestro Madrid. Permítela en el navegador para ver dónde estás.
        </div>
      )}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {!data ? (
        <div className="grid">
          <div className="skeleton" style={{ height: 220 }} />
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      ) : (
        <div className="grid">
          <WeatherHero f={data} name={place?.name ?? ''} />
          <DayStrip days={data.days} selected={day} onSelect={setDay} />
          <Card i={2} accent={SECTION_COLOR.weather}>
            <CardTitle
              icon={<Clock size={16} />} color={SECTION_COLOR.weather}
              title={<>Por horas <span className="muted" style={{ fontWeight: 400 }}>· {capitalize(data.days[day].date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</span></>}
              right={<span className="faint" style={{ fontSize: 12 }}>Actualizado {new Date(data.fetchedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
            />
            <HourlyStrip key={`${place?.name}-${day}`} hours={dayHours} />
          </Card>
        </div>
      )}
    </>
  )
}

function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(() => searchPlace(q).then(setResults).catch(() => setResults([])), 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="place-search">
      <div className="row" style={{ gap: 6 }}>
        <Search size={16} className="muted" />
        <input
          className="input"
          placeholder="Añadir ciudad…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ width: 200 }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="place-results">
          {results.map((p) => (
            <button key={`${p.lat},${p.lon}`} onClick={() => { onPick(p); setQ(''); setResults([]) }}>
              <Plus size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
