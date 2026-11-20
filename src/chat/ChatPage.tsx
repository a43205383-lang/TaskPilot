import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Mic, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, EmptyState, PageHeader, Spinner } from '../shared/ui'
import { errorMessage, todayInTimezone } from '../shared/utils'
import { fetchChatHistory, saveChatMessage, sendToAgent } from './api'
import { ChatMessageBubble } from './ChatMessageBubble'
import type {
  AgentClarification,
  AgentConfirmation,
  ChatMessage,
  ChatRequest,
} from './types'

interface SpeechResult {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResult) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function speechRecognition(): SpeechRecognitionCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

const SUGGESTIONS = [
  'Recuérdame cobrarle a Juan el viernes',
  'Cotización a Ana mañana, urgente',
  '¿Qué tengo pendiente esta semana?',
]

export function ChatPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const timezone = localStorage.getItem('tareas:timezone') ?? 'America/Santo_Domingo'
  const userId = session?.user.id ?? 'anon'

  const history = useQuery({ queryKey: ['chat'], queryFn: fetchChatHistory })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState('')
  const [confirmation, setConfirmation] = useState<AgentConfirmation | null>(null)
  const [clarification, setClarification] = useState<AgentClarification | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (history.data) setMessages(history.data)
  }, [history.data])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  async function send(text: string, extra: Partial<ChatRequest> = {}) {
    const trimmed = text.trim()
    let messageToSend = trimmed
    let requestExtra = extra
    if (!trimmed || sending) return

    if (clarification && !extra.selected_task_id) {
      const normalize = (value: string) => value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const selectedOption = clarification.options.find((option) => normalize(option.title) === normalize(trimmed))
      if (!selectedOption) {
        setError('Elige una de las tareas indicadas para continuar.')
        return
      }
      messageToSend = lastMessage
      requestExtra = {
        selected_task_id: selectedOption.id,
        selected_task_action: clarification.action,
      }
    } else if (clarification?.action && extra.selected_task_id) {
      requestExtra = { ...extra, selected_task_action: clarification.action }
    }

    setInput('')
    setError(null)
    setPendingText(null)
    setConfirmation(null)
    setClarification(null)
    setListening(false)

    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: userId,
      role: 'user',
      content: trimmed,
      actions: [],
      created_at: new Date().toISOString(),
    }
    setMessages((current) => [...current, optimistic])
    setSending(true)

    try {
      const response = await sendToAgent({
        message: messageToSend,
        context: { timezone, today: todayInTimezone(timezone) },
        ...requestExtra,
      })
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: userId,
        role: 'assistant',
        content: response.reply,
        actions: response.actions ?? [],
        created_at: new Date().toISOString(),
      }
      setMessages((current) => [...current, reply])

      await saveChatMessage(userId, 'user', trimmed)
      await saveChatMessage(userId, 'assistant', response.reply, response.actions ?? [])
      if (response.actions?.length) {
        await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      }

      setLastMessage(trimmed)
      setConfirmation(response.confirmation ?? null)
      setClarification(response.clarification ?? null)
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id))
      setError(errorMessage(cause))
      setPendingText(trimmed)
      setInput(trimmed)
    } finally {
      setSending(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void send(input)
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const Ctor = speechRecognition()
    if (!Ctor) {
      setVoiceError('Tu navegador no permite dictado por voz. Escribe el mensaje.')
      return
    }
    setVoiceError(null)
    const recognition = new Ctor()
    recognition.lang = 'es-DO'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (transcript) setInput((current) => (current ? `${current} ${transcript}` : transcript))
    }
    recognition.onerror = () => {
      setListening(false)
      setVoiceError('No se pudo escuchar. Inténtalo de nuevo.')
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <div className="flex h-[calc(100dvh-13.5rem)] min-h-[24rem] flex-col overflow-hidden">
      <PageHeader title="Asistente" subtitle="Escribe lo que tienes pendiente" />

      {error ? (
        <Banner tone="error" title="No pude completar la solicitud">
          <p>{error}</p>
          <div className="mt-2 flex gap-2">
            {pendingText ? (
              <Button size="sm" variant="secondary" onClick={() => void send(pendingText)}>
                Reintentar
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate('/tasks', { state: { draftTitle: pendingText ?? input } })
              }
            >
              Crear a mano
            </Button>
          </div>
        </Banner>
      ) : null}

      {voiceError ? <Banner tone="warning">{voiceError}</Banner> : null}

      {clarification ? (
        <Banner tone="warning" title={clarification.question}>
          <div className="mt-2 flex flex-wrap gap-2">
            {clarification.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  void send(lastMessage, { selected_task_id: option.id, selected_task_action: clarification.action })
                }
                className="chip chip-off"
              >
                {option.title}
              </button>
            ))}
          </div>
        </Banner>
      ) : null}

      {confirmation ? (
        <Banner tone="warning" title={confirmation.message}>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void send(lastMessage, { confirm: true })}>
              Confirmar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
          </div>
        </Banner>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-3">
        {history.isLoading ? <Spinner label="Cargando conversación…" /> : null}
        {history.isError ? (
          <Banner tone="warning" title="No se pudo cargar el historial">
            Puedes seguir escribiendo; los mensajes nuevos sí se guardarán.
          </Banner>
        ) : null}

        {history.isSuccess && messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-7" aria-hidden />}
            title="Cuéntame qué tienes pendiente"
            description="Escribe en lenguaje natural. Puedo crear varias tareas a la vez y responder preguntas sobre ellas."
          />
        ) : null}

        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}

        {sending ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Sparkles className="size-4 animate-pulse" aria-hidden />
            Pensando…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {messages.length === 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              className="chip chip-off whitespace-nowrap text-xs"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="shrink-0 flex items-end gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={toggleVoice}
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition ${
            listening ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-600'
          }`}
          aria-label={listening ? 'Detener dictado' : 'Dictar mensaje'}
        >
          <Mic className="size-5" aria-hidden />
        </button>
        <textarea
          className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-stone-400"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(input)
            }
          }}
          placeholder="Recuérdame cobrarle a Juan el viernes…"
          rows={1}
        />
        <Button type="submit" size="sm" loading={sending} disabled={!input.trim()} className="size-10 p-0">
          <ArrowUp className="size-5" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
