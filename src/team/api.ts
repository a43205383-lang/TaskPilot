import { supabase } from '../shared/supabase'
import type { Task } from '../tasks/types'

export async function fetchAllTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function assignTask(id: string, assigneeId: string | null): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ assignee_id: assigneeId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
