import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ChartPie,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { cn } from '../lib/utils'

export function AppLayout() {
  const { isAccountant, profile } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <ReceiptText className="size-5" aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">TaskPilot</p>
              <p className="text-[11px] text-stone-500">
                {profile?.full_name ? profile.full_name : 'Gastos de la empresa'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!online ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                <WifiOff className="size-3.5" aria-hidden />
                Sin conexión
              </span>
            ) : null}
            {isAccountant ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                <ShieldCheck className="size-3.5" aria-hidden />
                Contador
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pt-1.5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-end justify-around px-2">
          <NavItem to="/" label="Gastos" icon={ReceiptText} end />
          <NavItem to="/summary" label="Resumen" icon={ChartPie} />
          <NavLink
            to="/capture"
            className={({ isActive }) =>
              cn(
                'flex min-w-16 flex-col items-center gap-0.5 pb-1 text-[11px] font-semibold transition',
                isActive ? 'text-brand-700' : 'text-stone-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    '-mt-5 flex size-13 items-center justify-center rounded-full border-4 border-stone-50 shadow-lg transition',
                    isActive ? 'bg-brand-700 text-white' : 'bg-brand-600 text-white',
                  )}
                >
                  <Plus className="size-6" aria-hidden />
                </span>
                <span>Capturar</span>
              </>
            )}
          </NavLink>
          {isAccountant ? (
            <NavItem to="/approvals" label="Contador" icon={ShieldCheck} />
          ) : null}
          <NavItem to="/account" label="Cuenta" icon={UserRound} />
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end = false,
}: {
  to: string
  label: string
  icon: typeof ReceiptText
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 pb-1.5 pt-1 text-[11px] font-medium transition',
          isActive ? 'text-brand-700' : 'text-stone-500 hover:text-stone-700',
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      <span>{label}</span>
    </NavLink>
  )
}
