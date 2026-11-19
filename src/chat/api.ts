import { supabase } from '../shared/supabase'
import type { AgentAction, AgentResponse, ChatMessage, ChatRequest } from './types'

export async function fetchChatHistory(): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return ((data ?? []) as Array<Omit<ChatMessage, 'actions'> & { actions?: AgentAction[] }>).map(
    (row) => ({ ...row, actions: row.actions ?? [] }),
  ) as ChatMessage[]
}

export async function saveChatMessage(
  role: ChatMessage['role'],
  content: string,
  actions: AgentResponse['actions'] = [],
): Promise<void> {
  const { error } = await supabase.from('chat_messages').insert({
    role,
    content,
    actions,
  })
  if (error) throw error
}

export async function sendToAgent(request: ChatRequest): Promise<AgentResponse> {
  const { data, error } = await supabase.functions.invoke('task-agent', {
    body: request,
  })
  if (error) {
    const detail = (error as { context?: { response?: Response } }).context?.response
    let message = error.message
    if (detail) {
      try {
        const body = (await detail.json()) as { error?: string }
        if (body.error) message = body.error
      } catch {
        // Se conserva el mensaje original.
      }
    }
    throw new Error(message || 'El asistente no respondió.')
  }
  return data as AgentResponse
}
