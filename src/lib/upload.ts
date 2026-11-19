import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/**
 * Sube al bucket con XMLHttpRequest para tener progreso real.
 * El cliente de Supabase no expone upload.onprogress.
 */
export async function uploadReceipt(
  file: File,
  path: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('La sesión expiró. Vuelve a iniciar sesión.')

  const endpoint = `${SUPABASE_URL}/storage/v1/object/receipts/${encodePath(path)}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint, true)
    xhr.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`)
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.timeout = 120_000

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
        return
      }
      let message = `La subida falló (${xhr.status}).`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message ?? body.error ?? message
      } catch {
        // respuesta no JSON
      }
      reject(new Error(message))
    }

    xhr.onerror = () => reject(new Error('Error de red durante la subida.'))
    xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Intenta de nuevo.'))
    xhr.send(file)
  })
}
