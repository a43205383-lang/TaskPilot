import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase'
import { fetchProfile } from './api'
import { queryClient } from '../shared/queryClient'
import type { Profile } from './types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  isSupervisor: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const CACHE_PREFIX = 'tareas:'

function readCachedProfile(userId: string): Profile | null {
  try {
    const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}profile:${userId}`) ?? 'null') as Profile | null
    if (!cached || cached.id !== userId || (cached.role !== 'employee' && cached.role !== 'supervisor')) return null
    return cached
  } catch {
    return null
  }
}

function translateAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (text.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de entrar. Revisa tu bandeja o pide que desactiven la confirmación.'
  }
  if (text.includes('user already registered')) return 'Ese correo ya tiene una cuenta.'
  if (text.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (text.includes('rate limit')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let alive = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const loadProfile = useCallback(async (userId: string) => {
    const cachedProfile = readCachedProfile(userId)
    if (cachedProfile) setProfile(cachedProfile)
    setProfileLoading(true)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setProfile(cachedProfile)
      setProfileLoading(false)
      return
    }
    try {
      // El trigger de perfil puede tardar unos milisegundos tras el registro.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const found = await fetchProfile(userId)
        if (found) {
          setProfile(found)
          try {
            localStorage.setItem(`${CACHE_PREFIX}profile:${userId}`, JSON.stringify(found))
          } catch {
            // El perfil sigue disponible en memoria aunque el almacenamiento esté lleno.
          }
          setProfileLoading(false)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      setProfile(null)
    } catch {
      setProfile(cachedProfile)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    void loadProfile(session.user.id)
  }, [session?.user?.id, loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(translateAuthError(error.message))
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      if (error) throw new Error(translateAuthError(error.message))
      return { needsConfirmation: !data.session }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key)
    }
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session?.user, loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      profileLoading,
      isSupervisor: profile?.role === 'supervisor',
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, profileLoading, signIn, signUp, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.')
  return context
}
