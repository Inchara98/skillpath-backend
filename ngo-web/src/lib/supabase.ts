import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[ngo-web] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — ' +
      'sign-in will fail until .env is filled in (see .env.example).',
  )
}

// createClient() throws synchronously on an empty URL, which would crash
// the whole app before React mounts. Fall back to a harmless placeholder
// so the UI still renders -- sign-in will just fail with a clear error
// until real credentials are set, same "degrade, don't crash" pattern the
// backend servers use when SUPABASE_URL is unset.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)
