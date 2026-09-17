// Supabase Edge Function: create-user
// Deploy with: supabase functions deploy create-user
// This runs server-side with the service_role key, so it can safely create
// auth users. Only callers whose JWT resolves to role='admin' are allowed.
//
// Env vars required (set automatically by Supabase, or via `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// The browser sends a CORS preflight (OPTIONS) before every cross-origin
// POST. It carries no Authorization header, so it must be answered here —
// before any auth check — or the browser never gets to send the real
// request and every call fails with 401 on the OPTIONS request itself.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Identify the calling user and confirm they are an admin.
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can create accounts' }), { status: 403, headers: corsHeaders })
    }

    const { full_name, email, role } = await req.json()
    if (!full_name || !email || !['teacher', 'student'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: corsHeaders })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const tempPassword = crypto.randomUUID().slice(0, 12)

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role },
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })
    }

    // The `handle_new_user` DB trigger (see schema.sql) auto-inserts the
    // profiles row using the metadata above.

    return new Response(
      JSON.stringify({ user_id: created.user?.id, temp_password: tempPassword }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
