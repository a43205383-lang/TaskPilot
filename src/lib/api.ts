import { supabase } from './supabase'
import type {
  Expense,
  ExpenseFilters,
  ExpenseItem,
  ExpenseWithReceipt,
  Extraction,
  Profile,
} from './types'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

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

export async function createDraftExpense(input: {
  id: string
  userId: string
  receiptHash: string
  status?: 'requires_review' | 'draft'
}): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    id: input.id,
    user_id: input.userId,
    status: input.status ?? 'requires_review',
    receipt_hash: input.receiptHash,
    currency: 'DOP',
    needs_review: true,
    review_reasons: ['processing'],
  })
  if (error) throw error
}

export async function registerReceiptImage(input: {
  expenseId: string
  path: string
  mimeType: string
  sizeBytes: number
}): Promise<void> {
  const { error } = await supabase.from('expense_images').insert({
    expense_id: input.expenseId,
    storage_path: input.path,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  })
  if (error) throw error
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

export async function signReceiptPaths(paths: Array<string | null>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (unique.length === 0) return {}

  const { data, error } = await supabase.storage.from('receipts').createSignedUrls(unique, 3600)
  if (error) throw error

  const map: Record<string, string> = {}
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl
  }
  return map
}

export async function findDuplicateByHash(
  hash: string,
): Promise<Pick<Expense, 'id' | 'merchant' | 'expense_date' | 'total'> | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, merchant, expense_date, total')
    .eq('receipt_hash', hash)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function findSimilarExpenses(expense: Expense): Promise<Expense[]> {
  if (!expense.merchant || !expense.expense_date || expense.total === null) return []
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('merchant', expense.merchant)
    .eq('expense_date', expense.expense_date)
    .eq('total', expense.total)
    .neq('id', expense.id)
    .limit(3)
  if (error) throw error
  return (data ?? []) as Expense[]
}

const LOW_CONFIDENCE = 0.7

function confidenceReasons(confidence: Record<string, number>): string[] {
  return Object.entries(confidence)
    .filter(([, value]) => typeof value === 'number' && value < LOW_CONFIDENCE)
    .map(([field]) => `low_confidence:${field}`)
}

/** Aplica la extracción de la IA al gasto y reemplaza sus líneas de detalle. */
export async function applyExtraction(
  expenseId: string,
  extraction: Extraction,
  model: string | null,
): Promise<void> {
  const confidence = extraction.confidence ?? {}
  const reasons = confidenceReasons(confidence)

  if (!extraction.is_receipt) {
    await updateExpense(expenseId, {
      status: 'requires_review',
      needs_review: true,
      review_reasons: ['not_a_receipt'],
      field_confidence: confidence,
      ai_model: model,
      ai_raw: extraction,
    })
    return
  }

  const patch: Partial<Expense> = {
    merchant: extraction.merchant,
    expense_date: extraction.expense_date,
    currency: extraction.currency ?? 'DOP',
    subtotal: extraction.subtotal,
    itbis: extraction.itbis,
    tip: extraction.tip,
    total: extraction.total,
    payment_method: extraction.payment_method,
    rnc: extraction.rnc,
    ncf: extraction.ncf,
    category: extraction.category,
    status: 'draft',
    needs_review: reasons.length > 0,
    review_reasons: reasons,
    field_confidence: confidence,
    ai_model: model,
    ai_raw: extraction,
  }

  await updateExpense(expenseId, patch)

  const { error: deleteError } = await supabase
    .from('expense_items')
    .delete()
    .eq('expense_id', expenseId)
  if (deleteError) throw deleteError

  if (extraction.items.length > 0) {
    const { error } = await supabase.from('expense_items').insert(
      extraction.items.map((item, index) => ({
        expense_id: expenseId,
        position: index,
        description: item.description,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        line_total: item.line_total,
      })),
    )
    if (error) throw error
  }
}

export async function replaceItems(
  expenseId: string,
  items: Array<{ description: string; quantity: number; unit_price: number }>,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('expense_items')
    .delete()
    .eq('expense_id', expenseId)
  if (deleteError) throw deleteError

  const clean = items.filter((item) => item.description.trim().length > 0)
  if (clean.length === 0) return

  const { error } = await supabase.from('expense_items').insert(
    clean.map((item, index) => ({
      expense_id: expenseId,
      position: index,
      description: item.description.trim(),
      quantity: item.quantity > 0 ? item.quantity : 1,
      unit_price: item.unit_price >= 0 ? item.unit_price : 0,
      line_total: Number((item.quantity * item.unit_price).toFixed(2)),
    })),
  )
  if (error) throw error
}

export async function setApproval(
  expenseId: string,
  decision: 'approved' | 'rejected',
  comment: string,
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ approval_status: decision, review_comment: comment.trim() || null })
    .eq('id', expenseId)
  if (error) throw error
}

export async function fetchProfilesByIds(ids: string[]): Promise<Record<string, Profile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, updated_at')
    .in('id', unique)
  if (error) throw error
  return Object.fromEntries(((data ?? []) as Profile[]).map((profile) => [profile.id, profile]))
}

export async function fetchAiUsageToday(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('ai_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle()
  if (error) throw error
  return (data?.calls as number | undefined) ?? 0
}
