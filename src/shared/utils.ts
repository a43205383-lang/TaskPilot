import type { AppRole, TaskPriority, TaskStatus } from './types'

export { DEFAULT_TIMEZONE, TASK_PRIORITIES, TASK_STATUSES } from './types'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.'
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function datePartsInTimezone(value: Date, timezone: string): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
  const match = formatted.match(/(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : formatted
}

export function todayInTimezone(timezone: string): string {
  return datePartsInTimezone(new Date(), timezone)
}

export function dateInTimezone(value: string | null | undefined, timezone: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return datePartsInTimezone(date, timezone)
}

export function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function formatTaskDate(value: string | null | undefined, timezone: string): string {
  const date = dateInTimezone(value, timezone)
  if (!date) return 'Sin fecha'
  const today = todayInTimezone(timezone)
  if (date === today) return 'Hoy'
  if (date === shiftDate(today, 1)) return 'Mañana'

  const [year, month, day] = date.split('-').map(Number)
  const short = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(
    new Date(year, month - 1, day),
  )
  const withYear = year === Number(today.slice(0, 4)) ? '' : ` ${year}`
  return `${short}${withYear}`
}

export function isOverdue(value: string | null | undefined, timezone: string): boolean {
  const date = dateInTimezone(value, timezone)
  return date !== null && date < todayInTimezone(timezone)
}

export function localDateTimeValue(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Hecha',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export const ROLE_LABELS: Record<AppRole, string> = {
  employee: 'Empleado',
  supervisor: 'Supervisor',
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
