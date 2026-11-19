import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Download,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { CategoryIcon } from '../shared/CategoryIcon'
import {
  ApprovalBadge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../shared/ui'
import { useSignedUrls } from '../shared/useSignedUrls'
import { fetchExpenses } from './api'
import type { ExpenseCategory, ExpenseFilters, ExpenseWithReceipt } from './types'
import { expensesToCsv } from './csv'
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  cn,
  downloadTextFile,
  formatDate,
  money,
  todayISO,
} from '../shared/utils'

export function ExpensesPage() {
  const { session, isAccountant } = useAuth()
  const userId = session?.user.id ?? 'anon'

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [category, setCategory] = useState<ExpenseCategory | 'all'>('all')
  const [status, setStatus] = useState<ExpenseFilters['status']>('all')
  const [approval, setApproval] = useState<ExpenseFilters['approval']>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const filters = useMemo<ExpenseFilters>(
    () => ({
      from: from || undefined,
      to: to || undefined,
      category,
      status,
      approval,
      search: deferredSearch.trim() || undefined,
    }),
    [from, to, category, status, approval, deferredSearch],
  )

  const isDefaultFilters =
    !from && !to && category === 'all' && status === 'all' && approval === 'all' && !deferredSearch
  const cacheKey = `recibos:expenses:${userId}`

  const query = useQuery({
    queryKey: ['expenses', userId, filters],
    queryFn: async () => {
      try {
        const rows = await fetchExpenses(filters)
        if (isDefaultFilters) {
          localStorage.setItem(cacheKey, JSON.stringify(rows))
        }
        return rows
      } catch (error) {
        if (!navigator.onLine) {
          const cached = localStorage.getItem(cacheKey)
          if (cached) return JSON.parse(cached) as ExpenseWithReceipt[]
        }
        throw error
      }
    },
    placeholderData: keepPreviousData,
  })

  const rows = query.data ?? []
  const signed = useSignedUrls(rows.map((expense) => expense.receipt_path))

  const summary = useMemo(() => {
    const counted = rows.filter(
      (expense) => expense.status === 'confirmed' && expense.approval_status !== 'rejected',
    )
    return {
      count: counted.length,
      total: counted.reduce((sum, expense) => sum + Number(expense.total_dop ?? 0), 0),
    }
  }, [rows])

  const hasFilters =
    Boolean(search) || category !== 'all' || status !== 'all' || approval !== 'all' || Boolean(from) || Boolean(to)

  function clearFilters() {
    setSearch('')
    setCategory('all')
    setStatus('all')
    setApproval('all')
    setFrom('')
    setTo('')
  }

  function exportCsv() {
    if (rows.length === 0) return
    const content = expensesToCsv(rows)
    downloadTextFile(`gastos-${todayISO()}.csv`, content)
  }

  return (
    <div>
      <PageHeader
        title="Gastos"
        subtitle={
          summary.count > 0
            ? `${summary.count} confirmados · ${money(summary.total)}`
            : 'Tus recibos, ordenados y exportables'
        }
        action={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden />
            CSV
          </Button>
        }
      />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por comercio…"
            className="field pl-9 pr-9"
            inputMode="search"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full text-stone-400"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          size="md"
          onClick={() => setShowFilters((value) => !value)}
          aria-label="Filtros"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
        </Button>
      </div>

      <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
        <div className="flex gap-2">
          <button
            type="button"
            className={cn('chip', category === 'all' ? 'chip-on' : 'chip-off')}
            onClick={() => setCategory('all')}
          >
            Todas
          </button>
          {EXPENSE_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              className={cn('chip', category === value ? 'chip-on' : 'chip-off')}
              onClick={() => setCategory(value)}
            >
              <CategoryIcon category={value} />
              {CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {showFilters ? (
        <div className="card mb-3 space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">Desde</span>
              <input
                type="date"
                className="field"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              <span className="label">Hasta</span>
              <input
                type="date"
                className="field"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">Estado</span>
              <select
                className="field"
                value={status}
                onChange={(event) => setStatus(event.target.value as ExpenseFilters['status'])}
              >
                <option value="all">Todos</option>
                <option value="draft">Borrador</option>
                <option value="confirmed">Confirmado</option>
                <option value="requires_review">Requiere revisión</option>
              </select>
            </label>
            <label>
              <span className="label">Aprobación</span>
              <select
                className="field"
                value={approval}
                onChange={(event) =>
                  setApproval(event.target.value as ExpenseFilters['approval'])
                }
              >
                <option value="all">Todas</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
              </select>
            </label>
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" aria-hidden />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      ) : null}

      {query.isLoading ? (
        <Spinner label="Cargando gastos…" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudieron cargar los gastos. Revisa tu conexión."
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-7" aria-hidden />}
          title={hasFilters ? 'Sin resultados' : 'Todavía no hay gastos'}
          description={
            hasFilters
              ? 'Prueba con otro comercio, fecha o categoría.'
              : 'Captura tu primer recibo y la IA completará los datos por ti.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : (
              <Button onClick={() => (window.location.href = '/capture')}>
                <Plus className="size-4" aria-hidden />
                Capturar recibo
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {query.isFetching ? (
            <p className="px-1 text-xs text-stone-400">Actualizando…</p>
          ) : null}
          {!navigator.onLine ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Sin conexión: mostrando los últimos gastos guardados en este dispositivo.
            </p>
          ) : null}
          {rows.map((expense) => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              thumbnail={expense.receipt_path ? signed[expense.receipt_path] : undefined}
              showOwner={isAccountant}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ExpenseCard({
  expense,
  thumbnail,
  showOwner,
}: {
  expense: ExpenseWithReceipt
  thumbnail?: string
  showOwner?: boolean
}) {
  return (
    <Link
      to={`/expenses/${expense.id}`}
      className="card flex items-center gap-3 p-3 transition active:scale-[0.995]"
    >
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`Recibo de ${expense.merchant ?? 'gasto'}`}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <ReceiptText className="size-6 text-stone-400" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-stone-900">
            {expense.merchant ?? 'Sin comercio'}
          </p>
          <p className="shrink-0 text-sm font-bold tabular-nums">
            {money(expense.total_dop, 'DOP')}
          </p>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
          <CategoryIcon category={expense.category} className="size-3.5" />
          {CATEGORY_LABELS[expense.category]} · {formatDate(expense.expense_date)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={expense.status} />
          <ApprovalBadge status={expense.approval_status} />
          {expense.currency === 'USD' ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
              USD
            </span>
          ) : null}
          {showOwner ? (
            <span className="truncate text-[11px] text-stone-400">
              {expense.user_id.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
