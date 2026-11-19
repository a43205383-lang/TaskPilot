import { supabase } from '../shared/supabase'
import type { Task, TaskInput, TaskStatus } from './types'

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function fetchTask(id: string): Promise<Task | null> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Task | null) ?? null
}

export async function createTask(input: TaskInput, userId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.due_date ?? null,
      priority: input.priority,
      assignee_id: input.assignee_id || null,
      status: input.status,
      tags: input.tags ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  const body: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.status === 'done') body.completed_at = new Date().toISOString()
  else if (patch.status) body.completed_at = null
  const { error } = await supabase.from('tasks').update(body).eq('id', id)
  if (error) throw error
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  await updateTask(id, { status })
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
