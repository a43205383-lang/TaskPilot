import { fetchTasks } from './api'
import type { Task } from './types'

function cacheKey(userId: string): string {
  return `tareas:tasks:${userId}`
}

export function readCachedTasks(userId: string): Task[] {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '[]') as Task[]
  } catch {
    return []
  }
}

export async function fetchTasksWithCache(userId: string, online: boolean): Promise<Task[]> {
  if (!online) return readCachedTasks(userId)
  try {
    const tasks = await fetchTasks()
    localStorage.setItem(cacheKey(userId), JSON.stringify(tasks))
    return tasks
  } catch (error) {
    const cachedTasks = readCachedTasks(userId)
    if (cachedTasks.length > 0) return cachedTasks
    throw error
  }
}
