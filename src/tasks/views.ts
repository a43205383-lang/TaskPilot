import { dateInTimezone, isOverdue, todayInTimezone } from '../shared/utils'
import type { Task, TaskFilters, TaskView } from './types'

export const TASK_VIEWS: Array<{ value: TaskView; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: 'upcoming', label: 'Próximas' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'done', label: 'Completadas' },
]

export function taskViewFor(task: Task, timezone: string): TaskView {
  if (task.status === 'done') return 'done'
  if (isOverdue(task.due_date, timezone)) return 'overdue'
  if (dateInTimezone(task.due_date, timezone) === todayInTimezone(timezone)) return 'today'
  return 'upcoming'
}

export function filterTasks(tasks: Task[], filters: TaskFilters, timezone: string): Task[] {
  const term = filters.search?.trim().toLowerCase() ?? ''
  const tag = filters.tag && filters.tag !== 'all' ? filters.tag : null

  return tasks.filter((task) => {
    if (filters.status && filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) {
      return false
    }
    if (filters.assignee === 'unassigned' && task.assignee_id) return false
    if (
      filters.assignee &&
      filters.assignee !== 'all' &&
      filters.assignee !== 'unassigned' &&
      task.assignee_id !== filters.assignee
    ) {
      return false
    }
    if (tag && !task.tags.includes(tag)) return false
    if (term) {
      const haystack = `${task.title} ${task.description ?? ''} ${task.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
}

export function countByView(tasks: Task[], timezone: string): Record<TaskView, number> {
  const counts: Record<TaskView, number> = { today: 0, upcoming: 0, overdue: 0, done: 0 }
  for (const task of tasks) counts[taskViewFor(task, timezone)] += 1
  return counts
}
