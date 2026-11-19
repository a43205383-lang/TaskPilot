// Supabase Edge Function: extract-receipt
// Recibe { path } de una imagen/PDF ya subido a Storage, la analiza con Gemini
// y devuelve JSON validado con Zod. La clave nunca sale del servidor.
//
// Variables de entorno (Dashboard > Edge Functions > Secrets):
//   GEMINI_API_KEY   obligatoria
//   GEMINI_MODEL     opcional (por defecto gemini-2.5-flash)
// SUPABASE_URL y SUPABASE_ANON_KEY las inyecta Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4.6.7'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const CATEGORIES = [
  'alimentos',
  'combustible',
  'transporte',
  'oficina',
  'servicios',
  'otros',
] as const

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let text = String(raw).replace(/[^\d.,-]/g, '')
  if (!text) return null
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, '')
  } else if (text.includes(',')) {
    text = text.replace(',', '.')
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const amount = z.preprocess(parseAmount, z.number().nullable())

const dateValue = z.preprocess((raw) => {
  if (typeof raw !== 'string') return null
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  return match ? match[0] : null
}, z.string().nullable())

const confidenceValue = z.preprocess((raw) => {
  const parsed = parseAmount(raw)
  if (parsed === null) return 0.5
  return Math.min(1, Math.max(0, parsed))
}, z.number())

const extractionSchema = z.object({
  is_receipt: z.boolean(),
  document_type: z.enum(['receipt', 'invoice', 'other']).catch('other'),
  merchant: z.string().trim().min(1).nullable().catch(null).default(null),
  expense_date: dateValue,
  currency: z.enum(['DOP', 'USD']).nullable().catch(null).default(null),
  subtotal: amount,
  itbis: amount,
  tip: amount,
  total: amount,
  payment_method: z.string().trim().nullable().catch(null).default(null),
  rnc: z.string().trim().nullable().catch(null).default(null),
  ncf: z.string().trim().nullable().catch(null).default(null),
  category: z.enum(CATEGORIES).catch('otros'),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        quantity: amount,
        unit_price: amount,
        line_total: amount,
      }),
    )
    .catch([])
    .default([]),
  confidence: z.record(z.string(), confidenceValue).catch({}).default({}),
  notes: z.string().trim().nullable().catch(null).default(null),
})

type Extraction = z.infer<typeof extractionSchema>

const PROMPT = `Eres un extractor de datos de recibos y facturas de República Dominicana.

Analiza la imagen y devuelve SOLO un objeto JSON válido, sin markdown ni explicaciones.

Reglas:
- Si la imagen no es un recibo/factura, o es demasiado ilegible para leerla, devuelve is_receipt=false y todos los campos de datos en null. NUNCA inventes datos.
- No adivines importes, fechas ni RNC/NCF. Si no se lee, usa null y confianza 0.
- Fechas en formato YYYY-MM-DD. Si solo hay día/mes, usa el año actual solo si aparece impreso; si no, null.
- Importes como números (sin símbolos ni separadores de miles). Interpreta coma o punto decimal.
- Moneda: "DOP" si el recibo es dominicano o no indica otra; "USD" solo si el documento lo dice explícitamente.
- ITBIS: solo el impuesto impreso. No calcules 18% por tu cuenta. Si dice "ITBIS 18%" y muestra el monto, úsalo.
- La propina es aparte del ITBIS.
- RNC: 9 u 11 dígitos si aparecen. NCF: formato B01/B02/B14/B15/e-CF si aparece.
- Categoría: alimentos, combustible, transporte, oficina, servicios u otros.
- "confidence": objeto con un número de 0 a 1 por cada campo (merchant, expense_date, currency, subtotal, itbis, tip, total, payment_method, rnc, ncf, category). Usa 0 si el campo no existe.
- items: líneas de detalle solo si el recibo las muestra; quantity y unit_price pueden ser null.
- document_type: "invoice" si tiene RNC/NCF, "receipt" si es un recibo simple, "other" en otro caso.

Formato exacto:
{
  "is_receipt": true,
  "document_type": "receipt",
  "merchant": "Nombre del comercio",
  "expense_date": "2026-11-19",
  "currency": "DOP",
  "subtotal": 1000.00,
  "itbis": 180.00,
  "tip": null,
  "total": 1180.00,
  "payment_method": "Efectivo",
  "rnc": null,
  "ncf": null,
  "category": "alimentos",
  "items": [
    { "description": "Producto", "quantity": 1, "unit_price": 1000.00, "line_total": 1000.00 }
  ],
  "confidence": {
    "merchant": 0.95, "expense_date": 0.9, "currency": 0.99, "subtotal": 0.9,
    "itbis": 0.9, "tip": 0, "total": 0.95, "payment_method": 0.8,
    "rnc": 0, "ncf": 0, "category": 0.85
  },
  "notes": null
}`

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

async function callGemini(input: {
  apiKey: string
  model: string
  mimeType: string
  base64: string
  prompt: string
}): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    input.model,
  )}:generateContent?key=${encodeURIComponent(input.apiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: input.prompt },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Gemini respondió ${response.status}: ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    promptFeedback?: { blockReason?: string }
  }

  if (payload.promptFeedback?.blockReason) {
    throw new Error(`La imagen fue bloqueada por el proveedor: ${payload.promptFeedback.blockReason}`)
  }

  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''
  )
}

function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('La respuesta no contiene JSON.')
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ ok: false, code: 'method', error: 'Método no permitido' }, 405)
  }

  try {
    const authHeader = request.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, code: 'auth', error: 'Falta el token de sesión' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) {
      return json({ ok: false, code: 'config', error: 'Faltan variables de Supabase' }, 500)
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return json({ ok: false, code: 'auth', error: 'Sesión inválida' }, 401)
    }
    const user = userData.user

    const body = (await request.json().catch(() => null)) as { path?: unknown } | null
    const path = typeof body?.path === 'string' ? body.path : ''
    if (!path || !path.startsWith(`${user.id}/`) || path.includes('..')) {
      return json({ ok: false, code: 'path', error: 'Ruta de imagen no válida' }, 400)
    }

    // La ruta debe estar registrada y pertenecer al usuario (RLS).
    const { data: imageRow, error: imageError } = await supabase
      .from('expense_images')
      .select('id')
      .eq('storage_path', path)
      .maybeSingle()
    if (imageError || !imageRow) {
      return json({ ok: false, code: 'path', error: 'La imagen no está registrada' }, 403)
    }

    // Cuota diaria por usuario (RF-35).
    const { error: quotaError } = await supabase.rpc('consume_ai_quota')
    if (quotaError) {
      return json(
        { ok: false, code: 'quota', error: quotaError.message },
        quotaError.message.toLowerCase().includes('límite') ? 429 : 500,
      )
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(path)
    if (downloadError || !file) {
      return json(
        { ok: false, code: 'download', error: downloadError?.message ?? 'No se encontró la imagen' },
        404,
      )
    }
    if (file.size > 1_600_000) {
      return json({ ok: false, code: 'size', error: 'La imagen supera 1.6 MB' }, 413)
    }

    let mimeType = file.type
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
      const lower = path.toLowerCase()
      if (lower.endsWith('.pdf')) mimeType = 'application/pdf'
      else if (lower.endsWith('.png')) mimeType = 'image/png'
      else if (lower.endsWith('.webp')) mimeType = 'image/webp'
      else mimeType = 'image/jpeg'
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return json(
        { ok: false, code: 'config', error: 'Falta configurar GEMINI_API_KEY en los Secrets' },
        500,
      )
    }

    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
    const base64 = toBase64(new Uint8Array(await file.arrayBuffer()))

    let prompt = PROMPT
    let lastError = ''
    let lastRaw = ''

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callGemini({ apiKey, model, mimeType, base64, prompt })
        lastRaw = text
        const parsed = extractionSchema.safeParse(parseJson(text))
        if (parsed.success) {
          return json({
            ok: true,
            model,
            data: parsed.data satisfies Extraction,
          })
        }
        lastError = parsed.error.issues
          .slice(0, 6)
          .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
          .join('; ')
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Error desconocido de la IA'
      }

      prompt = `${PROMPT}

Tu respuesta anterior no pasó la validación (${lastError}).
Corrige esos problemas y devuelve de nuevo SOLO el JSON completo.`
    }

    return json(
      {
        ok: false,
        code: 'invalid_json',
        error: `La IA no devolvió datos válidos: ${lastError}`,
        raw: lastRaw.slice(0, 1500),
      },
      422,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return json({ ok: false, code: 'internal', error: message }, 500)
  }
})
