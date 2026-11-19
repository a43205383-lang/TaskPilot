import type { ApprovalStatus, Currency, ExpenseCategory, ExpenseStatus } from '../shared/types'

export { EXPENSE_CATEGORIES } from '../shared/types'
export type { ExpenseCategory, ExpenseStatus, Currency } from '../shared/types'

export interface Expense {
  id: string
  user_id: string
  merchant: string | null
  expense_date: string | null
  currency: Currency
  exchange_rate: number
  subtotal: number | null
  itbis: number | null
  tip: number | null
  total: number | null
  total_dop: number | null
  payment_method: string | null
  rnc: string | null
  ncf: string | null
  category: ExpenseCategory
  status: ExpenseStatus
  needs_review: boolean
  review_reasons: string[]
  approval_status: ApprovalStatus
  approved_by: string | null
  approved_at: string | null
  review_comment: string | null
  field_confidence: Record<string, number>
  ai_model: string | null
  ai_raw: unknown
  receipt_hash: string | null
  duplicate_of: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseWithReceipt extends Expense {
  receipt_path: string | null
}

export interface ExpenseItem {
  id: string
  expense_id: string
  position: number
  description: string
  quantity: number
  unit_price: number
  line_total: number | null
  created_at: string
}

export interface ExpenseFilters {
  from?: string
  to?: string
  category?: ExpenseCategory | 'all'
  status?: ExpenseStatus | 'all'
  approval?: ApprovalStatus | 'all'
  search?: string
}
