-- ==========================================================
-- Fix: "Database error creating new user"
-- Run this in the Supabase SQL editor.
--
-- Cause: handle_new_user() was SECURITY DEFINER but had no
-- `set search_path`, and referenced `profiles` unqualified.
-- The insert into auth.users runs as supabase_auth_admin, whose
-- search_path excludes public, so the trigger raised
-- `relation "profiles" does not exist` and rolled back the
-- whole user creation. GoTrue reports that as the generic
-- "Database error creating new user".
-- ==========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    -- Metadata can be present but blank; nullif keeps the NOT NULL
    -- constraint from firing on an empty-string name.
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email, 'Unnamed user'),
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data->>'role' in ('admin', 'teacher', 'student')
        then new.raw_user_meta_data->>'role'
      else 'student'
    end
  )
  -- A profile row may already exist if a user was created, deleted from
  -- profiles only, and re-created. Never let that abort the auth insert.
  on conflict (id) do nothing;

  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Belt and braces: let the auth admin role reach the schema at all.
grant usage on schema public to supabase_auth_admin;
grant insert, select on public.profiles to supabase_auth_admin;
