// Supabase Edge Function: manage-user
// Deploy with: supabase functions deploy manage-user
// Runs server-side with the service_role key so it can edit or delete
// auth.users records (email, password, or the account itself), which the
// client can never do directly. Only callers whose JWT resolves to
// role='admin' are allowed, matching create-user.
//
// Body shape:
//   { action: 'update', user_id, full_name?, email?, password? }
//   { action: 'delete', user_id }
//
// Env vars required (set automatically by Supabase, or via `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Identify the calling user and confirm they are an admin.
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can manage accounts' }), { status: 403 })
    }

    const body = await req.json()
    const { action, user_id } = body
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), { status: 400 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // An admin should never be able to edit/delete another admin (or
    // themselves) through this endpoint — that keeps the blast radius of
    // this key limited to the teacher/student accounts it was built for.
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .single()

    if (!targetProfile || !['teacher', 'student'].includes(targetProfile.role)) {
      return new Response(JSON.stringify({ error: 'Target account not found or not editable here' }), { status: 400 })
    }

    if (action === 'delete') {
      // Deleting the auth user cascades to profiles and everything that
      // references it (classes, class_students, modules, messages, etc.
      // — see schema.sql "on delete cascade").
      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400 })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (action === 'update') {
      const { full_name, email, password } = body
      const authUpdate: Record<string, unknown> = {}
      if (email) authUpdate.email = email
      if (password) authUpdate.password = password
      if (full_name) authUpdate.user_metadata = { full_name }

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await adminClient.auth.admin.updateUserById(user_id, authUpdate)
        if (authError) {
          return new Response(JSON.stringify({ error: authError.message }), { status: 400 })
        }
      }

      // profiles.full_name / profiles.email are separate columns from
      // auth.users — keep them in sync explicitly rather than relying on
      // the create-time trigger, which only fires on insert.
      const profileUpdate: Record<string, unknown> = {}
      if (full_name) profileUpdate.full_name = full_name
      if (email) profileUpdate.email = email
      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await adminClient.from('profiles').update(profileUpdate).eq('id', user_id)
        if (profileError) {
          return new Response(JSON.stringify({ error: profileError.message }), { status: 400 })
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
