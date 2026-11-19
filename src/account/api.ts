import { supabase } from '../shared/supabase'

export async function fetchAiUsageToday(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('ai_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle()
  if (error) throw error
  return (data?.calls as number | undefined) ?? 0
}
