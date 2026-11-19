import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  Hash,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { CategoryIcon } from '../components/CategoryIcon'
import { ReceiptViewer } from '../components/ReceiptViewer'
import {
  ApprovalBadge,
  Banner,
  Button,
  ErrorState,
  Modal,
  Spinner,
  StatusBadge,
} from '../components/ui'
import { useSignedUrls } from '../hooks/useSignedUrls'
import {
  deleteExpense,
  fetchExpense,
  fetchExpenseItems,
  fetchProfilesByIds,
} from '../lib/api'
import {
  APPROVAL_LABELS,
  CATEGORY_LABELS,
  errorMessage,
  formatDate,
  money,
} from '../lib/utils'

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile, isAccountant } = useAuth()

  const [zoomed, setZoomed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expenseQuery = useQuery({
    queryKey: ['expense', id],
    queryFn: () => fetchExpense(id!),
    enabled: Boolean(id),
  })
  const itemsQuery = useQuery({
    queryKey: ['expense-items', id],
    queryFn: () => fetchExpenseItems(id!),
    enabled: Boolean(id),
  })

  const expense = expenseQuery.data
  const signed = useSignedUrls([expense?.receipt_path])

  const peopleQuery = useQuery({
    queryKey: ['profiles', expense?.user_id, expense?.approved_by],
    queryFn: () => fetchProfilesByIds([expense!.user_id, expense!.approved_by ?? '']),
    enabled: Boolean(expense?.user_id),
  })

  if (expenseQuery.isLoading) return <Spinner label="Cargando gasto…" />
  if (expenseQuery.isError)
    return (
      <ErrorState
        message="No se pudo cargar el gasto. Verifica tu sesión y permisos."
        onRetry={() => void expenseQuery.refetch()}
      />
    )
  if (!expense) return <ErrorState message="El gasto no existe o no tienes acceso." />

  const owner = peopleQuery.data?.[expense.user_id]
  const approver = expense.approved_by ? peopleQuery.data?.[expense.approved_by] : null
  const isOwner = expense.user_id === profile?.id
  const canDelete = isOwner && expense.approval_status !== 'approved'

  async function onDelete() {
    if (!expense) return
    setDeleting(true)
    setError(null)
    try {
      await deleteExpense(expense)
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      navigate('/', { replace: true })
    } catch (deleteError) {
      setError(errorMessage(deleteError))
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-full hover:bg-stone-100"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{expense.merchant ?? 'Gasto'}</h1>
          <p className="text-xs text-stone-500">{formatDate(expense.expense_date)}</p>
        </div>
        <Link
          to={`/expenses/${expense.id}/review`}
          className="flex size-10 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
          aria-label="Editar"
        >
          <Pencil className="size-5" aria-hidden />
        </Link>
        {canDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex size-10 items-center justify-center rounded-full text-red-600 hover:bg-red-50"
            aria-label="Eliminar"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      {expense.review_reasons.includes('not_a_receipt') ? (
        <Banner tone="error" title="Imagen marcada como no-recibo">
          Los campos están vacíos a propósito. Edita el gasto para completarlos o elimínalo.
        </Banner>
      ) : null}

      <div className="card overflow-hidden">
        {expense.receipt_path ? (
          <button
            type="button"
            className="relative block w-full bg-stone-900"
            onClick={() => setZoomed(true)}
          >
            {expense.receipt_path.toLowerCase().endsWith('.pdf') ? (
              <div className="flex h-48 items-center justify-center gap-2 text-white">
                <FileText className="size-8" aria-hidden />
                <span className="text-sm font-medium">Abrir PDF</span>
              </div>
            ) : signed[expense.receipt_path] ? (
              <img
                src={signed[expense.receipt_path]}
                alt={`Recibo de ${expense.merchant ?? 'gasto'}`}
                className="max-h-[48dvh] w-full object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center text-stone-400">
                <Spinner label="Cargando imagen…" />
              </div>
            )}
            <span className="absolute bottom-2 right-2 rounded-full bg-stone-950/70 px-3 py-1 text-xs font-semibold text-white">
              Toca para ampliar
            </span>
          </button>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 bg-stone-100 text-stone-500">
            <ReceiptText className="size-8" aria-hidden />
            <p className="text-sm">Sin imagen</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 p-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={expense.status} />
              <ApprovalBadge status={expense.approval_status} />
              {expense.needs_review ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Campos dudosos
                </span>
              ) : null}
            </div>
            <p className="text-sm text-stone-500">{CATEGORY_LABELS[expense.category]}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">
              {money(expense.total, expense.currency)}
            </p>
            {expense.currency !== 'DOP' ? (
              <p className="text-xs text-stone-500">{money(expense.total_dop, 'DOP')}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card divide-y divide-stone-100">
        <DetailRow icon={<CalendarDays className="size-4" />} label="Fecha">
          {formatDate(expense.expense_date)}
        </DetailRow>
        <DetailRow icon={<CategoryIcon category={expense.category} />} label="Categoría">
          {CATEGORY_LABELS[expense.category]}
        </DetailRow>
        <DetailRow icon={<ReceiptText className="size-4" />} label="Subtotal">
          {money(expense.subtotal, expense.currency)}
        </DetailRow>
        <DetailRow icon={<ReceiptText className="size-4" />} label="ITBIS">
          {money(expense.itbis, expense.currency)}
        </DetailRow>
        <DetailRow icon={<ReceiptText className="size-4" />} label="Propina">
          {money(expense.tip, expense.currency)}
        </DetailRow>
        <DetailRow icon={<CreditCard className="size-4" />} label="Método de pago">
          {expense.payment_method ?? 'No indicado'}
        </DetailRow>
        <DetailRow icon={<Hash className="size-4" />} label="RNC">
          {expense.rnc ?? 'No indicado'}
        </DetailRow>
        <DetailRow icon={<Hash className="size-4" />} label="NCF">
          {expense.ncf ?? 'No indicado'}
        </DetailRow>
        <DetailRow icon={<Users className="size-4" />} label="Registrado por">
          {owner?.full_name ?? (isOwner ? 'Tú' : 'Usuario')}
        </DetailRow>
        {expense.currency !== 'DOP' ? (
          <DetailRow icon={<ReceiptText className="size-4" />} label="Tasa de cambio">
            {expense.exchange_rate} DOP / {expense.currency}
          </DetailRow>
        ) : null}
      </div>

      {expense.approval_status !== 'pending' ? (
        <div
          className={`card p-4 ${
            expense.approval_status === 'approved' ? 'border-emerald-200' : 'border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck
              className={`size-5 ${
                expense.approval_status === 'approved' ? 'text-emerald-600' : 'text-red-600'
              }`}
              aria-hidden
            />
            <p className="text-sm font-semibold">
              {APPROVAL_LABELS[expense.approval_status]} por contabilidad
            </p>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {approver?.full_name ?? 'Contador'}
            {expense.approved_at
              ? ` · ${new Intl.DateTimeFormat('es-DO', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(expense.approved_at))}`
              : ''}
          </p>
          {expense.review_comment ? (
            <p className="mt-2 rounded-lg bg-stone-50 p-2 text-sm text-stone-700">
              “{expense.review_comment}”
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">Líneas de detalle</h2>
        {itemsQuery.isLoading ? (
          <p className="text-sm text-stone-500">Cargando…</p>
        ) : (itemsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-stone-500">Este gasto no tiene líneas de detalle.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {(itemsQuery.data ?? []).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.description}</p>
                  <p className="text-xs text-stone-500">
                    {item.quantity} × {money(item.unit_price, expense.currency)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(item.line_total ?? item.quantity * item.unit_price, expense.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {expense.ai_model ? (
        <p className="text-center text-[11px] text-stone-400">
          Extraído con {expense.ai_model}. Revisado por una persona antes de confirmar.
        </p>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      <ReceiptViewer
        url={expense.receipt_path ? signed[expense.receipt_path] : undefined}
        open={zoomed}
        onClose={() => setZoomed(false)}
      />

      <Modal
        open={confirmDelete}
        title="Eliminar gasto"
        onClose={() => setConfirmDelete(false)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void onDelete()} loading={deleting}>
              <Trash2 className="size-4" aria-hidden />
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-stone-600">
          Se eliminará el gasto y sus imágenes del almacenamiento. Esta acción no se puede
          deshacer.
        </p>
      </Modal>

      {isAccountant && !isOwner ? (
        <p className="text-center text-xs text-stone-400">
          Estás viendo un gasto de {owner?.full_name ?? 'otro usuario'} como contador.
        </p>
      ) : null}
    </div>
  )
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-stone-500">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium text-stone-800">{children}</span>
    </div>
  )
}
