import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  BrainCircuit,
  Download,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, PageHeader, Spinner } from '../shared/ui'
import { fetchAiUsageToday } from './api'
import { formatDate } from '../shared/utils'

const DAILY_LIMIT = 30

export function AccountPage() {
  const { profile, session, isAccountant, signOut } = useAuth()
  const userId = session?.user.id

  const usageQuery = useQuery({
    queryKey: ['ai-usage', userId],
    queryFn: () => fetchAiUsageToday(userId!),
    enabled: Boolean(userId),
  })

  if (!profile) return <Spinner label="Cargando tu cuenta…" />

  const used = usageQuery.data ?? 0
  const percentage = Math.min(100, (used / DAILY_LIMIT) * 100)

  return (
    <div className="space-y-3">
      <PageHeader title="Cuenta" subtitle="Tu perfil y los límites de la app" />

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <UserRound className="size-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{profile.full_name ?? 'Sin nombre'}</p>
            <p className="flex items-center gap-1 truncate text-sm text-stone-500">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              {session?.user.email}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Rol</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
              {isAccountant ? (
                <>
                  <ShieldCheck className="size-4 text-brand-700" aria-hidden />
                  Contador
                </>
              ) : (
                <>
                  <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
                  Empleado
                </>
              )}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              Miembro desde
            </p>
            <p className="mt-0.5 text-sm font-semibold">{formatDate(profile.created_at.slice(0, 10))}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-5 text-brand-700" aria-hidden />
          <h2 className="text-sm font-semibold">Uso de IA hoy</h2>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums">
          {used} <span className="text-sm font-medium text-stone-500">/ {DAILY_LIMIT}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full ${percentage > 80 ? 'bg-red-500' : 'bg-brand-600'}`}
            style={{ width: `${Math.max(2, percentage)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Cada análisis de recibo consume una llamada. El límite protege el costo de la IA y se
          reinicia a medianoche.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2">
          <Download className="size-5 text-brand-700" aria-hidden />
          <h2 className="text-sm font-semibold">Instalar en el celular</h2>
        </div>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
          <li>
            <span className="font-medium">iPhone:</span> Compartir → “Añadir a pantalla de inicio”.
          </li>
          <li>
            <span className="font-medium">Android:</span> menú ⋮ → “Instalar aplicación”.
          </li>
        </ul>
      </div>

      <Button variant="secondary" size="lg" block onClick={() => void signOut()}>
        <LogOut className="size-4" aria-hidden />
        Cerrar sesión
      </Button>

      <p className="pb-3 text-center text-[11px] text-stone-400">
        TaskPilot · Supabase + IA con visión
      </p>
    </div>
  )
}
