import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { CategoryIcon } from '../shared/CategoryIcon'
import { ReceiptViewer } from '../shared/ReceiptViewer'
import {
  Banner,
  Button,
  ConfidenceBadge,
  ErrorState,
  Spinner,
} from '../shared/ui'
import { useSignedUrls } from '../shared/useSignedUrls'
import { findSimilarExpenses, replaceItems } from './api'
import { fetchExpense, fetchExpenseItems, updateExpense } from '../expenses/api'
import type { Expense, ExpenseCategory, ExpenseItem, Currency } from '../expenses/types'
import {
  APPROVAL_LABELS,
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  cn,
  errorMessage,
  formatDate,
  money,
  round2,
  toNumber,
} from '../shared/utils'

interface FormState {
  merchant: string
  expenseDate: string
  category: ExpenseCategory
  currency: Currency
  exchangeRate: string
  subtotal: string
  itbis: string
  tip: string
  total: string
  paymentMethod: string
  rnc: string
  ncf: string
}

interface ItemDraft {
  key: string
  description: string
  quantity: string
  unitPrice: string
}

const LOW = 0.7

function formFromExpense(expense: Expense): FormState {
  return {
    merchant: expense.merchant ?? '',
    expenseDate: expense.expense_date ?? '',
    category: expense.category,
    currency: expense.currency,
    exchangeRate: String(expense.exchange_rate ?? 1),
    subtotal: expense.subtotal === null ? '' : String(expense.subtotal),
    itbis: expense.itbis === null ? '' : String(expense.itbis),
    tip: expense.tip === null ? '' : String(expense.tip),
    total: expense.total === null ? '' : String(expense.total),
    paymentMethod: expense.payment_method ?? '',
    rnc: expense.rnc ?? '',
    ncf: expense.ncf ?? '',
  }
}

function itemsFromExpense(items: ExpenseItem[]): ItemDraft[] {
  return items.map((item) => ({
    key: item.id,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unit_price),
  }))
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile, isAccountant } = useAuth()

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

  const [form, setForm] = useState<FormState | null>(null)
  const [items, setItems] = useState<ItemDraft[]>([])
  const [saving, setSaving] = useState<'draft' | 'confirmed' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (expense) setForm(formFromExpense(expense))
  }, [expense])

  useEffect(() => {
    if (itemsQuery.data) setItems(itemsFromExpense(itemsQuery.data))
  }, [itemsQuery.data])

  const similarQuery = useQuery({
    queryKey: [
      'similar-expenses',
      id,
      expense?.merchant,
      expense?.expense_date,
      expense?.total,
    ],
    queryFn: () => findSimilarExpenses(expense!),
    enabled: Boolean(expense?.merchant && expense?.expense_date && expense?.total !== null),
  })

  const confidence = expense?.field_confidence ?? {}
  const reasons = expense?.review_reasons ?? []

  const arithmetic = useMemo(() => {
    if (!form) return { mismatch: false, expected: 0 }
    const subtotal = toNumber(form.subtotal) ?? 0
    const itbis = toNumber(form.itbis) ?? 0
    const tip = toNumber(form.tip) ?? 0
    const total = toNumber(form.total)
    const expected = round2(subtotal + itbis + tip)
    const mismatch =
      total !== null &&
      (form.subtotal !== '' || form.itbis !== '' || form.tip !== '') &&
      Math.abs(expected - total) > 0.05
    return { mismatch, expected }
  }, [form])

  const lowFields = Object.entries(confidence)
    .filter(([, value]) => typeof value === 'number' && value < LOW)
    .map(([field]) => field)

  if (expenseQuery.isLoading) return <Spinner label="Cargando gasto…" />
  if (expenseQuery.isError)
    return (
      <ErrorState
        message="No se pudo cargar el gasto. Puede que no tengas permiso para verlo."
        onRetry={() => void expenseQuery.refetch()}
      />
    )
  if (!expense)
    return <ErrorState message="El gasto no existe o no tienes acceso a él." />
  if (!form) return <Spinner label="Preparando el formulario…" />

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  function fieldClass(field: string): string {
    return cn('field', lowFields.includes(field) && 'field-low')
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' },
    ])
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  async function save(status: 'draft' | 'confirmed') {
    if (!form || !expense) return
    setError(null)

    if (status === 'confirmed') {
      if (!form.merchant.trim()) {
        setError('Escribe el comercio antes de confirmar.')
        return
      }
      if (!form.expenseDate) {
        setError('Escribe la fecha del recibo antes de confirmar.')
        return
      }
      if (toNumber(form.total) === null) {
        setError('Escribe el total antes de confirmar.')
        return
      }
    }

    setSaving(status)
    try {
      await updateExpense(expense.id, {
        merchant: form.merchant.trim() || null,
        expense_date: form.expenseDate || null,
        category: form.category,
        currency: form.currency,
        exchange_rate: toNumber(form.exchangeRate) ?? 1,
        subtotal: toNumber(form.subtotal),
        itbis: toNumber(form.itbis),
        tip: toNumber(form.tip),
        total: toNumber(form.total),
        payment_method: form.paymentMethod.trim() || null,
        rnc: form.rnc.trim() || null,
        ncf: form.ncf.trim() || null,
        status,
        needs_review: status === 'draft' ? expense.needs_review : false,
        review_reasons: status === 'draft' ? reasons : [],
      })

      await replaceItems(
        expense.id,
        items.map((item) => ({
          description: item.description,
          quantity: toNumber(item.quantity) ?? 1,
          unit_price: toNumber(item.unitPrice) ?? 0,
        })),
      )

      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['expense', expense.id] })
      await queryClient.invalidateQueries({ queryKey: ['expense-items', expense.id] })
      navigate(`/expenses/${expense.id}`, { replace: true })
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          to={isNew ? '/' : `/expenses/${expense.id}`}
          className="flex size-10 items-center justify-center rounded-full hover:bg-stone-100"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">Revisar gasto</h1>
          <p className="text-xs text-stone-500">
            {isNew ? 'La IA precargó los datos. Corrige lo que haga falta.' : 'Editar gasto'}
          </p>
        </div>
      </div>

      {reasons.includes('not_a_receipt') ? (
        <Banner tone="error" title="La imagen no parece un recibo">
          No se guardaron datos inventados. Puedes completarlos manualmente o descartar el gasto.
        </Banner>
      ) : null}

      {reasons.includes('ai_error') ? (
        <Banner tone="warning" title="No se pudo analizar con IA">
          El gasto quedó en “requiere revisión”. Completa los campos manualmente o vuelve a
          capturarlo.
        </Banner>
      ) : null}

      {lowFields.length > 0 ? (
        <Banner tone="warning" title={`${lowFields.length} campo(s) con baja confianza`}>
          Están resaltados en ámbar. Verifícalos contra la imagen antes de confirmar.
        </Banner>
      ) : null}

      {expense.approval_status !== 'pending' ? (
        <Banner
          tone={expense.approval_status === 'approved' ? 'success' : 'error'}
          title={`Contabilidad: ${APPROVAL_LABELS[expense.approval_status]}`}
        >
          {expense.review_comment ?? 'Sin comentario.'}
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
              <div className="flex h-40 items-center justify-center text-white">
                <ImageIcon className="size-8" aria-hidden />
              </div>
            ) : signed[expense.receipt_path] ? (
              <img
                src={signed[expense.receipt_path]}
                alt="Recibo"
                className="max-h-56 w-full object-contain"
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-stone-400">
                <Spinner label="Cargando imagen…" />
              </div>
            )}
            <span className="absolute bottom-2 right-2 rounded-full bg-stone-950/70 px-3 py-1 text-xs font-semibold text-white">
              Ampliar
            </span>
          </button>
        ) : null}

        <div className="flex items-center justify-between gap-2 p-3">
          <div>
            <p className="text-sm font-semibold">{expense.merchant ?? 'Sin comercio'}</p>
            <p className="text-xs text-stone-500">
              {formatDate(expense.expense_date)} · {CATEGORY_LABELS[expense.category]}
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums">{money(expense.total, expense.currency)}</p>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <label className="block">
          <span className="label">
            Comercio <ConfidenceBadge value={confidence.merchant} />
          </span>
          <input
            className={fieldClass('merchant')}
            value={form.merchant}
            onChange={(event) => update('merchant', event.target.value)}
            placeholder="Nombre del comercio"
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">
              Fecha <ConfidenceBadge value={confidence.expense_date} />
            </span>
            <input
              type="date"
              className={fieldClass('expense_date')}
              value={form.expenseDate}
              onChange={(event) => update('expenseDate', event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">
              Categoría <ConfidenceBadge value={confidence.category} />
            </span>
            <select
              className="field"
              value={form.category}
              onChange={(event) => update('category', event.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Moneda</span>
            <select
              className="field"
              value={form.currency}
              onChange={(event) => update('currency', event.target.value as Currency)}
            >
              <option value="DOP">DOP — RD$</option>
              <option value="USD">USD — US$</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Tasa a DOP</span>
            <input
              className="field"
              inputMode="decimal"
              value={form.exchangeRate}
              onChange={(event) => update('exchangeRate', event.target.value)}
              disabled={form.currency === 'DOP'}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">
              Subtotal <ConfidenceBadge value={confidence.subtotal} />
            </span>
            <input
              className={fieldClass('subtotal')}
              inputMode="decimal"
              value={form.subtotal}
              onChange={(event) => update('subtotal', event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="label">
              ITBIS <ConfidenceBadge value={confidence.itbis} />
            </span>
            <input
              className={fieldClass('itbis')}
              inputMode="decimal"
              value={form.itbis}
              onChange={(event) => update('itbis', event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="label">
              Propina <ConfidenceBadge value={confidence.tip} />
            </span>
            <input
              className={fieldClass('tip')}
              inputMode="decimal"
              value={form.tip}
              onChange={(event) => update('tip', event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="label">
              Total <ConfidenceBadge value={confidence.total} />
            </span>
            <input
              className={cn(fieldClass('total'), 'font-semibold')}
              inputMode="decimal"
              value={form.total}
              onChange={(event) => update('total', event.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        {arithmetic.mismatch ? (
          <Banner tone="warning" title="La suma no coincide">
            Subtotal + ITBIS + propina = {money(arithmetic.expected, form.currency)} y el total
            dice {money(toNumber(form.total), form.currency)}. Revisa el recibo.
          </Banner>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">
              Método de pago <ConfidenceBadge value={confidence.payment_method} />
            </span>
            <input
              className="field"
              value={form.paymentMethod}
              onChange={(event) => update('paymentMethod', event.target.value)}
              placeholder="Efectivo, tarjeta…"
            />
          </label>
          <label className="block">
            <span className="label">
              RNC <ConfidenceBadge value={confidence.rnc} />
            </span>
            <input
              className="field"
              value={form.rnc}
              onChange={(event) => update('rnc', event.target.value)}
              placeholder="Solo facturas"
            />
          </label>
        </div>

        <label className="block">
          <span className="label">
            NCF <ConfidenceBadge value={confidence.ncf} />
          </span>
          <input
            className="field"
            value={form.ncf}
            onChange={(event) => update('ncf', event.target.value)}
            placeholder="Solo facturas (B01, B02, e-CF…)"
          />
        </label>

        <p className="text-xs text-stone-500">
          Total en DOP:{' '}
          <span className="font-semibold text-stone-700">
            {money(
              (toNumber(form.total) ?? 0) * (toNumber(form.exchangeRate) ?? 1),
              'DOP',
            )}
          </span>
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Líneas de detalle</h2>
          <Button variant="ghost" size="sm" onClick={addItem}>
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="py-2 text-sm text-stone-500">
            Sin líneas. Puedes añadirlas si el recibo las detalla.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.key} className="rounded-xl border border-stone-200 p-2">
                <div className="flex gap-2">
                  <input
                    className="field flex-1"
                    value={item.description}
                    onChange={(event) => updateItem(item.key, { description: event.target.value })}
                    placeholder="Descripción"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-red-600 hover:bg-red-50"
                    aria-label="Eliminar línea"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    className="field"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                    placeholder="Cantidad"
                  />
                  <input
                    className="field"
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })}
                    placeholder="Precio unitario"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => void save('draft')}
          loading={saving === 'draft'}
          disabled={saving !== null}
        >
          <Save className="size-4" aria-hidden />
          Borrador
        </Button>
        <Button
          size="lg"
          onClick={() => void save('confirmed')}
          loading={saving === 'confirmed'}
          disabled={saving !== null || expense.approval_status === 'approved' || (!isAccountant && expense.approval_status === 'rejected')}
        >
          {expense.status === 'confirmed' ? (
            <>
              <Check className="size-4" aria-hidden />
              Guardar
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden />
              Confirmar
            </>
          )}
        </Button>
      </div>

      {similarQuery.data && similarQuery.data.length > 0 ? (
        <Banner tone="warning" title="Posible duplicado">
          Ya existe otro gasto con el mismo comercio, fecha y total.
          <div className="mt-1 space-y-1">
            {similarQuery.data.map((similar) => (
              <Link
                key={similar.id}
                to={`/expenses/${similar.id}`}
                className="block text-sm font-semibold underline"
              >
                {similar.merchant} · {formatDate(similar.expense_date)} ·{' '}
                {money(similar.total, similar.currency)}
              </Link>
            ))}
          </div>
        </Banner>
      ) : null}

      {reasons.length > 0 ? (
        <details className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500">
          <summary className="cursor-pointer font-medium text-stone-600">
            Detalles de la revisión
          </summary>
          <ul className="mt-2 list-inside list-disc">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {profile?.role === 'employee' ? (
        <p className="pb-2 text-center text-xs text-stone-400">
          Al confirmar, el gasto queda sujeto a la aprobación de contabilidad.
        </p>
      ) : null}

      <ReceiptViewer
        url={expense.receipt_path ? signed[expense.receipt_path] : undefined}
        open={zoomed}
        onClose={() => setZoomed(false)}
      />

      {arithmetic.mismatch ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>El aviso aritmético no bloquea el guardado, pero revisa los importes.</p>
        </div>
      ) : null}
    </div>
  )
}
