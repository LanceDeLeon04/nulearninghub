import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars are missing. Copy .env.example to .env and fill in your project values.')
}

// TEMP DEBUG — remove once login works. Confirms what the running app
// actually has at runtime, ruling out .env / caching / build issues.
console.log('[DEBUG] VITE_SUPABASE_URL =', supabaseUrl)
console.log('[DEBUG] VITE_SUPABASE_ANON_KEY length =', supabaseAnonKey ? supabaseAnonKey.length : 'MISSING/undefined')
console.log('[DEBUG] VITE_SUPABASE_ANON_KEY starts with =', supabaseAnonKey ? supabaseAnonKey.slice(0, 15) : 'MISSING/undefined')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
