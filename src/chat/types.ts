export interface AgentAction {
  type: 'created' | 'updated' | 'completed' | 'deleted'
  task_id: string
  title: string
}

export interface AgentClarification {
  question: string
  action: 'complete_task' | 'delete_task'
  options: Array<{ id: string; title: string }>
}

export interface AgentConfirmation {
  message: string
  task_ids: string[]
}

export interface AgentResponse {
  reply: string
  actions?: AgentAction[]
  clarification?: AgentClarification
  confirmation?: AgentConfirmation
}

export interface ChatRequest {
  message: string
  context: { timezone: string; today: string }
  confirm?: boolean
  confirmed_task_ids?: string[]
  selected_task_id?: string | null
  selected_task_action?: 'complete_task' | 'delete_task'
}

export interface ChatMessage {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  actions: AgentAction[]
  created_at: string
}
