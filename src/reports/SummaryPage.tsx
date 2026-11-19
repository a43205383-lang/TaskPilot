import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ReceiptText } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { CategoryIcon } from '../shared/CategoryIcon'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../shared/ui'
import { fetchExpenses } from '../expenses/api'
import type { ExpenseCategory } from '../expenses/types'
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  currentMonth,
  formatDate,
  money,
  monthRange,
} from '../shared/utils'

const COLORS = ['#ea580c', '#0ea5e9', '#16a34a', '#a855f7', '#eab308', '#64748b']

export function SummaryPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? 'anon'
  const [month, setMonth] = useState(currentMonth())
  const { from, to } = monthRange(month)

  const query = useQuery({
    queryKey: ['summary', userId, month],
    queryFn: () => fetchExpenses({ from, to }),
  })

  const stats = useMemo(() => {
    const rows = query.data ?? []
    const counted = rows.filter(
      (expense) => expense.status === 'confirmed' && expense.approval_status !== 'rejected',
    )
    const total = counted.reduce((sum, expense) => sum + Number(expense.total_dop ?? 0), 0)

    const byCategory = EXPENSE_CATEGORIES.map((category) => {
      const items = counted.filter((expense) => expense.category === category)
      return {
        category,
        total: items.reduce((sum, expense) => sum + Number(expense.total_dop ?? 0), 0),
        count: items.length,
      }
    })
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)

    return {
      total,
      count: counted.length,
      pending: counted.filter((expense) => expense.approval_status === 'pending').length,
      approved: counted.filter((expense) => expense.approval_status === 'approved').length,
      drafts: rows.filter((expense) => expense.status !== 'confirmed').length,
      byCategory,
      max: byCategory[0]?.total ?? 0,
    }
  }, [query.data])

  const monthLabel = new Intl.DateTimeFormat('es-DO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-15T12:00:00`))

  return (
    <div>
      <PageHeader
        title="Resumen"
        subtitle={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
      />

      <label className="mb-3 block">
        <span className="label">Mes</span>
        <input
          type="month"
          className="field"
          value={month}
          max={currentMonth()}
          onChange={(event) => setMonth(event.target.value || currentMonth())}
        />
      </label>

      {query.isLoading ? (
        <Spinner label="Calculando el resumen…" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudo cargar el resumen."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="space-y-3">
          <div className="card bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white">
            <p className="text-sm font-medium text-brand-100">Total confirmado del mes</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{money(stats.total, 'DOP')}</p>
            <p className="mt-1 text-xs text-brand-100">
              {stats.count} gasto(s) confirmado(s) · {stats.approved} aprobado(s) ·{' '}
              {stats.pending} pendiente(s)
            </p>
            {stats.drafts > 0 ? (
              <p className="mt-1 text-xs text-brand-100">
                {stats.drafts} borrador(es)/revisión no cuentan en el total.
              </p>
            ) : null}
          </div>

          {stats.byCategory.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-7" aria-hidden />}
              title="Todavía no hay gastos confirmados"
              description="Confirma un recibo para ver el total por categoría."
              action={
                <Link
                  to="/capture"
                  className="text-sm font-semibold text-brand-700 underline"
                >
                  Capturar un recibo
                </Link>
              }
            />
          ) : (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">Total por categoría</h2>
              <div className="space-y-3">
                {stats.byCategory.map((entry, index) => {
                  const percentage = stats.total > 0 ? (entry.total / stats.total) * 100 : 0
                  const width = stats.max > 0 ? (entry.total / stats.max) * 100 : 0
                  return (
                    <div key={entry.category}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 font-medium">
                          <CategoryIcon category={entry.category} />
                          {CATEGORY_LABELS[entry.category]}
                        </span>
                        <span className="tabular-nums text-stone-700">
                          {money(entry.total, 'DOP')}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(3, width)}%`,
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-400">
                        {percentage.toFixed(1)}% del mes · {entry.count} gasto(s)
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Últimos del mes</h2>
              <Link to="/" className="text-xs font-semibold text-brand-700 underline">
                Ver todos
              </Link>
            </div>
            {(query.data ?? []).slice(0, 4).length === 0 ? (
              <p className="text-sm text-stone-500">Sin gastos en este mes.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {(query.data ?? []).slice(0, 4).map((expense) => (
                  <Link
                    key={expense.id}
                    to={`/expenses/${expense.id}`}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                      {expense.receipt_path ? (
                        <ReceiptText className="size-4" aria-hidden />
                      ) : (
                        <ReceiptText className="size-4" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {expense.merchant ?? 'Sin comercio'}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatDate(expense.expense_date)} ·{' '}
                        {CATEGORY_LABELS[expense.category as ExpenseCategory]}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {money(expense.total_dop, 'DOP')}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
