import type { Currency, ExpenseCategory } from '../shared/types'

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
