import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signReceiptPaths } from './api'

export function useSignedUrls(paths: Array<string | null | undefined>): Record<string, string> {
  const unique = useMemo(
    () => Array.from(new Set(paths.filter((path): path is string => Boolean(path)))).sort(),
    // La clave estable evita refetch por un array nuevo en cada render.
    [paths.join('|')],
  )

  const query = useQuery({
    queryKey: ['signed-urls', unique],
    queryFn: () => signReceiptPaths(unique),
    enabled: unique.length > 0,
    staleTime: 50 * 60 * 1000,
    placeholderData: {},
  })

  return query.data ?? {}
}
