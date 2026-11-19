import type {
  ApprovalStatus,
  Currency,
  ExpenseCategory,
  ExpenseStatus,
} from './types'

export { EXPENSE_CATEGORIES } from './types'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function money(value: number | null | undefined, currency: Currency = 'DOP'): string {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

/** Fecha YYYY-MM-DD sin corrimiento de zona horaria. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  alimentos: 'Alimentos',
  combustible: 'Combustible',
  transporte: 'Transporte',
  oficina: 'Oficina',
  servicios: 'Servicios',
  otros: 'Otros',
}

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmado',
  requires_review: 'Requiere revisión',
}

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const last = new Date(Date.UTC(year, monthNumber, 0))
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  }
}

export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Ocurrió un error inesperado.'
}
