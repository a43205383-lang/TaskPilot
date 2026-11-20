import { BellRing, Download, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, PageHeader } from '../shared/ui'
import { DEFAULT_TIMEZONE, initials, ROLE_LABELS } from '../shared/utils'

const TIMEZONES = [
  { value: 'America/Santo_Domingo', label: 'República Dominicana (GMT-4)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)' },
  { value: 'UTC', label: 'UTC' },
]

export function ProfilePage() {
  const { profile, session, signOut } = useAuth()
  const timezone = localStorage.getItem('tareas:timezone') ?? DEFAULT_TIMEZONE
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    () => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null)

  function changeTimezone(value: string) {
    localStorage.setItem('tareas:timezone', value)
    window.dispatchEvent(new Event('storage'))
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      setNotificationMessage(permission === 'granted'
        ? 'Recordatorios activados en este dispositivo.'
        : 'No se concedió permiso. Puedes cambiarlo en los ajustes del navegador.')
      if (permission === 'granted') {
        window.dispatchEvent(new Event('taskpilot:notifications-enabled'))
      }
    } catch {
      setNotificationMessage('No se pudo activar el permiso de notificaciones en este navegador.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Mi perfil" subtitle="Cuenta y preferencias" />

      <div className="card flex items-center gap-3 p-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-base font-bold text-brand-800">
          {initials(profile?.full_name, session?.user.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-stone-900">
            {profile?.full_name || 'Sin nombre'}
          </p>
          <p className="truncate text-xs text-stone-500">{session?.user.email}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-brand-700">
            {profile ? ROLE_LABELS[profile.role] : 'Cargando…'}
          </p>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-stone-900">Zona horaria</h2>
        <p className="mb-3 text-xs text-stone-500">
          Se usa para resolver «mañana» y «el viernes» y para clasificar las tareas por día.
        </p>
        <select
          className="field"
          value={timezone}
          onChange={(event) => changeTimezone(event.target.value)}
        >
          {TIMEZONES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <BellRing className="size-4" aria-hidden />
          Recordatorios de tareas
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-stone-600">
          Recibe un aviso una hora antes de la fecha límite. La app debe permanecer abierta para revisar las tareas.
        </p>
        {notificationMessage ? (
          <p className="mb-3 text-xs text-stone-600" role="status">{notificationMessage}</p>
        ) : null}
        {notificationPermission === 'denied' ? (
          <p className="mb-3 text-xs text-amber-800">Las notificaciones están bloqueadas; habilítalas desde los permisos del navegador.</p>
        ) : null}
        <Button
          variant="secondary"
          block
          disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
          onClick={() => void enableNotifications()}
        >
          {notificationPermission === 'granted'
            ? 'Notificaciones activadas'
            : notificationPermission === 'unsupported'
              ? 'No disponible en este navegador'
              : 'Activar notificaciones'}
        </Button>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Download className="size-4" aria-hidden />
          Instalar la app
        </h2>
        <p className="text-xs leading-relaxed text-stone-600">
          En Chrome o Edge abre el menú del navegador y elige «Añadir a la pantalla de inicio».
          En iPhone, pulsa el botón Compartir y «Añadir a pantalla de inicio». La app abre a pantalla
          completa y muestra las últimas tareas incluso sin conexión.
        </p>
      </div>

      <Banner tone="info" title="Tus datos">
        Las tareas y el historial del chat están aislados por usuario mediante políticas RLS de
        Supabase. La llave de la IA nunca llega al navegador.
      </Banner>

      <Button variant="secondary" block onClick={() => void signOut()}>
        <LogOut className="size-4" aria-hidden />
        Cerrar sesión
      </Button>

      <p className="flex items-center justify-center gap-1 pb-2 text-center text-[11px] text-stone-400">
        <UserRound className="size-3" aria-hidden />
        TaskPilot · PWA con asistente de IA
      </p>
    </div>
  )
}
