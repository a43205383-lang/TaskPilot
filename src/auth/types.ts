import type { AppRole } from '../shared/types'

export type { AppRole } from '../shared/types'

export interface Profile {
  id: string
  full_name: string | null
  role: AppRole
  created_at: string
  updated_at: string
}
