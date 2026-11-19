import { supabase } from '../shared/supabase'
import type { Profile } from './types'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
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
