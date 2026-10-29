import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import {
  ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileUp, Landmark, Pencil, PiggyBank,
  Plus, Search, Trash2, TrendingDown, TrendingUp, Upload, Wallet, X,
} from 'lucide-react'
import { SECTION_COLOR } from '../lib/nav'
import { Card, CardTitle, CountUp } from '../components/ui'
import {
  CAT, CATEGORIES, KIND_LABEL, applyMapping, categorize, eur, findHeaderRow, guessMapping, headersOf, lastMonths, merchantOf,
  monthFlow, monthKey, netWorth, norm, spendByCategory, txIds, useAccounts, usePrivacy, useRules, useTxs,
  type Account, type AccountKind, type Cell, type ColumnMapping, type Tx,
} from '../lib/finance'

const C = SECTION_COLOR.finance
const today = () => new Date().toISOString().slice(0, 10)
const monthName = (key: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) =>
  new Date(key + '-01T12:00').toLocaleDateString('es-ES', opts)
const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + n, 1))
}

/** Importe en euros que se difumina con el modo privado. */
export function Money({ v, decimals = 2, sign, className = '', style }: { v: number; decimals?: number; sign?: boolean; className?: string; style?: CSSProperties }) {
  const [hide] = usePrivacy()
  return <span className={`money ${hide ? 'hidden' : ''} ${className}`} style={style}>{sign && v > 0 ? '+' : ''}{eur(v, decimals)}</span>
}

export default function Finance() {
  const [accounts, setAccounts] = useAccounts()
  const [txs, setTxs] = useTxs()
  const [rules] = useRules()
  const [hide, setHide] = usePrivacy()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [pending, setPending] = useState<{ file: File; accountId?: string } | null>(null)
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickFor = useRef<string | undefined>(undefined)

  // Si el mes actual aún no tiene datos, empezamos por el último mes con movimientos
  useEffect(() => {
    if (!txs.length || txs.some((t) => t.date.startsWith(month))) return
    const last = txs.reduce((m, t) => (t.date > m ? t.date : m), '')
    setMonth(monthKey(last))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs.length])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const worth = useMemo(() => netWorth(accounts, txs), [accounts, txs])
  const flow = useMemo(() => monthFlow(txs, month), [txs, month])
  const prev = useMemo(() => monthFlow(txs, shiftMonth(month, -1)), [txs, month])
  const months = useMemo(() => lastMonths(12, month > monthKey(new Date()) ? month : monthKey(new Date())).map((k) => monthFlow(txs, k)), [txs, month])
  const cats = useMemo(() => spendByCategory(txs, month), [txs, month])

  const openPicker = (accountId?: string) => {
    pickFor.current = accountId
    fileRef.current?.click()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setPending({ file })
  }

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ accounts, txs, rules, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finanzas-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const savedRate = flow.income > 0 ? flow.saved / flow.income : null
  const expenseDelta = prev.expense > 0 ? (flow.expense - prev.expense) / prev.expense : null

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={onDrop}
    >
      <input
        ref={fileRef} type="file" hidden accept=".csv,.xlsx,.xls,.txt,.ods"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setPending({ file, accountId: pickFor.current })
          e.target.value = ''
        }}
      />

      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ '--c': C } as CSSProperties}><Landmark size={13} /> Bancos y gastos</div>
          <h1>Finanzas</h1>
          <p>{txs.length ? `${txs.length.toLocaleString('es-ES')} movimientos en ${accounts.length} cuentas` : 'Importa los movimientos que exporta tu banco (CSV o Excel)'}</p>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => setHide(!hide)} title={hide ? 'Mostrar importes' : 'Ocultar importes'}>
            {hide ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          {txs.length > 0 && <button className="icon-btn" onClick={exportBackup} title="Copia de seguridad (JSON)"><Download size={17} /></button>}
          <button className="btn primary" onClick={() => openPicker()}><Upload size={15} /> Importar movimientos</button>
        </div>
      </div>

      <div className="bento">
        {/* Patrimonio */}
        <Card className="span-8 fin-hero" i={0} accent={C}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: '1 1 260px' }}>
              <div className="muted" style={{ fontSize: 13 }}>Patrimonio neto</div>
              <div className={`fin-total money ${hide ? 'hidden' : ''}`}>
                <CountUp value={worth.total} /> <span>€</span>
              </div>
              <div className="fin-split">
                <SplitBar parts={[
                  { label: 'Cuentas', value: worth.liquid, color: C },
                  { label: 'Inversiones', value: worth.invest, color: '#22d3ee' },
                ]} />
                <div className="row" style={{ gap: 18, fontSize: 13, flexWrap: 'wrap' }}>
                  <span><i className="dot" style={{ background: C }} /> Cuentas <Money v={worth.liquid} decimals={0} /></span>
                  <span><i className="dot" style={{ background: '#22d3ee' }} /> Inversiones <Money v={worth.invest} decimals={0} /></span>
                  {worth.debt !== 0 && <span><i className="dot" style={{ background: 'var(--red)' }} /> Tarjetas <Money v={worth.debt} decimals={0} /></span>}
                </div>
              </div>
            </div>
            <div className="month-switch">
              <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button>
              <span className="cap">{monthName(month)}</span>
              <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKey(new Date())}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="stat-tiles">
            <div className="stat-tile" style={{ '--c': 'var(--green)' } as CSSProperties}>
              <div className="v"><Money v={flow.income} decimals={0} /></div>
              <div className="l"><ArrowUpRight size={12} /> ingresos</div>
            </div>
            <div className="stat-tile" style={{ '--c': 'var(--rose)' } as CSSProperties}>
              <div className="v"><Money v={flow.expense} decimals={0} /></div>
              <div className="l">
                <ArrowDownRight size={12} /> gastos
                {expenseDelta != null && (
                  <span className={`delta ${expenseDelta > 0 ? 'bad' : 'good'}`}>
                    {expenseDelta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {Math.abs(Math.round(expenseDelta * 100))}%
                  </span>
                )}
              </div>
            </div>
            <div className="stat-tile" style={{ '--c': flow.saved >= 0 ? C : 'var(--red)' } as CSSProperties}>
              <div className="v"><Money v={flow.saved} decimals={0} sign /></div>
              <div className="l"><PiggyBank size={12} /> ahorro{savedRate != null && ` · ${Math.round(savedRate * 100)}%`}</div>
            </div>
          </div>
        </Card>

        {/* Gasto por categoría */}
        <Card className="span-4" i={1} accent={C} style={{ height: '100%' }}>
          <CardTitle icon={<Wallet size={16} />} color={C} title={<span className="cap">Gastos de {monthName(month, { month: 'long' })}</span>} />
          {cats.length ? <Donut items={cats} total={flow.expense} /> : (
            <div className="empty"><div className="big">🧾</div><p>Sin gastos este mes</p></div>
          )}
        </Card>

        {/* Evolución */}
        <Card className="span-12" i={2} accent={C}>
          <CardTitle
            icon={<TrendingUp size={16} />} color={C} title="Últimos 12 meses"
            right={<div className="row faint" style={{ gap: 14, fontSize: 12 }}><span><i className="dot" style={{ background: C }} /> Ingresos</span><span><i className="dot" style={{ background: 'var(--rose)' }} /> Gastos</span></div>}
          />
          <CashflowBars data={months} selected={month} onSelect={setMonth} />
        </Card>

        {/* Cuentas */}
        <div className="span-12">
          <div className="section-title">
            <h2>Cuentas</h2>
            <button className="btn sm ghost" onClick={() => setEditing('new')}><Plus size={14} /> Nueva cuenta</button>
          </div>
          <div className="acct-grid">
            {accounts.map((a, k) => (
              <AccountCard
                key={a.id} a={a} i={k + 3} balance={worth.balances[a.id]} count={txs.filter((t) => t.accountId === a.id).length}
                onImport={() => openPicker(a.id)} onEdit={() => setEditing(a)}
              />
            ))}
          </div>
        </div>

        <div className="span-12">
          <Movements month={month} accounts={accounts} onToast={setToast} />
        </div>
      </div>

      {dragging && <div className="drag-overlay"><FileUp size={42} /><b>Suelta el archivo para importarlo</b><span>CSV o Excel exportado de tu banco</span></div>}

      {pending && (
        <ImportModal
          file={pending.file} accountId={pending.accountId} onClose={() => setPending(null)}
          onDone={(n, dup) => {
            setPending(null)
            setToast(n ? `✅ ${n} movimientos importados${dup ? ` (${dup} ya estaban)` : ''}` : `Nada nuevo: los ${dup} movimientos ya estaban`)
          }}
        />
      )}
      {editing && (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            setAccounts((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a]))
            setEditing(null)
          }}
          onDelete={(id, withTxs) => {
            if (withTxs) setTxs((l) => l.filter((t) => t.accountId !== id))
            else {
              setAccounts((l) => l.filter((x) => x.id !== id))
              setTxs((l) => l.filter((t) => t.accountId !== id))
            }
            setEditing(null)
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1
  return (
    <div className="split-bar">
      {parts.map((p) => <div key={p.label} title={p.label} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color }} />)}
    </div>
  )
}

// ---------- Gráficos ----------

function Donut({ items, total }: { items: { cat: (typeof CATEGORIES)[number]; value: number }[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const size = 168
  const stroke = 22
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const sum = items.reduce((s, x) => s + x.value, 0)
  let acc = 0
  const active = items.find((x) => x.cat.id === hover)
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={stroke} />
          {items.map((x, k) => {
            const len = (x.value / sum) * circ
            const el = (
              <circle
                key={x.cat.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.cat.color} strokeWidth={hover === x.cat.id ? stroke + 6 : stroke}
                strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-acc}
                style={{ transition: 'stroke-width .2s, opacity .2s', opacity: hover && hover !== x.cat.id ? 0.35 : 1, animation: `donut-in .9s ${k * 60}ms var(--ease) both` }}
                onMouseEnter={() => setHover(x.cat.id)} onMouseLeave={() => setHover(null)}
              />
            )
            acc += len
            return el
          })}
        </svg>
        <div className="donut-label">
          <span style={{ fontSize: active ? 22 : 12 }} className={active ? '' : 'muted'}>{active ? active.cat.emoji : 'Total'}</span>
          <b><Money v={active ? active.value : total} decimals={0} /></b>
          {active && <span className="faint" style={{ fontSize: 11 }}>{Math.round((active.value / sum) * 100)}%</span>}
        </div>
      </div>
      <div className="donut-legend">
        {items.slice(0, 6).map((x) => (
          <div key={x.cat.id} className={`row ${hover === x.cat.id ? 'on' : ''}`} onMouseEnter={() => setHover(x.cat.id)} onMouseLeave={() => setHover(null)}>
            <span>{x.cat.emoji}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.cat.label}</span>
            <Money v={x.value} decimals={0} className="muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CashflowBars({ data, selected, onSelect }: { data: ReturnType<typeof monthFlow>[]; selected: string; onSelect: (k: string) => void }) {
  const [hide] = usePrivacy()
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))
  const H = 170
  return (
    <div className="bars">
      {data.map((d, k) => (
        <button key={d.key} className={`bar-col ${d.key === selected ? 'on' : ''}`} onClick={() => onSelect(d.key)}>
          <div className="bar-tip">
            <span style={{ color: 'var(--green)' }}>+{hide ? '•••' : eur(d.income, 0)}</span>
            <span style={{ color: 'var(--rose)' }}>−{hide ? '•••' : eur(d.expense, 0)}</span>
          </div>
          <div className="bar-pair" style={{ height: H }}>
            <i style={{ height: `${(d.income / max) * 100}%`, background: `linear-gradient(${C}, ${C}55)`, animationDelay: `${k * 40}ms` }} />
            <i style={{ height: `${(Math.max(0, d.expense) / max) * 100}%`, background: 'linear-gradient(var(--rose), #fb718555)', animationDelay: `${k * 40 + 20}ms` }} />
          </div>
          <span className="bar-label cap">{monthName(d.key, { month: 'short' }).replace('.', '')}</span>
        </button>
      ))}
    </div>
  )
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const w = 120, h = 34
  const lo = Math.min(...points), hi = Math.max(...points)
  const xy = points.map((v, i) => [(i / (points.length - 1)) * w, h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)])
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- Cuentas ----------

function AccountCard({ a, i, balance, count, onImport, onEdit }: {
  a: Account; i: number; balance: { value: number; at: string } | null; count: number; onImport: () => void; onEdit: () => void
}) {
  const gain = a.kind === 'invest' && balance && a.invested ? balance.value - a.invested : null
  return (
    <Card className="acct" i={i} accent={a.color} style={{ '--ac': a.color } as CSSProperties}>
      <div className="row" style={{ gap: 12 }}>
        <div className="acct-logo">{a.emoji}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="acct-name">{a.name}</div>
          <div className="faint" style={{ fontSize: 12 }}>{KIND_LABEL[a.kind]}</div>
        </div>
        <button className="icon-btn" onClick={onEdit} title="Editar"><Pencil size={14} /></button>
      </div>
      <div className="acct-balance">
        {balance ? <Money v={balance.value} /> : <span className="faint">—</span>}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, minHeight: 34 }}>
        <div className="faint" style={{ fontSize: 12 }}>
          {gain != null ? (
            <span className={gain >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 600 }}>
              <Money v={gain} sign decimals={0} /> ({Math.round((gain / a.invested!) * 1000) / 10}%)
            </span>
          ) : balance ? `a ${new Date(balance.at + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : a.kind === 'invest' ? 'Anota su valor' : 'Sin datos'}
          {count > 0 && <> · {count} mov.</>}
        </div>
        {a.kind === 'invest' ? <Sparkline points={(a.history ?? []).map((h) => h.value)} color={a.color} /> : (
          <button className="btn sm ghost" onClick={onImport}><Upload size={13} /> Importar</button>
        )}
      </div>
    </Card>
  )
}

const KINDS: AccountKind[] = ['bank', 'card', 'wallet', 'invest']
const COLORS = ['#ec0000', '#0b8fd6', '#2563eb', '#38bdf8', '#9fe870', '#e5e7eb', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa']

function AccountModal({ account, onClose, onSave, onDelete }: {
  account: Account | null; onClose: () => void; onSave: (a: Account) => void; onDelete: (id: string, onlyTxs: boolean) => void
}) {
  const [txs] = useTxs()
  const [a, setA] = useState<Account>(account ?? { id: crypto.randomUUID(), name: '', kind: 'bank', color: COLORS[6], emoji: '🏦' })
  const current = account ? netWorth([account], txs).balances[account.id] : null
  const [value, setValue] = useState(current ? String(current.value).replace('.', ',') : '')
  const [invested, setInvested] = useState(a.invested != null ? String(a.invested).replace('.', ',') : '')
  const count = txs.filter((t) => t.accountId === a.id).length
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/\./g, '').replace(',', '.')))

  const save = () => {
    const v = num(value)
    const next: Account = { ...a, name: a.name.trim() || 'Cuenta', invested: a.kind === 'invest' ? num(invested) : undefined }
    if (v != null && Number.isFinite(v) && (!current || Math.abs(v - current.value) > 0.004)) {
      next.manual = { value: v, at: today() }
      if (a.kind === 'invest') next.history = [...(a.history ?? []).filter((h) => h.at !== today()), { at: today(), value: v }]
    }
    onSave(next)
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose}><X size={18} /></button>
        <h2>{account ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
        <div className="form-grid">
          <div className="row">
            <input className="input" style={{ width: 64, textAlign: 'center', fontSize: 20 }} value={a.emoji} onChange={(e) => setA({ ...a, emoji: e.target.value })} />
            <input className="input" style={{ flex: 1 }} placeholder="Nombre" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} autoFocus={!account} />
          </div>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {KINDS.map((k) => <button key={k} className={a.kind === k ? 'active' : ''} onClick={() => setA({ ...a, kind: k })}>{KIND_LABEL[k]}</button>)}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map((c) => (
              <button key={c} className={`swatch ${a.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setA({ ...a, color: c })} />
            ))}
          </div>
          <label className="field">
            <span>{a.kind === 'invest' ? 'Valor actual (€)' : a.kind === 'card' ? 'Deuda actual (€, en negativo)' : 'Saldo actual (€)'}</span>
            <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
            <small className="faint">
              {a.kind === 'invest'
                ? 'Cada vez que lo actualices se guarda un punto para ver la evolución.'
                : 'Opcional si el archivo del banco trae columna de saldo; los movimientos posteriores se suman solos.'}
            </small>
          </label>
          {a.kind === 'invest' && (
            <label className="field">
              <span>Dinero aportado (€)</span>
              <input className="input" inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value)} placeholder="Para calcular la rentabilidad" />
            </label>
          )}
          <button className="btn primary" onClick={save}>Guardar</button>
          {account && (
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {count > 0 ? (
                <button className="btn sm ghost" onClick={() => confirm(`¿Borrar los ${count} movimientos de ${a.name}?`) && onDelete(a.id, true)}>
                  <Trash2 size={13} /> Borrar {count} movimientos
                </button>
              ) : <span />}
              <button className="btn sm ghost danger" onClick={() => confirm(`¿Eliminar la cuenta ${a.name} y sus movimientos?`) && onDelete(a.id, false)}>
                <Trash2 size={13} /> Eliminar cuenta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Movimientos ----------

function Movements({ month, accounts, onToast }: { month: string; accounts: Account[]; onToast: (s: string) => void }) {
  const [txs, setTxs] = useTxs()
  const [rules, setRules] = useRules()
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState<string>('all')
  const [cat, setCat] = useState<string>('all')
  const [allMonths, setAllMonths] = useState(false)
  const [picking, setPicking] = useState<Tx | null>(null)
  const [limit, setLimit] = useState(80)

  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const list = useMemo(() => {
    const nq = norm(q).trim()
    return txs
      .filter((t) => (allMonths || t.date.startsWith(month)) && (acc === 'all' || t.accountId === acc) && (cat === 'all' || t.category === cat) && (!nq || norm(t.desc).includes(nq)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  }, [txs, q, acc, cat, month, allMonths])

  useEffect(() => setLimit(80), [q, acc, cat, month, allMonths])

  const total = list.reduce((s, t) => s + t.amount, 0)
  const groups: { date: string; items: Tx[] }[] = []
  for (const t of list.slice(0, limit)) {
    const g = groups.at(-1)
    if (g?.date === t.date) g.items.push(t)
    else groups.push({ date: t.date, items: [t] })
  }

  const setCategory = (t: Tx, category: string, rule?: string) => {
    if (rule) {
      const r = rule.trim().toLowerCase()
      setRules((l) => [{ match: r, category }, ...l.filter((x) => x.match !== r)])
      const nr = norm(r).trim()
      let n = 0
      setTxs((l) => l.map((x) => {
        if (x.id === t.id) return { ...x, category, manual: true }
        if (!x.manual && norm(x.desc).includes(nr) && x.category !== category) { n++; return { ...x, category } }
        return x
      }))
      onToast(`🏷️ Regla guardada${n ? `: ${n} movimientos más recategorizados` : ''}`)
    } else {
      setTxs((l) => l.map((x) => (x.id === t.id ? { ...x, category, manual: true } : x)))
    }
    setPicking(null)
  }

  const reapply = () => {
    setTxs((l) => l.map((x) => {
      if (x.manual) return x
      const c = categorize(x.desc, x.amount, rules)
      return c === x.category ? x : { ...x, category: c }
    }))
    onToast(`🔄 Reglas aplicadas a todos los movimientos`)
  }

  return (
    <Card i={10} accent={C}>
      <CardTitle
        icon={<Wallet size={16} />} color={C} title={<>Movimientos <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>{list.length}</span></>}
        right={txs.length > 0 && <button className="btn sm ghost" onClick={reapply} title="Volver a categorizar con las reglas">🔄 Recategorizar</button>}
      />
      {txs.length === 0 ? (
        <div className="empty">
          <div className="big">📥</div>
          <p>Aún no hay movimientos.<br />Descarga los movimientos desde la web de tu banco (Excel o CSV) y arrástralos aquí.</p>
          <div className="faint" style={{ fontSize: 12.5, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            <b>Santander:</b> Cuentas → Movimientos → Descargar (Excel) · <b>CaixaBank:</b> Cuentas → Movimientos → Exportar ·{' '}
            <b>PayPal:</b> Actividad → Informes → Descargar (CSV) · <b>Wise:</b> Saldo → Extractos → CSV
          </div>
        </div>
      ) : (
        <>
          <div className="fin-toolbar">
            <div className="fin-search">
              <Search size={15} />
              <input className="input" placeholder="Buscar concepto…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}>
              <option value="all">Todas las cuentas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
            </select>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <div className="chips">
              <button className={`chip ${!allMonths ? 'active' : ''}`} onClick={() => setAllMonths(false)}><span className="cap">{monthName(month, { month: 'short' }).replace('.', '')}</span></button>
              <button className={`chip ${allMonths ? 'active' : ''}`} onClick={() => setAllMonths(true)}>Todo</button>
            </div>
          </div>
          {list.length === 0 ? (
            <div className="empty"><div className="big">🔍</div><p>No hay movimientos con estos filtros</p></div>
          ) : (
            <>
              <div className="tx-sum faint">Suma de lo filtrado: <Money v={total} sign className={total >= 0 ? 'pos' : 'neg'} /></div>
              {groups.map((g) => (
                <div key={g.date}>
                  <div className="tl-day cap">{new Date(g.date + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', ...(allMonths ? { year: 'numeric' } : {}) })}</div>
                  {g.items.map((t) => {
                    const c = CAT[t.category] ?? CAT.other
                    const a = byId[t.accountId]
                    return (
                      <div key={t.id} className="tx-row">
                        <button className="tx-cat" style={{ '--c': c.color } as CSSProperties} onClick={() => setPicking(t)} title={`${c.label} · cambiar`}>{c.emoji}</button>
                        <div className="tx-main">
                          <div className="tx-desc">{t.desc}</div>
                          <div className="tx-sub">
                            <span style={{ color: c.color }}>{c.label}</span>
                            {a && <> · <i className="dot" style={{ background: a.color }} /> {a.name}</>}
                          </div>
                        </div>
                        <Money v={t.amount} sign className={`tx-amount ${CAT[t.category]?.internal ? 'internal' : t.amount >= 0 ? 'pos' : ''}`} />
                      </div>
                    )
                  })}
                </div>
              ))}
              {list.length > limit && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button className="btn sm" onClick={() => setLimit(limit + 150)}>Ver más ({list.length - limit})</button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {/* Portal: dentro de la tarjeta (con transform) el position: fixed no cubriría la pantalla */}
      {picking && createPortal(<CategoryPicker tx={picking} onClose={() => setPicking(null)} onPick={(c, rule) => setCategory(picking, c, rule)} />, document.body)}
    </Card>
  )
}

function CategoryPicker({ tx, onClose, onPick }: { tx: Tx; onClose: () => void; onPick: (cat: string, rule?: string) => void }) {
  const [remember, setRemember] = useState(true)
  const [match, setMatch] = useState(() => merchantOf(tx.desc))
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose}><X size={18} /></button>
        <div className="faint" style={{ fontSize: 12 }}>{new Date(tx.date + 'T12:00').toLocaleDateString('es-ES', { dateStyle: 'long' })}</div>
        <h2 style={{ fontSize: 20, margin: '4px 0 2px', wordBreak: 'break-word' }}>{tx.desc}</h2>
        <Money v={tx.amount} sign className={tx.amount >= 0 ? 'pos' : ''} style={{ fontWeight: 700, fontSize: 18 }} />
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`cat-opt ${tx.category === c.id ? 'on' : ''}`} style={{ '--c': c.color } as CSSProperties}
              onClick={() => onPick(c.id, remember && match.trim() ? match : undefined)}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
        <label className="row" style={{ gap: 10, marginTop: 16, fontSize: 13, flexWrap: 'wrap' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Recordar para los que contengan</span>
          <input className="input" style={{ flex: '1 1 140px', padding: '6px 10px' }} value={match} onChange={(e) => setMatch(e.target.value)} disabled={!remember} />
        </label>
      </div>
    </div>
  )
}

// ---------- Importación ----------

interface Sheet { name: string; rows: Cell[][] }

async function readFile(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer()
  let wb: XLSX.WorkBook
  if (/\.(csv|txt)$/i.test(file.name)) {
    // Muchos bancos exportan en Windows-1252: si no es UTF-8 válido, probamos con ese
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch {
      text = new TextDecoder('windows-1252').decode(buf)
    }
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true })
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true })
  }
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  }))
}

const ACCOUNT_HINTS: [RegExp, string][] = [
  [/santander/i, 'santander'], [/caixa/i, 'caixabank'], [/carrefour|pass/i, 'carrefour'], [/paypal|download/i, 'paypal'],
  [/wise|transferwise|statement_/i, 'wise'], [/trade.?republic/i, 'traderepublic'],
]

function ImportModal({ file, accountId, onClose, onDone }: {
  file: File; accountId?: string; onClose: () => void; onDone: (added: number, dup: number) => void
}) {
  const [accounts, setAccounts] = useAccounts()
  const [txs, setTxs] = useTxs()
  const [rules] = useRules()
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [acct, setAcct] = useState(() => accountId ?? ACCOUNT_HINTS.find(([re, id]) => re.test(file.name) && accounts.some((a) => a.id === id))?.[1] ?? accounts[0]?.id)
  const [map, setMap] = useState<ColumnMapping | null>(null)

  useEffect(() => {
    readFile(file).then((s) => {
      const best = s.findIndex((x) => x.rows.length > 1)
      setSheets(s)
      setSheetIdx(Math.max(0, best))
    }).catch((e) => setError(`No se pudo leer el archivo: ${(e as Error).message}`))
  }, [file])

  const sheet = sheets?.[sheetIdx]
  const { headers, body } = useMemo(() => {
    if (!sheet) return { headers: [] as string[], body: [] as Cell[][] }
    const h = findHeaderRow(sheet.rows)
    return { headers: headersOf(sheet.rows[h] ?? []), body: sheet.rows.slice(h + 1) }
  }, [sheet])

  // Mapeo: el guardado de la cuenta si encaja con estas columnas; si no, lo adivinamos
  useEffect(() => {
    if (!headers.length) return
    const saved = accounts.find((a) => a.id === acct)?.mapping
    const fits = saved && [saved.date, saved.desc, saved.amount ?? saved.debit].every((h) => h && headers.includes(h))
    setMap(fits ? saved! : guessMapping(headers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, acct])

  const parsed = useMemo(() => (map ? applyMapping(headers, body, map) : []), [headers, body, map])
  const ids = useMemo(() => (acct ? txIds(acct, parsed) : []), [acct, parsed])
  const existing = useMemo(() => new Set(txs.map((t) => t.id)), [txs])
  const fresh = ids.filter((id) => !existing.has(id)).length
  const range = parsed.length ? [parsed.reduce((m, r) => (r.date < m ? r.date : m), parsed[0].date), parsed.reduce((m, r) => (r.date > m ? r.date : m), parsed[0].date)] : null
  const spend = parsed.filter((r) => r.amount < 0).length

  const doImport = () => {
    if (!acct || !map) return
    const add: Tx[] = []
    parsed.forEach((r, k) => {
      if (existing.has(ids[k])) return
      add.push({ id: ids[k], accountId: acct, date: r.date, desc: r.desc, amount: r.amount, balance: r.balance, category: categorize(r.desc, r.amount, rules) })
    })
    setTxs((l) => [...l, ...add])
    setAccounts((l) => l.map((a) => (a.id === acct ? { ...a, mapping: map } : a)))
    onDone(add.length, parsed.length - add.length)
  }

  const colSelect = (key: keyof ColumnMapping, label: string, optional = true) => (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={(map?.[key] as string) ?? ''} onChange={(e) => setMap((m) => ({ ...m!, [key]: e.target.value || undefined }))}>
        {optional && <option value="">—</option>}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  )

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single wide" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose}><X size={18} /></button>
        <div className="eyebrow" style={{ '--c': C } as CSSProperties}><FileUp size={13} /> Importar movimientos</div>
        <h2 style={{ fontSize: 22, margin: '0 0 16px', wordBreak: 'break-all' }}>{file.name}</h2>
        {error ? <div className="error">{error}</div> : !sheets || !map ? <div className="skeleton" style={{ height: 240 }} /> : (
          <>
            <div className="import-grid">
              <label className="field">
                <span>Cuenta</span>
                <select className="input" value={acct} onChange={(e) => setAcct(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                </select>
              </label>
              {sheets.length > 1 && (
                <label className="field">
                  <span>Hoja</span>
                  <select className="input" value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
                    {sheets.map((s, k) => <option key={s.name} value={k}>{s.name}</option>)}
                  </select>
                </label>
              )}
              {colSelect('date', 'Fecha', false)}
              {colSelect('desc', 'Concepto', false)}
              {colSelect('amount', 'Importe (con signo)')}
              {!map.amount && colSelect('debit', 'Cargos')}
              {!map.amount && colSelect('credit', 'Abonos')}
              {colSelect('balance', 'Saldo')}
            </div>
            <label className="row" style={{ gap: 8, fontSize: 13, margin: '10px 0 4px' }}>
              <input type="checkbox" checked={Boolean(map.invert)} onChange={(e) => setMap({ ...map, invert: e.target.checked || undefined })} />
              Invertir signo <span className="faint">(si los gastos aparecen en verde, típico en extractos de tarjeta)</span>
            </label>

            {parsed.length === 0 ? (
              <div className="error" style={{ marginTop: 12 }}>No se ha reconocido ningún movimiento: revisa qué columna es la fecha y cuál el importe.</div>
            ) : (
              <>
                <div className="import-stats">
                  <span><b>{parsed.length}</b> movimientos</span>
                  <span><b style={{ color: C }}>{fresh}</b> nuevos</span>
                  {parsed.length - fresh > 0 && <span><b>{parsed.length - fresh}</b> ya importados</span>}
                  {range && <span className="faint">{new Date(range[0] + 'T12:00').toLocaleDateString('es-ES')} → {new Date(range[1] + 'T12:00').toLocaleDateString('es-ES')}</span>}
                  <span className="faint">{spend} gastos · {parsed.length - spend} ingresos</span>
                </div>
                <div className="preview">
                  <table>
                    <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th style={{ textAlign: 'right' }}>Importe</th>{map.balance && <th style={{ textAlign: 'right' }}>Saldo</th>}</tr></thead>
                    <tbody>
                      {parsed.slice(0, 8).map((r, k) => {
                        const c = CAT[categorize(r.desc, r.amount, rules)]
                        return (
                          <tr key={k} className={existing.has(ids[k]) ? 'dup' : ''}>
                            <td>{new Date(r.date + 'T12:00').toLocaleDateString('es-ES')}</td>
                            <td className="ellipsis">{r.desc}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{c.emoji} {c.label}</td>
                            <td style={{ textAlign: 'right' }} className={r.amount >= 0 ? 'pos' : ''}>{eur(r.amount)}</td>
                            {map.balance && <td style={{ textAlign: 'right' }} className="faint">{r.balance != null ? eur(r.balance) : ''}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn primary" onClick={doImport} disabled={!parsed.length}>
                {fresh ? `Importar ${fresh} movimientos` : 'Nada nuevo que importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
