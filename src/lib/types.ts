// Tipos compartidos de la base de datos y de la extracción con IA.

export const EXPENSE_CATEGORIES = [
  'alimentos',
  'combustible',
  'transporte',
  'oficina',
  'servicios',
  'otros',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type AppRole = 'employee' | 'accountant'
export type ExpenseStatus = 'draft' | 'confirmed' | 'requires_review'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type Currency = 'DOP' | 'USD'

export interface Profile {
  id: string
  full_name: string | null
  role: AppRole
  created_at: string
  updated_at: string
}

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

export interface ExtractionItem {
  description: string
  quantity: number | null
  unit_price: number | null
  line_total: number | null
}

export interface Extraction {
  is_receipt: boolean
  document_type: 'receipt' | 'invoice' | 'other'
  merchant: string | null
  expense_date: string | null
  currency: Currency | null
  subtotal: number | null
  itbis: number | null
  tip: number | null
  total: number | null
  payment_method: string | null
  rnc: string | null
  ncf: string | null
  category: ExpenseCategory
  items: ExtractionItem[]
  confidence: Record<string, number>
  notes: string | null
}

export interface ExtractResponse {
  ok: boolean
  data?: Extraction
  model?: string
  code?: string
  error?: string
}

export interface ExpenseFilters {
  from?: string
  to?: string
  category?: ExpenseCategory | 'all'
  status?: ExpenseStatus | 'all'
  approval?: ApprovalStatus | 'all'
  search?: string
}
