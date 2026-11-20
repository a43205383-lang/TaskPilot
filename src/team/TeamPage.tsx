import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { fetchProfiles } from '../auth/api'
import { Banner, EmptyState, ErrorState, PageHeader, Spinner, TaskStatusBadge } from '../shared/ui'
import { DEFAULT_TIMEZONE, formatTaskDate, initials, ROLE_LABELS } from '../shared/utils'
import type { Task } from '../tasks/types'
import { assignTask, fetchAllTasks } from './api'

export function TeamPage() {
  const { isSupervisor } = useAuth()
  const queryClient = useQueryClient()
  const timezone = localStorage.getItem('tareas:timezone') ?? DEFAULT_TIMEZONE
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const tasksQuery = useQuery({ queryKey: ['team-tasks'], queryFn: fetchAllTasks, enabled: isSupervisor })
  const profilesQuery = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles, enabled: isSupervisor })

  const profiles = useMemo(
    () => Object.fromEntries((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  )

  const tasks = tasksQuery.data ?? []
  const visible = assigneeFilter === 'all'
    ? tasks
    : assigneeFilter === 'unassigned'
      ? tasks.filter((task) => !task.assignee_id)
      : tasks.filter((task) => task.assignee_id === assigneeFilter)

  const byPerson = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      if (task.status === 'done') continue
      const key = task.assignee_id ?? 'unassigned'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [tasks])

  async function changeAssignee(task: Task, value: string) {
    await assignTask(task.id, value || null)
    await queryClient.invalidateQueries({ queryKey: ['team-tasks'] })
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  if (!isSupervisor) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-7" aria-hidden />}
        title="Solo para supervisores"
        description="Esta vista muestra las tareas de todo el equipo y permite asignarlas."
        action={
          <Link to="/tasks" className="text-sm font-semibold text-brand-700 underline">
            Volver a mis tareas
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <PageHeader title="Equipo" subtitle="Todas las tareas, asignables por persona" />

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(profilesQuery.data ?? []).map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => setAssigneeFilter(profile.id)}
            className={`card flex items-center gap-2 p-2.5 text-left transition ${
              assigneeFilter === profile.id ? 'border-brand-500 bg-brand-50' : ''
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
              {initials(profile.full_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-stone-800">
                {profile.full_name || 'Sin nombre'}
              </span>
              <span className="block text-[10px] text-stone-500">
                {byPerson.get(profile.id) ?? 0} pendientes
              </span>
            </span>
          </button>
        ))}
      </div>

      <select
        className="field mb-3"
        value={assigneeFilter}
        onChange={(event) => setAssigneeFilter(event.target.value)}
      >
        <option value="all">Todas las personas</option>
        <option value="unassigned">Sin asignar</option>
        {(profilesQuery.data ?? []).map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.full_name || 'Sin nombre'}
          </option>
        ))}
      </select>

      {tasksQuery.isLoading ? <Spinner label="Cargando tareas del equipo…" /> : null}
      {tasksQuery.isError ? (
        <ErrorState
          message="No se pudo cargar la bandeja del equipo."
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['team-tasks'] })}
        />
      ) : null}

      {tasksQuery.isSuccess && visible.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" aria-hidden />}
          title="No hay tareas aquí"
          description="Prueba con otra persona o espera a que se creen tareas nuevas."
        />
      ) : null}

      <div className="space-y-2">
        {visible.map((task) => (
          <article key={task.id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  to={`/tasks?task=${task.id}`}
                  className="break-words text-sm font-semibold text-stone-900 hover:text-brand-700"
                >
                  {task.title}
                </Link>
                <p className="mt-1 text-[11px] text-stone-500">
                  {formatTaskDate(task.due_date, timezone)} · {ROLE_LABELS[profiles[task.user_id]?.role ?? 'employee']}
                </p>
              </div>
              <TaskStatusBadge status={task.status} />
            </div>
            <select
              className="field mt-2"
              value={task.assignee_id ?? ''}
              onChange={(event) => void changeAssignee(task, event.target.value)}
            >
              <option value="">Sin asignar</option>
              {(profilesQuery.data ?? []).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || 'Sin nombre'}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>

      <div className="mt-4">
        <Banner tone="info">
          Los cambios de responsable se guardan al instante. Las tareas ajenas solo son visibles
          para perfiles con rol de supervisor.
        </Banner>
      </div>
    </div>
  )
}
