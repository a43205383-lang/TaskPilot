import { supabase } from '../shared/supabase'
import type { Expense } from '../expenses/types'

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
