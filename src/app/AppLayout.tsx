import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CheckSquare2, MessageCircle, UserRound, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { cn, initials, ROLE_LABELS } from '../shared/utils'
import { useOnline } from '../shared/useOnline'

function NavItem({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: ReactNode
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-500 hover:bg-stone-50',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

export function AppLayout() {
  const { profile, session, isSupervisor, signOut } = useAuth()
  const online = useOnline()
  const [timezone, setTimezone] = useState<string>(() =>
    localStorage.getItem('tareas:timezone') ?? 'America/Santo_Domingo',
  )

  useEffect(() => {
    const onStorage = () => {
      setTimezone(localStorage.getItem('tareas:timezone') ?? 'America/Santo_Domingo')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const name = profile?.full_name || session?.user.email?.split('@')[0] || 'Usuario'

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <CheckSquare2 className="size-5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-stone-900">TaskPilot</p>
              <p className="text-[11px] text-stone-500">{timezone.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <p className="max-w-28 truncate text-xs font-semibold text-stone-800">{name}</p>
              <p className="text-[10px] text-stone-500">
                {profile ? ROLE_LABELS[profile.role] : '…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
              aria-label="Cerrar sesión"
              title={name}
            >
              {initials(profile?.full_name, session?.user.email)}
            </button>
          </div>
        </div>
      </header>

      {!online ? (
        <div className="bg-amber-100 px-3 py-1.5 text-center text-xs font-semibold text-amber-900">
          Sin conexión · mostrando las últimas tareas guardadas
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-lg px-3 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 px-2 pt-1.5 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-1">
          <NavItem to="/tasks" label="Tareas" icon={<CheckSquare2 className="size-5" />} />
          <NavItem to="/chat" label="Chat" icon={<MessageCircle className="size-5" />} />
          {isSupervisor ? (
            <NavItem to="/team" label="Equipo" icon={<Users className="size-5" />} />
          ) : null}
          <NavItem to="/profile" label="Perfil" icon={<UserRound className="size-5" />} />
        </div>
      </nav>
    </div>
  )
}
