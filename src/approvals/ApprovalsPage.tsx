import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { CategoryIcon } from '../shared/CategoryIcon'
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Spinner,
} from '../shared/ui'
import { useSignedUrls } from '../shared/useSignedUrls'
import { setApproval } from './api'
import { fetchExpenses } from '../expenses/api'
import { fetchProfilesByIds } from '../auth/api'
import type { ApprovalStatus } from '../shared/types'
import type { ExpenseWithReceipt } from '../expenses/types'
import {
  CATEGORY_LABELS,
  cn,
  errorMessage,
  formatDate,
  money,
} from '../shared/utils'

const TABS: Array<{ value: ApprovalStatus; label: string }> = [
  { value: 'pending', label: 'Por aprobar' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
]

export function ApprovalsPage() {
  const { isAccountant } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<ApprovalStatus>('pending')

  const query = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => fetchExpenses({ status: 'confirmed', approval: tab }),
    enabled: isAccountant,
  })

  const rows = query.data ?? []
  const signed = useSignedUrls(rows.map((expense) => expense.receipt_path))
  const peopleQuery = useQuery({
    queryKey: ['approval-people', rows.map((expense) => expense.user_id).join(',')],
    queryFn: () => fetchProfilesByIds(rows.map((expense) => expense.user_id)),
    enabled: rows.length > 0,
  })

  const [selected, setSelected] = useState<{
    expense: ExpenseWithReceipt
    decision: 'approved' | 'rejected'
  } | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isAccountant) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-7" aria-hidden />}
        title="Solo contabilidad"
        description="Esta bandeja está reservada para usuarios con rol de contador."
        action={
          <Link to="/" className="text-sm font-semibold text-brand-700 underline">
            Volver a mis gastos
          </Link>
        }
      />
    )
  }

  function openDecision(expense: ExpenseWithReceipt, decision: 'approved' | 'rejected') {
    setSelected({ expense, decision })
    setComment(expense.review_comment ?? '')
    setError(null)
  }

  async function submitDecision() {
    if (!selected) return
    if (selected.decision === 'rejected' && comment.trim().length < 3) {
      setError('Escribe un comentario explicando el rechazo.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setApproval(selected.expense.id, selected.decision, comment)
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['approvals'] })
      await queryClient.invalidateQueries({ queryKey: ['approval-people'] })
      await queryClient.invalidateQueries({ queryKey: ['expense', selected.expense.id] })
      setSelected(null)
      setComment('')
    } catch (decisionError) {
      setError(errorMessage(decisionError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Contabilidad"
        subtitle="Aprueba o rechaza los gastos confirmados"
      />

      <div className="mb-3 grid grid-cols-3 rounded-xl bg-stone-100 p-1">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setTab(entry.value)}
            className={cn(
              'rounded-lg py-2 text-xs font-semibold transition',
              tab === entry.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Spinner label="Cargando bandeja…" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudo cargar la bandeja de aprobación."
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-7" aria-hidden />}
          title={
            tab === 'pending'
              ? 'No hay gastos pendientes'
              : tab === 'approved'
                ? 'Todavía no has aprobado gastos'
                : 'No hay gastos rechazados'
          }
          description={
            tab === 'pending'
              ? 'Cuando un empleado confirme un gasto aparecerá aquí.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((expense) => {
            const owner = peopleQuery.data?.[expense.user_id]
            return (
              <div key={expense.id} className="card p-3">
                <div className="flex gap-3">
                  <Link
                    to={`/expenses/${expense.id}`}
                    className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100"
                  >
                    {expense.receipt_path && signed[expense.receipt_path] ? (
                      <img
                        src={signed[expense.receipt_path]}
                        alt="Recibo"
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <ReceiptText className="size-6 text-stone-400" aria-hidden />
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/expenses/${expense.id}`}
                        className="truncate text-sm font-semibold"
                      >
                        {expense.merchant ?? 'Sin comercio'}
                      </Link>
                      <p className="shrink-0 text-sm font-bold tabular-nums">
                        {money(expense.total_dop, 'DOP')}
                      </p>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
                      <CategoryIcon category={expense.category} className="size-3.5" />
                      {CATEGORY_LABELS[expense.category]} · {formatDate(expense.expense_date)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {owner?.full_name ?? 'Empleado'} · {expense.payment_method ?? 'Sin método'}
                    </p>
                  </div>
                </div>

                {tab === 'pending' ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openDecision(expense, 'rejected')}
                    >
                      <X className="size-4" aria-hidden />
                      Rechazar
                    </Button>
                    <Button size="sm" onClick={() => openDecision(expense, 'approved')}>
                      <Check className="size-4" aria-hidden />
                      Aprobar
                    </Button>
                  </div>
                ) : expense.review_comment ? (
                  <p className="mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
                    “{expense.review_comment}”
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected?.decision === 'approved' ? 'Aprobar gasto' : 'Rechazar gasto'}
        onClose={() => setSelected(null)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant={selected?.decision === 'rejected' ? 'danger' : 'primary'}
              onClick={() => void submitDecision()}
              loading={saving}
            >
              {selected?.decision === 'rejected' ? 'Rechazar' : 'Aprobar'}
            </Button>
          </div>
        }
      >
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-semibold">{selected.expense.merchant ?? 'Sin comercio'}</p>
              <p className="text-stone-500">
                {formatDate(selected.expense.expense_date)} ·{' '}
                {money(selected.expense.total, selected.expense.currency)}
              </p>
            </div>
            <label className="block">
              <span className="label">
                Comentario {selected.decision === 'rejected' ? '(obligatorio)' : '(opcional)'}
              </span>
              <textarea
                className="field min-h-24 resize-y"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={
                  selected.decision === 'rejected'
                    ? 'Explica por qué no procede este gasto…'
                    : 'Nota para el empleado (opcional)…'
                }
              />
            </label>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <p className="text-xs text-stone-500">
              El empleado verá tu decisión y el comentario en el detalle del gasto.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
