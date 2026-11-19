import type { ExpenseWithReceipt } from './types'
import { APPROVAL_LABELS, CATEGORY_LABELS, STATUS_LABELS } from '../shared/utils'

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const normalized = typeof value === 'number' ? String(value).replace('.', ',') : text
  if (/[";\n\r]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`
  return normalized
}

/**
 * CSV para Excel en español: BOM UTF-8 (tildes), `sep=;` y punto y coma.
 * Los importes usan coma decimal.
 */
export function expensesToCsv(expenses: ExpenseWithReceipt[]): string {
  const headers = [
    'Fecha',
    'Comercio',
    'Categoría',
    'Moneda',
    'Subtotal',
    'ITBIS',
    'Propina',
    'Total',
    'Total DOP',
    'Método de pago',
    'RNC',
    'NCF',
    'Estado',
    'Aprobación',
    'Comentario contador',
  ]

  const lines = expenses.map((expense) =>
    [
      expense.expense_date ?? '',
      expense.merchant ?? '',
      CATEGORY_LABELS[expense.category],
      expense.currency,
      expense.subtotal,
      expense.itbis,
      expense.tip,
      expense.total,
      expense.total_dop,
      expense.payment_method ?? '',
      expense.rnc ?? '',
      expense.ncf ?? '',
      STATUS_LABELS[expense.status],
      APPROVAL_LABELS[expense.approval_status],
      expense.review_comment ?? '',
    ]
      .map(csvCell)
      .join(';'),
  )

  return `\uFEFFsep=;\r\n${headers.join(';')}\r\n${lines.join('\r\n')}\r\n`
}
