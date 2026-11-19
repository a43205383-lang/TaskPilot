import {
  Beef,
  Briefcase,
  Car,
  Fuel,
  MoreHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ExpenseCategory } from './types'
import { cn } from './utils'

const icons: Record<ExpenseCategory, LucideIcon> = {
  alimentos: Beef,
  combustible: Fuel,
  transporte: Car,
  oficina: Briefcase,
  servicios: Zap,
  otros: MoreHorizontal,
}

export function CategoryIcon({
  category,
  className,
}: {
  category: ExpenseCategory
  className?: string
}) {
  const Icon = icons[category] ?? MoreHorizontal
  return <Icon className={cn('size-4', className)} aria-hidden />
}
