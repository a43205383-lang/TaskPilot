import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole, Mail, ReceiptText, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button } from '../components/ui'

export function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (session) return <Navigate to={from} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!email.trim() || password.length < 6) {
      setError('Escribe un correo válido y una contraseña de al menos 6 caracteres.')
      return
    }
    if (mode === 'register' && fullName.trim().length < 2) {
      setError('Escribe tu nombre para completar el registro.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate(from, { replace: true })
      } else {
        const result = await signUp(email, password, fullName)
        if (result.needsConfirmation) {
          setNotice('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
          setMode('login')
          setPassword('')
        } else {
          navigate(from, { replace: true })
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo completar la operación.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-gradient-to-b from-brand-50 via-stone-50 to-stone-100 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-16 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <ReceiptText className="size-8" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TaskPilot</h1>
          <p className="mt-1 max-w-xs text-sm text-stone-600">
            Fotografía el recibo. La IA extrae los datos. Tú solo revisas y guardas.
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'login' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
              onClick={() => {
                setMode('login')
                setError(null)
              }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'register' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
              onClick={() => {
                setMode('register')
                setError(null)
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'register' ? (
              <label className="block">
                <span className="label">Nombre completo</span>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
                  <input
                    className="field pl-9"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    placeholder="María Pérez"
                  />
                </div>
              </label>
            ) : null}

            <label className="block">
              <span className="label">Correo</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
                <input
                  className="field pl-9"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@empresa.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="label">Contraseña</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
                <input
                  className="field pl-9"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </label>

            {error ? <Banner tone="error">{error}</Banner> : null}
            {notice ? <Banner tone="success">{notice}</Banner> : null}

            <Button type="submit" block size="lg" loading={busy}>
              {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-stone-500">
          Los comprobantes son privados: solo tú y el contador pueden verlos.
        </p>
      </div>
    </div>
  )
}
