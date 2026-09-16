-- Adds the RLS policies needed for the admin "delete/edit" features
-- (classes and modules already had update/delete policies for admin —
-- this file fills in the ones that were missing).
-- Safe to re-run.

-- MODULES: there was previously no delete policy at all, so admins (and
-- teachers deleting their own draft/rejected modules) couldn't remove one.
drop policy if exists "modules_delete_owner_or_admin" on modules;
create policy "modules_delete_owner_or_admin" on modules for delete using (
  teacher_id = auth.uid() or current_role_name() = 'admin'
);

-- PROFILES: admins can edit anyone's display name (e.g. fixing a typo)
-- directly from the client. Role and id are never touched here, and actual
-- account deletion / email changes still go through the service-role
-- "manage-user" edge function since those live on auth.users.
drop policy if exists "profiles_update_admin_any" on profiles;
create policy "profiles_update_admin_any" on profiles for update using (
  current_role_name() = 'admin'
);
