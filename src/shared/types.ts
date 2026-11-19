// Enums y constantes del dominio, compartidos entre la UI y las features.

export type AppRole = 'employee' | 'supervisor'
export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export const TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done']
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high']

/** Zona horaria por defecto del brief (República Dominicana). */
export const DEFAULT_TIMEZONE = 'America/Santo_Domingo'
