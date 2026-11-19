import type { TaskPriority, TaskStatus } from '../shared/types'

export type { TaskPriority, TaskStatus } from '../shared/types'

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  due_date: string | null
  priority: TaskPriority
  assignee_id: string | null
  status: TaskStatus
  tags: string[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskInput {
  title: string
  description?: string | null
  due_date?: string | null
  priority: TaskPriority
  assignee_id?: string | null
  status: TaskStatus
  tags?: string[]
}

export type TaskView = 'today' | 'upcoming' | 'overdue' | 'done'

export interface TaskFilters {
  status?: TaskStatus | 'all'
  priority?: TaskPriority | 'all'
  assignee?: string | 'all' | 'unassigned'
  tag?: string | 'all'
  search?: string
}
