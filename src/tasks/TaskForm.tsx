import { useState, type FormEvent } from 'react'
import type { Profile } from '../auth/types'
import { Button, FieldError, Label, Modal } from '../shared/ui'
import {
  localDateTimeValue,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '../shared/utils'
import type { Task, TaskInput, TaskPriority, TaskStatus } from './types'

export function TaskForm({
  open,
  task,
  profiles,
  initialTitle,
  onClose,
  onSave,
}: {
  open: boolean
  task: Task | null
  profiles: Profile[]
  initialTitle?: string
  onClose: () => void
  onSave: (input: TaskInput) => Promise<void>
}) {
  const [title, setTitle] = useState(task?.title ?? initialTitle ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState(localDateTimeValue(task?.due_date))
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pending')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // El modal se monta/desmonta en cada apertura desde TasksPage (key={task?.id ?? 'new'}).

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (title.trim().length < 2) next.title = 'El título es obligatorio.'
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) next.dueDate = 'Fecha no válida.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    setErrors({})
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        status,
        assignee_id: assigneeId || null,
        tags: tags
          .split(',')
          .map((tag) => tag.trim().replace(/^#/, ''))
          .filter(Boolean),
      })
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'No se pudo guardar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <Label>Título</Label>
          <input
            className={`field ${errors.title ? 'field-low' : ''}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cobrarle a Juan"
            autoFocus
          />
          <FieldError message={errors.title} />
        </div>

        <div>
          <Label aside={<span className="text-xs text-stone-400">Opcional</span>}>Descripción</Label>
          <textarea
            className="field min-h-20 resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Detalles, enlaces, contexto…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fecha límite</Label>
            <input
              type="datetime-local"
              className={`field ${errors.dueDate ? 'field-low' : ''}`}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <FieldError message={errors.dueDate} />
          </div>
          <div>
            <Label>Prioridad</Label>
            <select
              className="field"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {TASK_PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Estado</Label>
            <select
              className="field"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {TASK_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label aside={<span className="text-xs text-stone-400">Opcional</span>}>
              Responsable
            </Label>
            <select
              className="field"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">Sin asignar</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name || 'Sin nombre'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label aside={<span className="text-xs text-stone-400">Separadas por coma</span>}>
            Etiquetas
          </Label>
          <input
            className="field"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="ventas, urgente"
          />
        </div>

        {errors.form ? <FieldError message={errors.form} /> : null}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={saving} className="flex-1">
            {task ? 'Guardar' : 'Crear tarea'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
