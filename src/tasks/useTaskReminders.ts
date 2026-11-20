import { useEffect } from 'react'
import type { Task } from './types'

const REMINDER_WINDOW_MS = 60 * 60 * 1000

export function useTaskReminders(userId: string | undefined, tasks: Task[], timezone: string) {
  useEffect(() => {
    if (!userId || typeof Notification === 'undefined') return

    let disposed = false
    const checkDueTasks = async () => {
      if (Notification.permission !== 'granted') return
      const now = Date.now()
      const dueSoon = tasks.filter((task) => {
        if (!task.due_date || task.status === 'done') return false
        const timeLeft = new Date(task.due_date).getTime() - now
        return timeLeft > 0 && timeLeft <= REMINDER_WINDOW_MS
      })

      for (const task of dueSoon) {
        if (disposed) return
        const key = `tareas:reminder:${userId}:${task.id}:${task.due_date}`
        try {
          const marker = localStorage.getItem(key)
          if (marker === 'sent') continue
          if (marker?.startsWith('pending:') && now - Number(marker.slice(8)) < 120_000) continue
          localStorage.setItem(key, `pending:${now}`)
          const dueTime = new Intl.DateTimeFormat('es-DO', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          }).format(new Date(task.due_date!))
          const options: NotificationOptions & { data: { url: string } } = {
            body: `Vence hoy a las ${dueTime}.`,
            tag: key,
            data: { url: `/tasks?task=${encodeURIComponent(task.id)}` },
          }

          if ('serviceWorker' in navigator && import.meta.env.PROD) {
            const registration = await navigator.serviceWorker.ready
            if (disposed) return
            await registration.showNotification('Tarea por vencer', options)
          } else {
            const notification = new Notification('Tarea por vencer', options)
            notification.onclick = () => window.focus()
          }
          localStorage.setItem(key, 'sent')
        } catch {
          localStorage.removeItem(key)
        }
      }
    }

    void checkDueTasks()
    const timer = window.setInterval(() => void checkDueTasks(), 60_000)
    window.addEventListener('taskpilot:notifications-enabled', checkDueTasks)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('taskpilot:notifications-enabled', checkDueTasks)
    }
  }, [userId, tasks, timezone])
}
