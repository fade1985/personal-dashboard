// Cotizaciones para la cartera (Vercel). Los ISIN se cotizan en LS Exchange (Lang & Schwarz, el mercado
// de Trade Republic, así el precio coincide con la app); si no está ahí, o con un símbolo, Yahoo Finance.
//   /api/quote?q=US84615Q1031&q=AAPL  → precio actual en euros de cada ISIN o símbolo
//   /api/quote?search=spacex          → candidatos (símbolo, mercado) para elegir el bueno
// Los precios en otras monedas se pasan a euros con el cambio del momento.

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mi-dashboard)' }
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

// Mercados en euros, por preferencia (los alemanes son los que más se parecen a Trade Republic)
const EUR_SUFFIX = ['.DE', '.F', '.MU', '.SG', '.BE', '.DU', '.HM', '.VI', '.PA', '.AS', '.MI', '.MC', '.BR', '.LS']

interface Candidate { symbol: string; name: string; exchange: string; type: string }

export interface Quote {
  symbol: string
  name: string
  exchange: string
  currency: string
  /** En euros */
  price: number
  prevClose: number
  /** Precio en la moneda del mercado */
  native: number
  time: number
  /** Precios del día (euros), cada 5 minutos */
  spark: number[]
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  return res.json() as Promise<T>
}

async function search(q: string): Promise<Candidate[]> {
  type R = { quotes?: { symbol: string; shortname?: string; longname?: string; exchDisp?: string; exchange?: string; quoteType?: string }[] }
  const r = await json<R>(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`)
  return (r.quotes ?? []).filter((x) => x.symbol).map((x) => ({
    symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, exchange: x.exchDisp ?? x.exchange ?? '', type: x.quoteType ?? '',
  }))
}

interface Chart {
  symbol: string; name: string; exchange: string; currency: string; price: number; prevClose: number; time: number; closes: number[]
}

async function chart(symbol: string): Promise<Chart> {
  type R = { chart: { result?: { meta: Record<string, unknown>; indicators: { quote: { close?: (number | null)[] }[] } }[]; error?: { description?: string } } }
  const r = await json<R>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`)
  const res = r.chart.result?.[0]
  if (!res) throw new Error(r.chart.error?.description ?? 'Sin datos')
  const m = res.meta as Record<string, number & string>
  let price = Number(m.regularMarketPrice)
  let prev = Number(m.chartPreviousClose ?? m.previousClose ?? price)
  let closes = (res.indicators.quote[0]?.close ?? []).filter((v): v is number => v != null)
  let currency = String(m.currency ?? 'EUR')
  // Bolsa de Londres: cotiza en peniques
  if (currency === 'GBp' || currency === 'GBX') {
    price /= 100; prev /= 100; closes = closes.map((v) => v / 100); currency = 'GBP'
  }
  return {
    symbol: String(m.symbol ?? symbol), name: String(m.longName ?? m.shortName ?? symbol),
    exchange: String(m.fullExchangeName ?? m.exchangeName ?? ''), currency, price, prevClose: prev,
    time: Number(m.regularMarketTime ?? 0) * 1000, closes,
  }
}

const fx = new Map<string, Promise<number>>()
const toEur = (cur: string) => {
  if (cur === 'EUR') return Promise.resolve(1)
  if (!fx.has(cur)) fx.set(cur, chart(`${cur}EUR=X`).then((c) => c.price))
  return fx.get(cur)!
}

async function inEur(c: Chart): Promise<Quote> {
  const k = await toEur(c.currency)
  return {
    symbol: c.symbol, name: c.name, exchange: c.exchange, currency: c.currency, native: c.price, time: c.time,
    price: c.price * k, prevClose: c.prevClose * k, spark: c.closes.map((v) => v * k),
  }
}

// --- Lang & Schwarz: los mismos datos que usan las gráficas de su web ---
const LS = 'https://www.ls-x.de/_rpc/json'
const LS_EXCHANGE = 2

/** Las horas de L&S son la hora de Fráncfort escrita como si fuera UTC: las pasamos a UTC de verdad. */
function fromBerlin(ts: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(ts).map((x) => [x.type, Number(x.value)]))
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ts / 1000) * 1000
  return ts - offset
}

async function lsQuote(isin: string): Promise<Quote> {
  type S = { id: number; displayname: string; isin: string }[]
  const hit = (await json<S>(`${LS}/.lstc/instrument/search/main?q=${isin}&localeId=1`)).find((x) => x.isin === isin)
  if (!hit) throw new Error('No está en Lang & Schwarz')
  type C = { info: { plotlines?: { id: string; value: number }[] }; series: { intraday?: { data: [number, number][] } } }
  const c = await json<C>(`${LS}/instrument/chart/dataForInstrument?instrumentId=${hit.id}&marketId=${LS_EXCHANGE}&quotetype=mid&series=intraday&type=mini&localeId=1`)
  const data = c.series.intraday?.data ?? []
  const last = data.at(-1)
  if (!last) throw new Error('Lang & Schwarz sin precios')
  const prev = c.info.plotlines?.find((p) => p.id === 'previousDay')?.value ?? data[0][1]
  // Un punto cada ~5 minutos basta para la minigráfica
  const step = Math.max(1, Math.round(data.length / 120))
  const spark = data.filter((_, i) => i % step === 0).map((d) => d[1])
  if (spark.at(-1) !== last[1]) spark.push(last[1])
  return {
    symbol: isin, name: hit.displayname, exchange: 'LS Exchange', currency: 'EUR',
    price: last[1], native: last[1], prevClose: prev, time: fromBerlin(last[0]), spark,
  }
}

/** Un ISIN va primero a Lang & Schwarz. En Yahoo puede cotizar en varios mercados: nos quedamos con el que se haya movido más recientemente,
 *  prefiriendo uno en euros si van a la par. Un símbolo se consulta tal cual. */
async function resolve(q: string): Promise<Quote> {
  if (!ISIN.test(q)) return inEur(await chart(q))
  try {
    return await lsQuote(q)
  } catch {
    // Seguimos con Yahoo
  }
  const found = (await search(q)).filter((c) => c.type !== 'OPTION')
  if (!found.length) throw new Error('No encontrado: elige el símbolo a mano')
  const eur = EUR_SUFFIX.map((s) => found.find((c) => c.symbol.endsWith(s))).find(Boolean)
  const picks = [...new Set([found[0].symbol, eur?.symbol].filter(Boolean) as string[])]
  const charts = (await Promise.allSettled(picks.map(chart))).flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!charts.length) throw new Error('Sin cotización')
  // 15 minutos de margen a favor del mercado en euros
  charts.sort((a, b) => (b.time + (b.currency === 'EUR' ? 15 * 60e3 : 0)) - (a.time + (a.currency === 'EUR' ? 15 * 60e3 : 0)))
  return inEur(charts[0])
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const text = url.searchParams.get('search')
  try {
    if (text) {
      return Response.json(await search(text.slice(0, 60)), { headers: { 'cache-control': 's-maxage=3600' } })
    }
    const qs = [...new Set(url.searchParams.getAll('q').map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30)
    if (!qs.length) return Response.json({ error: 'Falta ?q=' }, { status: 400 })
    if (qs.some((q) => !/^[A-Z0-9.=^-]{1,20}$/.test(q))) return Response.json({ error: 'Símbolo no válido' }, { status: 400 })
    fx.clear()
    const out: Record<string, Quote | { error: string }> = {}
    await Promise.all(qs.map(async (q) => {
      try {
        out[q] = await resolve(q)
      } catch (e) {
        out[q] = { error: (e as Error).message }
      }
    }))
    // Un minuto en el CDN: varias pestañas o dispositivos comparten la consulta
    return Response.json(out, { headers: { 'cache-control': 's-maxage=60, stale-while-revalidate=60' } })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
