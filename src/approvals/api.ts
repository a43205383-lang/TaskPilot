import { supabase } from '../shared/supabase'

export async function setApproval(
  expenseId: string,
  decision: 'approved' | 'rejected',
  comment: string,
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ approval_status: decision, review_comment: comment.trim() || null })
    .eq('id', expenseId)
  if (error) throw error
}
