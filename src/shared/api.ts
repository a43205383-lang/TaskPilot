import { supabase } from './supabase'

export async function signReceiptPaths(paths: Array<string | null>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (unique.length === 0) return {}

  const { data, error } = await supabase.storage.from('receipts').createSignedUrls(unique, 3600)
  if (error) throw error

  const map: Record<string, string> = {}
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl
  }
  return map
}
