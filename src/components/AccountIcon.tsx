import { useState } from 'react'
import type { Account } from '../lib/finance'

/** Web de cada entidad conocida, para sacar su icono. */
const KNOWN: [RegExp, string][] = [
  [/santander/i, 'bancosantander.es'],
  [/caixa/i, 'caixabank.es'],
  [/carrefour/i, 'carrefour.es'],
  [/paypal/i, 'paypal.com'],
  [/wise/i, 'wise.com'],
  [/trade ?republic/i, 'traderepublic.com'],
  [/bbva/i, 'bbva.es'],
  [/sabadell/i, 'bancsabadell.com'],
  [/bankinter/i, 'bankinter.com'],
  [/ing\b/i, 'ing.es'],
  [/openbank/i, 'openbank.es'],
  [/revolut/i, 'revolut.com'],
  [/n26/i, 'n26.com'],
  [/unicaja/i, 'unicajabanco.es'],
  [/kutxa/i, 'kutxabank.es'],
  [/abanca/i, 'abanca.com'],
  [/myinvestor/i, 'myinvestor.es'],
  [/indexa/i, 'indexacapital.com'],
  [/degiro/i, 'degiro.es'],
  [/scalable/i, 'scalable.capital'],
  [/binance/i, 'binance.com'],
  [/coinbase/i, 'coinbase.com'],
  [/amex|american express/i, 'americanexpress.com'],
]

export const accountDomain = (a: Pick<Account, 'name' | 'domain'>) =>
  a.domain?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || KNOWN.find(([re]) => re.test(a.name))?.[1] || ''

/** Icono de la web del banco; si no hay o no carga, el emoji de la cuenta. */
export function AccountIcon({ a, className = 'acct-logo' }: { a: Account; className?: string }) {
  const domain = accountDomain(a)
  const [failed, setFailed] = useState<string | null>(null)
  const ok = domain && failed !== domain
  if (a.logo) return <div className={`${className} img own`}><img src={a.logo} alt="" /></div>
  return (
    <div className={`${className} ${ok ? 'img' : ''}`}>
      {ok ? (
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt="" loading="lazy" onError={() => setFailed(domain)}
          // Google devuelve un globo genérico de 16 px cuando no conoce la web
          onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(domain)} />
      ) : a.emoji}
    </div>
  )
}

/** Reduce una imagen subida a un PNG cuadrado de 96 px (cabe de sobra en la sincronización). */
export function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = 96
      const c = document.createElement('canvas')
      c.width = c.height = size
      const ctx = c.getContext('2d')!
      const k = Math.min(size / img.width, size / img.height)
      const w = img.width * k, h = img.height * k
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No es una imagen')) }
    img.src = url
  })
}
