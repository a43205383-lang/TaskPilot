import { supabase } from '../shared/supabase'
import type { Expense, ExpenseFilters, ExpenseItem, ExpenseWithReceipt } from './types'

export async function fetchExpenses(filters: ExpenseFilters = {}): Promise<ExpenseWithReceipt[]> {
  let query = supabase
    .from('expenses_with_receipt')
    .select('*')
    .order('expense_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.from) query = query.gte('expense_date', filters.from)
  if (filters.to) query = query.lte('expense_date', filters.to)
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.approval && filters.approval !== 'all') {
    query = query.eq('approval_status', filters.approval)
  }
  if (filters.search?.trim()) query = query.ilike('merchant', `%${filters.search.trim()}%`)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ExpenseWithReceipt[]
}

export async function fetchExpense(id: string): Promise<ExpenseWithReceipt | null> {
  const { data, error } = await supabase
    .from('expenses_with_receipt')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as ExpenseWithReceipt | null) ?? null
}

export async function fetchExpenseItems(expenseId: string): Promise<ExpenseItem[]> {
  const { data, error } = await supabase
    .from('expense_items')
    .select('*')
    .eq('expense_id', expenseId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as ExpenseItem[]
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<void> {
  const { error } = await supabase.from('expenses').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteExpense(expense: ExpenseWithReceipt): Promise<void> {
  const { data: images, error: imagesError } = await supabase
    .from('expense_images')
    .select('storage_path')
    .eq('expense_id', expense.id)
  if (imagesError) throw imagesError

  const paths = (images ?? []).map((image) => image.storage_path as string).filter(Boolean)
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('receipts').remove(paths)
    if (storageError) throw storageError
  }

  const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
  if (error) throw error
}
