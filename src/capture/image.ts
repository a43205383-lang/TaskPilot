const MAX_SIDE = 1600
const MAX_BYTES = 1_572_864 // 1.5 MiB, igual que el bucket

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Redimensiona a 1600 px por lado y baja la calidad hasta quedar bajo 1.5 MB.
 * Los PDF se dejan intactos (el bucket también los admite).
 */
export async function compressReceipt(file: File): Promise<File> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) {
      throw new Error('El PDF supera 1.5 MB. Divídelo o reduce su tamaño.')
    }
    return file
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona una imagen o un PDF.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no pudo procesar la imagen.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.85
  let blob = await canvasToBlob(canvas, quality)

  while (blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, quality)
  }

  if (blob.size > MAX_BYTES) {
    // Último recurso: reducir de nuevo a la mitad.
    const small = document.createElement('canvas')
    small.width = Math.max(1, Math.round(width / 2))
    small.height = Math.max(1, Math.round(height / 2))
    const smallContext = small.getContext('2d')
    if (!smallContext) throw new Error('No se pudo reducir la imagen.')
    smallContext.drawImage(canvas, 0, 0, small.width, small.height)
    blob = await canvasToBlob(small, 0.7)
  }

  if (blob.size > MAX_BYTES) {
    throw new Error('No se pudo comprimir la imagen por debajo de 1.5 MB.')
  }

  return new File([blob], 'recibo.jpg', { type: 'image/jpeg', lastModified: Date.now() })
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export { MAX_BYTES, MAX_SIDE }
