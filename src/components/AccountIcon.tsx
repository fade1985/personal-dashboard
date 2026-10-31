import { useState } from 'react'
import type { Account } from '../lib/finance'

/** Web de cada entidad conocida, para sacar su icono. */
const KNOWN: [RegExp, string][] = [
  [/santander/i, 'santander.es'],
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
