import { useCallback, useEffect, useState } from 'react'
import { fetchForecast, locateMe, MADRID, type Forecast, type Place } from './weather'
import { usePersistentState } from './storage'

const cache = new Map<string, Forecast>()
const TTL = 15 * 60 * 1000
const keyOf = (p: Place) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

export function useForecast(place: Place | null) {
  const [data, setData] = useState<Forecast | null>(() => (place ? cache.get(keyOf(place)) ?? null : null))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const k = place ? keyOf(place) : null
  const load = useCallback(
    async (force = false) => {
      if (!place || !k) return
      const hit = cache.get(k)
      if (hit && !force && Date.now() - hit.fetchedAt < TTL) {
        setData(hit)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const f = await fetchForecast(place)
        cache.set(k, f)
        setData(f)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [k],
  )

  useEffect(() => {
    load()
    const t = setInterval(() => load(), TTL)
    return () => clearInterval(t)
  }, [load])

  return { data, error, loading, reload: () => load(true) }
}

/** "Donde estoy": última ubicación conocida, refrescada al montar. */
export function useHere() {
  const [here, setHere] = usePersistentState<Place | null>('here', null)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const refresh = useCallback(async () => {
    setLocating(true)
    setError(null)
    try {
      const p = await locateMe()
      setHere((prev) =>
        prev && Math.abs(prev.lat - p.lat) < 0.01 && Math.abs(prev.lon - p.lon) < 0.01 ? prev : p,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLocating(false)
    }
  }, [setHere])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { here, error, locating, refresh }
}

export function useSavedPlaces() {
  return usePersistentState<Place[]>('weather-places', [MADRID])
}
