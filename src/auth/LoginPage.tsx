import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CheckSquare2, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { Banner, Button, FieldError } from '../shared/ui'
import { errorMessage } from '../shared/utils'

type Mode = 'signin' | 'signup'

export function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/tasks'

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-stone-500">
        Cargando…
      </div>
    )
  }

  if (session) return <Navigate to={from} replace />

  function switchMode(next: Mode) {
    setMode(next)
    setErrors({})
    setNotice(null)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (mode === 'signup' && fullName.trim().length < 2) {
      next.fullName = 'Escribe tu nombre.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Escribe un correo válido.'
    }
    if (password.length < 6) next.password = 'Mínimo 6 caracteres.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    if (!validate()) return
    setBusy(true)
    try {
      if (mode === 'signup') {
        const result = await signUp(email, password, fullName)
        if (result.needsConfirmation) {
          setNotice('Cuenta creada. Confirma tu correo para poder entrar.')
          switchMode('signin')
          return
        }
      } else {
        await signIn(email, password)
      }
      navigate(from, { replace: true })
    } catch (error) {
      setErrors({ form: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
            <CheckSquare2 className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">TaskPilot</h1>
          <p className="mt-1 text-sm text-stone-600">
            Escribe lo que tienes pendiente y la IA lo organiza por ti.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'signin' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'signup' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
            >
              Registrarme
            </button>
          </div>

          {mode === 'signup' ? (
            <div>
              <label className="label" htmlFor="fullName">
                Nombre
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
                <input
                  id="fullName"
                  className={`field pl-9 ${errors.fullName ? 'field-low' : ''}`}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ana Pérez"
                  autoComplete="name"
                />
              </div>
              <FieldError message={errors.fullName} />
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="email">
              Correo
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
              <input
                id="email"
                type="email"
                className={`field pl-9 ${errors.email ? 'field-low' : ''}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
              />
            </div>
            <FieldError message={errors.email} />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
              <input
                id="password"
                type="password"
                className={`field pl-9 ${errors.password ? 'field-low' : ''}`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            <FieldError message={errors.password} />
          </div>

          {errors.form ? <Banner tone="error">{errors.form}</Banner> : null}
          {notice ? <Banner tone="success">{notice}</Banner> : null}

          <Button type="submit" block loading={busy}>
            {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </form>
      </div>
    </div>
  )
}
