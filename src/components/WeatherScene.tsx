// Escena animada de fondo según el código WMO (sol, luna y estrellas, nubes, lluvia, nieve, tormenta, niebla).

type Kind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

export function sceneKind(code: number): Kind {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51) return 'rain'
  if (code >= 45) return 'fog'
  if (code === 3) return 'cloudy'
  if (code >= 1) return 'partly'
  return 'clear'
}

// Posiciones pseudoaleatorias pero estables entre renders
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export default function WeatherScene({ code, isDay, density = 1 }: { code: number; isDay: boolean; density?: number }) {
  const kind = sceneKind(code)
  const clouds = kind === 'partly' ? 2 : kind === 'cloudy' || kind === 'rain' || kind === 'storm' || kind === 'snow' ? 4 : 0
  const drops = kind === 'rain' ? 40 : kind === 'storm' ? 60 : 0
  const flakes = kind === 'snow' ? 40 : 0
  const stars = !isDay && (kind === 'clear' || kind === 'partly') ? 40 : 0

  return (
    <div className="scene" aria-hidden>
      {Array.from({ length: Math.round(stars * density) }, (_, i) => (
        <span key={`s${i}`} className="star" style={{
          left: `${rnd(i, 1) * 100}%`, top: `${rnd(i, 2) * 70}%`,
          animationDelay: `${rnd(i, 3) * 4}s`, transform: `scale(${0.5 + rnd(i, 4)})`,
        }} />
      ))}
      {(kind === 'clear' || kind === 'partly') && (isDay ? <div className="sun"><div className="sun-rays" /></div> : <div className="moon" />)}
      {Array.from({ length: clouds }, (_, i) => (
        <div key={`c${i}`} className={`cloud ${kind === 'storm' || kind === 'rain' ? 'dark' : ''}`} style={{
          top: `${8 + rnd(i, 5) * 40}%`, animationDuration: `${40 + rnd(i, 6) * 40}s`,
          animationDelay: `${-rnd(i, 7) * 60}s`, transform: `scale(${0.7 + rnd(i, 8) * 0.8})`,
        }} />
      ))}
      {Array.from({ length: Math.round(drops * density) }, (_, i) => (
        <span key={`d${i}`} className="drop" style={{
          left: `${rnd(i, 9) * 100}%`, animationDelay: `${rnd(i, 10) * 1.2}s`, animationDuration: `${0.5 + rnd(i, 11) * 0.5}s`,
        }} />
      ))}
      {Array.from({ length: Math.round(flakes * density) }, (_, i) => (
        <span key={`f${i}`} className="flake" style={{
          left: `${rnd(i, 12) * 100}%`, animationDelay: `${rnd(i, 13) * 6}s`, animationDuration: `${4 + rnd(i, 14) * 4}s`,
          width: 3 + rnd(i, 15) * 4, height: 3 + rnd(i, 15) * 4,
        }} />
      ))}
      {kind === 'storm' && <div className="flash" />}
      {kind === 'fog' && [0, 1, 2].map((i) => <div key={i} className="fog" style={{ top: `${25 + i * 22}%`, animationDelay: `${-i * 7}s` }} />)}
    </div>
  )
}
