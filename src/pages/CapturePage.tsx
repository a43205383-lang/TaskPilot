import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Modal } from '../components/ui'
import { compressReceipt, sha256Hex } from '../lib/image'
import { uploadReceipt } from '../lib/upload'
import {
  applyExtraction,
  createDraftExpense,
  findDuplicateByHash,
  registerReceiptImage,
  updateExpense,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { formatDate, money, errorMessage } from '../lib/utils'
import { queryClient } from '../lib/queryClient'
import type { ExtractResponse } from '../lib/types'

type Duplicate = {
  id: string
  merchant: string | null
  expense_date: string | null
  total: number | null
}

export function CapturePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [selected, setSelected] = useState<{ file: File; previewUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)

  useEffect(() => {
    return () => {
      if (selected) URL.revokeObjectURL(selected.previewUrl)
    }
  }, [selected])

  function pickFile(file: File | null | undefined) {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Selecciona una foto o un PDF.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('El archivo es demasiado grande (máximo 25 MB antes de comprimir).')
      return
    }
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected({ file, previewUrl: URL.createObjectURL(file) })
  }

  function reset() {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected(null)
    setProgress(0)
    setStep('')
    setError(null)
    setDuplicate(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  async function process(force = false) {
    if (!selected || !session?.user) return
    setBusy(true)
    setError(null)
    setDuplicate(null)

    let uploadedPath: string | null = null
    try {
      setStep('Optimizando imagen…')
      setProgress(0.05)
      const compressed = await compressReceipt(selected.file)
      const hash = await sha256Hex(compressed)

      if (!force) {
        const found = await findDuplicateByHash(hash).catch(() => null)
        if (found) {
          setDuplicate(found)
          setBusy(false)
          setStep('')
          return
        }
      }

      const expenseId = crypto.randomUUID()
      const extension = compressed.type === 'application/pdf' ? 'pdf' : 'jpg'
      const path = `${session.user.id}/${expenseId}/${crypto.randomUUID()}.${extension}`

      setStep('Subiendo recibo…')
      await uploadReceipt(compressed, path, (fraction) => setProgress(fraction))
      uploadedPath = path

      setStep('Creando el gasto…')
      await createDraftExpense({
        id: expenseId,
        userId: session.user.id,
        receiptHash: hash,
      })
      await registerReceiptImage({
        expenseId,
        path,
        mimeType: compressed.type,
        sizeBytes: compressed.size,
      })

      setStep('Analizando con IA…')
      setProgress(1)

      try {
        const { data, error: functionError } = await supabase.functions.invoke<ExtractResponse>(
          'extract-receipt',
          { body: { path } },
        )

        if (functionError || !data?.ok || !data.data) {
          await updateExpense(expenseId, {
            needs_review: true,
            review_reasons: ['ai_error'],
            status: 'requires_review',
          })
        } else {
          await applyExtraction(expenseId, data.data, data.model ?? null)
        }
      } catch {
        await updateExpense(expenseId, {
          needs_review: true,
          review_reasons: ['ai_error'],
          status: 'requires_review',
        }).catch(() => undefined)
      }

      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      navigate(`/expenses/${expenseId}/review?new=1`, { replace: true })
    } catch (processError) {
      if (uploadedPath) {
        await supabase.storage.from('receipts').remove([uploadedPath]).catch(() => undefined)
      }
      setError(errorMessage(processError))
      setBusy(false)
      setStep('')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Capturar recibo</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Toma la foto con buena luz y el recibo completo dentro del encuadre.
        </p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => pickFile(event.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => pickFile(event.target.files?.[0])}
      />

      {!selected ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="card flex w-full flex-col items-center gap-3 px-5 py-10 text-center transition active:scale-[0.99]"
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/20">
              <Camera className="size-8" aria-hidden />
            </span>
            <span className="text-base font-semibold">Tomar foto</span>
            <span className="max-w-xs text-sm text-stone-500">
              Abre la cámara trasera. Si el navegador pide permiso, acéptalo.
            </span>
          </button>

          <Button variant="secondary" size="lg" block onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="size-5" aria-hidden />
            Elegir de la galería o un PDF
          </Button>

          <div className="flex items-start gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <p>
              ¿La cámara no abre? Revisa los permisos del navegador para este sitio o usa la
              galería. La imagen se comprime antes de subirse y queda en un bucket privado.
            </p>
          </div>

          {error ? <Banner tone="error">{error}</Banner> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card overflow-hidden">
            {selected.file.type === 'application/pdf' ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 bg-stone-100 text-stone-600">
                <FileText className="size-12" aria-hidden />
                <p className="max-w-[80%] truncate text-sm font-medium">{selected.file.name}</p>
                <p className="text-xs">PDF listo para analizar</p>
              </div>
            ) : (
              <img
                src={selected.previewUrl}
                alt="Vista previa del recibo"
                className="max-h-[52dvh] w-full bg-stone-900 object-contain"
              />
            )}
          </div>

          {busy ? (
            <div className="card space-y-2 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-stone-700">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {step || 'Procesando…'}
                </span>
                <span className="tabular-nums text-stone-500">{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
                />
              </div>
              <p className="text-xs text-stone-500">
                No cierres la app. Si algo falla, podrás reintentar sin perder la foto.
              </p>
            </div>
          ) : null}

          {error ? <Banner tone="error">{error}</Banner> : null}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={reset} disabled={busy}>
              <RotateCcw className="size-4" aria-hidden />
              Repetir
            </Button>
            <Button size="lg" onClick={() => void process()} loading={busy}>
              <Sparkles className="size-4" aria-hidden />
              Procesar
            </Button>
          </div>

          <p className="text-center text-xs text-stone-500">
            Se permiten hasta 30 análisis de IA por día.
          </p>
        </div>
      )}

      <Modal
        open={Boolean(duplicate)}
        title="Posible recibo duplicado"
        onClose={() => setDuplicate(null)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDuplicate(null)
                reset()
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setDuplicate(null)
                void process(true)
              }}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Continuar igual
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Ya existe un gasto con exactamente esta misma imagen.</p>
          </div>
          {duplicate ? (
            <div className="rounded-xl border border-stone-200 p-3 text-sm">
              <p className="font-semibold">{duplicate.merchant ?? 'Sin comercio'}</p>
              <p className="text-stone-500">{formatDate(duplicate.expense_date)}</p>
              <p className="mt-1 font-bold">{money(duplicate.total)}</p>
              <Link
                to={`/expenses/${duplicate.id}`}
                className="mt-2 inline-block text-sm font-semibold text-brand-700 underline"
              >
                Ver el gasto existente
              </Link>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
