import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

const REQUIRED_ORG_TYPE = 'ngo'

interface AuthContextValue {
  session: Session | null
  user: User | null
  orgType: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchOrgType(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('org_type').eq('id', userId).single()
  return data?.org_type ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [orgType, setOrgType] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Keeps orgType populated across page reloads (a restored session skips
  // signIn()'s own check below), not just right after a fresh sign-in.
  useEffect(() => {
    if (!session?.user) {
      setOrgType(null)
      return
    }
    fetchOrgType(session.user.id).then(setOrgType)
  }, [session?.user])

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    // profiles.org_type is only ever written via the service_role admin
    // script (see scripts/create-partner-user.mjs) and is RLS-readable
    // only by the row's own user, so this can't be spoofed client-side.
    const userOrgType = await fetchOrgType(data.user.id)
    if (userOrgType !== REQUIRED_ORG_TYPE) {
      await supabase.auth.signOut()
      return { error: "This account isn't authorized for the NGO Partner Platform." }
    }

    setOrgType(userOrgType)
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, orgType, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
