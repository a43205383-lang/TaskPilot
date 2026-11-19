import { supabase } from '../shared/supabase'
import type { Extraction } from './types'
import type { Expense } from '../expenses/types'
import { updateExpense } from '../expenses/api'

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
