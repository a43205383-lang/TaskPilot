// Enums y constantes usados por la UI compartida y por varios dominios.

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
