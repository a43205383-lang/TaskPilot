import {
  CalendarDays,
  Circle,
  CircleCheck,
  CircleDashed,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { Profile } from '../auth/types'
import { PriorityBadge, TaskStatusBadge } from '../shared/ui'
import { cn, formatTaskDate, isOverdue } from '../shared/utils'
import type { Task, TaskStatus } from './types'

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') return <CircleCheck className="size-5" aria-hidden />
  if (status === 'in_progress') return <CircleDashed className="size-5" aria-hidden />
  return <Circle className="size-5" aria-hidden />
}

export function TaskCard({
  task,
  timezone,
  profiles,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task
  timezone: string
  profiles: Record<string, Profile>
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: TaskStatus) => void
}) {
  const assignee = task.assignee_id ? profiles[task.assignee_id] : null
  const overdue = task.status !== 'done' && isOverdue(task.due_date, timezone)

  return (
    <article className="card flex items-start gap-2.5 p-3">
      <button
        type="button"
        onClick={() => onStatusChange(NEXT_STATUS[task.status])}
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition active:scale-95',
          task.status === 'done'
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-stone-100 text-stone-500 hover:bg-brand-50 hover:text-brand-700',
        )}
        aria-label={`Cambiar estado: ${task.status}`}
        title={`Cambiar a ${NEXT_STATUS[task.status]}`}
      >
        <StatusIcon status={task.status} />
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="block w-full text-left">
          <h3
            className={cn(
              'text-sm font-semibold leading-snug',
              task.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-900',
            )}
          >
            {task.title}
          </h3>
        </button>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{task.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium',
              overdue ? 'text-red-600' : 'text-stone-500',
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            {formatTaskDate(task.due_date, timezone)}
            {overdue ? ' · vencida' : ''}
          </span>
          {assignee ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
              <UserRound className="size-3.5" aria-hidden />
              {assignee.full_name || 'Sin nombre'}
            </span>
          ) : null}
        </div>

        {task.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Editar tarea"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Eliminar tarea"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  )
}
