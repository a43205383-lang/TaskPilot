import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react'
import { cn, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './utils'
import type { TaskPriority, TaskStatus } from './types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  block?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 active:bg-stone-100',
  ghost: 'text-stone-700 hover:bg-stone-100 active:bg-stone-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20',
        'disabled:cursor-not-allowed disabled:opacity-70',
        buttonVariants[variant],
        buttonSizes[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Label({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="label">
      <span>{children}</span>
      {aside}
    </div>
  )
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>
}

const statusStyles: Record<TaskStatus, string> = {
  pending: 'bg-stone-100 text-stone-700',
  in_progress: 'bg-sky-50 text-sky-700',
  done: 'bg-emerald-50 text-emerald-700',
}

const priorityStyles: Record<TaskPriority, string> = {
  low: 'bg-stone-100 text-stone-600',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-50 text-red-700',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        statusStyles[status],
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        priorityStyles[priority],
      )}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-stone-500">
      <Loader2 className="size-7 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        {icon ?? <Inbox className="size-7" aria-hidden />}
      </div>
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      {description ? <p className="max-w-xs text-sm text-stone-500">{description}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-stone-800">Algo salió mal</h2>
      <p className="max-w-sm text-sm text-stone-500">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: string
  children?: ReactNode
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-2.5 text-sm', tones[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-stone-950/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
