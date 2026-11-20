import { Link } from 'react-router-dom'
import { Sparkles, UserRound } from 'lucide-react'
import { cn } from '../shared/utils'
import type { AgentAction, ChatMessage } from './types'

const ACTION_LABELS: Record<AgentAction['type'], string> = {
  created: 'Creé',
  updated: 'Actualicé',
  completed: 'Completé',
  deleted: 'Eliminé',
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Sparkles className="size-4" aria-hidden />
        </span>
      ) : null}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm border border-stone-200 bg-white text-stone-800',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.actions.length > 0 ? (
          <div className="mt-2 space-y-1 border-t border-stone-200 pt-2">
            {message.actions.map((action, index) => (
              action.type === 'deleted' ? (
                <p key={`${action.task_id}-${index}`} className="px-2 py-1.5 text-xs font-medium text-stone-600">
                  {ACTION_LABELS[action.type]} · {action.title}
                </p>
              ) : (
                <Link
                  key={`${action.task_id}-${index}`}
                  to={`/tasks?task=${action.task_id}`}
                  className="block rounded-lg bg-stone-50 px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-stone-100"
                >
                  {ACTION_LABELS[action.type]} · {action.title} →
                </Link>
              )
            ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600">
          <UserRound className="size-4" aria-hidden />
        </span>
      ) : null}
    </div>
  )
}
