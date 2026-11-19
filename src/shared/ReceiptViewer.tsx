import { useEffect, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button, Modal } from './ui'

export function ReceiptViewer({
  url,
  open,
  onClose,
}: {
  url: string | null | undefined
  open: boolean
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const isPdf = Boolean(url && url.split('?')[0].toLowerCase().endsWith('.pdf'))

  useEffect(() => {
    if (open) setScale(1)
  }, [open])

  return (
    <Modal open={open} title="Recibo original" onClose={onClose}>
      {!url ? (
        <p className="py-8 text-center text-sm text-stone-500">No hay imagen disponible.</p>
      ) : isPdf ? (
        <iframe
          src={url}
          title="Recibo PDF"
          className="h-[70dvh] w-full rounded-xl border border-stone-200"
        />
      ) : (
        <>
          <div className="max-h-[65dvh] overflow-auto rounded-xl bg-stone-900">
            <img
              src={url}
              alt="Recibo ampliado"
              className="max-w-none origin-top"
              style={{ width: `${scale * 100}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setScale((value) => Math.max(1, Number((value - 0.5).toFixed(1))))}
              aria-label="Reducir"
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <span className="w-16 text-center text-sm font-semibold tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setScale((value) => Math.min(4, Number((value + 0.5).toFixed(1))))}
              aria-label="Ampliar"
            >
              <Plus className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setScale(1)}>
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
