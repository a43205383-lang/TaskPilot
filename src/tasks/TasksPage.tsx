import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare2, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { fetchProfiles } from '../auth/api'
import { Button, EmptyState, ErrorState, Modal, PageHeader, Spinner } from '../shared/ui'
import {
  cn,
  DEFAULT_TIMEZONE,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '../shared/utils'
import { useOnline } from '../shared/useOnline'
import { createTask, deleteTask, fetchTasks, setTaskStatus, updateTask } from './api'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'
import type { Task, TaskFilters, TaskInput, TaskStatus, TaskView } from './types'
import { countByView, filterTasks, taskViewFor, TASK_VIEWS } from './views'

function cacheKey(userId: string): string {
  return `tareas:tasks:${userId}`
}

function readCachedTasks(userId: string): Task[] {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '[]') as Task[]
  } catch {
    return []
  }
}

export function TasksPage() {
  const { session } = useAuth()
  const online = useOnline()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const timezone = localStorage.getItem('tareas:timezone') ?? DEFAULT_TIMEZONE
  const userId = session?.user.id ?? 'anon'
  const draftTitle = (location.state as { draftTitle?: string } | null)?.draftTitle

  const [view, setView] = useState<TaskView>('today')
  const [filters, setFilters] = useState<TaskFilters>({})
  const [searchInput, setSearchInput] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput }))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      if (!online) return readCachedTasks(userId)
      const tasks = await fetchTasks()
      localStorage.setItem(cacheKey(userId), JSON.stringify(tasks))
      return tasks
    },
  })

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
    enabled: online,
  })

  const tasks = tasksQuery.data ?? []

  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId || tasks.length === 0) return
    const found = tasks.find((task) => task.id === taskId)
    if (found) {
      setEditing(found)
      setFormOpen(true)
      searchParams.delete('task')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, tasks])

  useEffect(() => {
    if (draftTitle) {
      setEditing(null)
      setFormOpen(true)
    }
  }, [draftTitle])

  const profiles = useMemo(
    () => Object.fromEntries((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  )
  const counts = useMemo(() => countByView(tasks, timezone), [tasks, timezone])
  const visible = useMemo(
    () =>
      filterTasks(
        tasks.filter((task) => taskViewFor(task, timezone) === view),
        filters,
        timezone,
      ),
    [tasks, view, filters, timezone],
  )

  const allTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((task) => task.tags))).sort(),
    [tasks],
  )

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setFormOpen(true)
  }

  async function handleSave(input: TaskInput) {
    if (editing) await updateTask(editing.id, input)
    else await createTask(input, userId)
    setFormOpen(false)
    setEditing(null)
    await refresh()
  }

  async function handleStatus(task: Task, status: TaskStatus) {
    setBusyId(task.id)
    try {
      await setTaskStatus(task.id, status)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setBusyId(deleting.id)
    try {
      await deleteTask(deleting.id)
      setDeleting(null)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Mis tareas"
        subtitle="Organizadas por fecha y estado"
        action={
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" aria-hidden />
            Nueva
          </Button>
        }
      />

      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1">
        {TASK_VIEWS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setView(entry.value)}
            className={cn(
              'rounded-lg px-1 py-2 text-[11px] font-semibold transition',
              view === entry.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500',
            )}
          >
            {entry.label}
            <span className="ml-1 text-stone-400">{counts[entry.value]}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-stone-400" />
          <input
            className="field pl-9"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar tareas…"
            aria-label="Buscar tareas"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl border transition',
            showFilters
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-stone-300 bg-white text-stone-600',
          )}
          aria-label="Mostrar filtros"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
        </button>
      </div>

      {showFilters ? (
        <div className="card mb-3 space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              className="field"
              value={filters.status ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as TaskFilters['status'],
                }))
              }
            >
              <option value="all">Todos los estados</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={filters.priority ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  priority: event.target.value as TaskFilters['priority'],
                }))
              }
            >
              <option value="all">Todas las prioridades</option>
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="field"
              value={filters.assignee ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  assignee: event.target.value as TaskFilters['assignee'],
                }))
              }
            >
              <option value="all">Cualquier responsable</option>
              <option value="unassigned">Sin asignar</option>
              {profilesQuery.data?.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || 'Sin nombre'}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={filters.tag ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  tag: event.target.value,
                }))
              }
            >
              <option value="all">Todas las etiquetas</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {tasksQuery.isLoading ? <Spinner label="Cargando tus tareas…" /> : null}
      {tasksQuery.isError ? (
        <ErrorState
          message="No se pudieron cargar las tareas. Revisa tu conexión e inténtalo de nuevo."
          onRetry={() => void refresh()}
        />
      ) : null}

      {tasksQuery.isSuccess && visible.length === 0 ? (
        <EmptyState
          icon={<CheckSquare2 className="size-7" aria-hidden />}
          title={
            tasks.length === 0 ? 'Todavía no tienes tareas' : 'No hay tareas en esta vista'
          }
          description={
            tasks.length === 0
              ? 'Créala a mano o pídele al asistente en el chat que te la cree.'
              : 'Prueba con otro filtro o cambia de vista.'
          }
          action={
            tasks.length === 0 ? (
              <Button onClick={openNew}>
                <Plus className="size-4" aria-hidden />
                Crear mi primera tarea
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="space-y-2">
        {visible.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            timezone={timezone}
            profiles={profiles}
            onEdit={() => openEdit(task)}
            onDelete={() => setDeleting(task)}
            onStatusChange={(status) => void handleStatus(task, status)}
          />
        ))}
      </div>

      <TaskForm
        key={editing?.id ?? 'new'}
        open={formOpen}
        task={editing}
        profiles={profilesQuery.data ?? []}
        initialTitle={draftTitle}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSave={handleSave}
      />

      <Modal
        open={Boolean(deleting)}
        title="Eliminar tarea"
        onClose={() => setDeleting(null)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busyId === deleting?.id}
              onClick={() => void handleDelete()}
            >
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-stone-600">
          ¿Eliminar «{deleting?.title}»? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  )
}
