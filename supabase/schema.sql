-- ==========================================================
-- Learning Hub - Supabase Schema
-- Run this in the Supabase SQL editor (or via `supabase db push`)
-- ==========================================================

-- 1. PROFILES ------------------------------------------------
-- One row per auth.users, storing role + name.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'teacher', 'student')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created.
-- (The edge function passes role/full_name via user metadata.)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2. CLASSES ---------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  teacher_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3. CLASS_STUDENTS (enrollment) --------------------------------
create table if not exists class_students (
  class_id uuid not null references classes (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- 4. MODULES -----------------------------------------------------
create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  description text,
  teacher_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- 5. MODULE_ASSIGNMENTS ------------------------------------------
-- A teacher assigns an approved module to one of their own classes,
-- with a due date. Students see these (not the raw module catalog)
-- as their actual work.
create table if not exists module_assignments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  assigned_by uuid not null references profiles (id) on delete cascade,
  due_date date,
  created_at timestamptz not null default now(),
  unique (module_id, class_id)
);

-- 6. BADGES + STUDENT_BADGES --------------------------------------
create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text default '🏅'
);

create table if not exists student_badges (
  student_id uuid not null references profiles (id) on delete cascade,
  badge_id uuid not null references badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (student_id, badge_id)
);

-- ==========================================================
-- ROW LEVEL SECURITY
-- ==========================================================
alter table profiles enable row level security;
alter table classes enable row level security;
alter table class_students enable row level security;
alter table modules enable row level security;
alter table module_assignments enable row level security;
alter table badges enable row level security;
alter table student_badges enable row level security;

-- Helper: get role of current user
create or replace function current_role_name()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable;

-- Drop legacy policy names from earlier versions of this schema that let
-- teachers create classes / add students directly — safe no-ops if they
-- were never created. Without this, a re-run of this file on a database
-- that still has the old policies would leave them in place *alongside*
-- the new admin-only ones (Postgres OR's permissive policies together),
-- silently re-opening the door this schema is meant to close.
drop policy if exists "classes_insert_teacher_or_admin" on classes;
drop policy if exists "class_students_insert" on class_students;

-- PROFILES: everyone can read all profiles (needed for teacher's "add student"
-- picker and admin views); users cannot edit their own role.
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (true);
drop policy if exists "profiles_update_self_no_role_change" on profiles;
create policy "profiles_update_self_no_role_change" on profiles for update
  using (auth.uid() = id);

-- CLASSES: only admins create/own the creation of classes; teachers can read
-- and update classes assigned to them; students can read classes they belong to.
drop policy if exists "classes_select" on classes;
create policy "classes_select" on classes for select using (
  teacher_id = auth.uid()
  or current_role_name() = 'admin'
  or exists (
    select 1 from class_students cs
    where cs.class_id = classes.id and cs.student_id = auth.uid()
  )
);
drop policy if exists "classes_insert_admin_only" on classes;
create policy "classes_insert_admin_only" on classes for insert with check (
  current_role_name() = 'admin'
);
drop policy if exists "classes_update_owner_or_admin" on classes;
create policy "classes_update_owner_or_admin" on classes for update using (
  teacher_id = auth.uid() or current_role_name() = 'admin'
);
drop policy if exists "classes_delete_admin" on classes;
create policy "classes_delete_admin" on classes for delete using (
  current_role_name() = 'admin'
);

-- CLASS_STUDENTS: only admins add students to a roster; the class's teacher
-- (or admin) can view it; student can see their own enrollment rows.
drop policy if exists "class_students_select" on class_students;
create policy "class_students_select" on class_students for select using (
  student_id = auth.uid()
  or current_role_name() = 'admin'
  or exists (select 1 from classes c where c.id = class_students.class_id and c.teacher_id = auth.uid())
);
drop policy if exists "class_students_insert_admin_only" on class_students;
create policy "class_students_insert_admin_only" on class_students for insert with check (
  current_role_name() = 'admin'
);
drop policy if exists "class_students_delete" on class_students;
create policy "class_students_delete" on class_students for delete using (
  exists (select 1 from classes c where c.id = class_students.class_id and c.teacher_id = auth.uid())
  or current_role_name() = 'admin'
);

-- MODULES: teacher manages their own; admin sees/updates all (for approval);
-- students only see approved modules from teachers of their classes (enforced
-- additionally in application query, RLS allows any approved module read).
drop policy if exists "modules_select" on modules;
create policy "modules_select" on modules for select using (
  teacher_id = auth.uid()
  or current_role_name() = 'admin'
  or status = 'approved'
);
drop policy if exists "modules_insert_teacher" on modules;
create policy "modules_insert_teacher" on modules for insert with check (
  teacher_id = auth.uid() and current_role_name() = 'teacher'
);
drop policy if exists "modules_update_owner_or_admin" on modules;
create policy "modules_update_owner_or_admin" on modules for update using (
  teacher_id = auth.uid() or current_role_name() = 'admin'
);

-- MODULE_ASSIGNMENTS: teacher assigns an approved module (any teacher's) to
-- one of their own classes with a due date; admin sees all; students see
-- assignments for classes they're enrolled in.
drop policy if exists "module_assignments_select" on module_assignments;
create policy "module_assignments_select" on module_assignments for select using (
  current_role_name() = 'admin'
  or exists (select 1 from classes c where c.id = module_assignments.class_id and c.teacher_id = auth.uid())
  or exists (
    select 1 from class_students cs
    where cs.class_id = module_assignments.class_id and cs.student_id = auth.uid()
  )
);
drop policy if exists "module_assignments_insert" on module_assignments;
create policy "module_assignments_insert" on module_assignments for insert with check (
  assigned_by = auth.uid()
  and current_role_name() = 'teacher'
  and exists (select 1 from classes c where c.id = module_assignments.class_id and c.teacher_id = auth.uid())
  and exists (select 1 from modules m where m.id = module_assignments.module_id and m.status = 'approved')
);
drop policy if exists "module_assignments_delete" on module_assignments;
create policy "module_assignments_delete" on module_assignments for delete using (
  assigned_by = auth.uid() or current_role_name() = 'admin'
);

-- BADGES: readable by all authenticated users; only admin/teacher can manage
-- (management UI not built in this first pass, but policy is ready).
drop policy if exists "badges_select_all" on badges;
create policy "badges_select_all" on badges for select using (true);
drop policy if exists "badges_manage_admin" on badges;
create policy "badges_manage_admin" on badges for all using (current_role_name() = 'admin');

-- STUDENT_BADGES: student sees their own; admin/teacher can award.
drop policy if exists "student_badges_select" on student_badges;
create policy "student_badges_select" on student_badges for select using (
  student_id = auth.uid() or current_role_name() in ('admin', 'teacher')
);
drop policy if exists "student_badges_insert" on student_badges;
create policy "student_badges_insert" on student_badges for insert with check (
  current_role_name() in ('admin', 'teacher')
);

-- ==========================================================
-- MODULE CONTENT (self-contained, in-app interactive modules)
-- ==========================================================

-- 7. MODULE_CONTENT ------------------------------------------------
-- Ordered content blocks inside a module. `type` picks the renderer;
-- `data` holds type-specific content (see README / src/lib/blockTypes.js
-- for the shape of each type's data payload).
create table if not exists module_content (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  order_index int not null default 0,
  type text not null check (type in ('lecture', 'activity', 'interactive')),
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 8. STUDENT_PROGRESS ------------------------------------------------
-- One row per student, per content block, per class assignment. Stores
-- the student's response (shape depends on block type), auto-graded
-- score for activities, and whether the block is marked complete —
-- which is what module-completion progress bars are computed from.
create table if not exists student_progress (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references module_content (id) on delete cascade,
  assignment_id uuid not null references module_assignments (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  response jsonb,
  score numeric,
  max_score numeric,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (content_id, assignment_id, student_id)
);

alter table module_content enable row level security;
alter table student_progress enable row level security;

-- MODULE_CONTENT: readable by anyone who can already read the parent module
-- (owner, admin, or any teacher/student once it's approved); only the
-- owning teacher or admin can add/edit/remove/reorder blocks.
drop policy if exists "module_content_select" on module_content;
create policy "module_content_select" on module_content for select using (
  exists (
    select 1 from modules m
    where m.id = module_content.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin' or m.status = 'approved')
  )
);
drop policy if exists "module_content_insert" on module_content;
create policy "module_content_insert" on module_content for insert with check (
  exists (
    select 1 from modules m where m.id = module_content.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);
drop policy if exists "module_content_update" on module_content;
create policy "module_content_update" on module_content for update using (
  exists (
    select 1 from modules m where m.id = module_content.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);
drop policy if exists "module_content_delete" on module_content;
create policy "module_content_delete" on module_content for delete using (
  exists (
    select 1 from modules m where m.id = module_content.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);

-- STUDENT_PROGRESS: student manages their own progress rows, only for
-- assignments belonging to a class they're enrolled in; the class's
-- teacher and admin can read (for future gradebook views).
drop policy if exists "student_progress_select" on student_progress;
create policy "student_progress_select" on student_progress for select using (
  student_id = auth.uid()
  or current_role_name() = 'admin'
  or exists (
    select 1 from module_assignments a
    join classes c on c.id = a.class_id
    where a.id = student_progress.assignment_id and c.teacher_id = auth.uid()
  )
);
drop policy if exists "student_progress_insert" on student_progress;
create policy "student_progress_insert" on student_progress for insert with check (
  student_id = auth.uid()
  and current_role_name() = 'student'
  and exists (
    select 1 from module_assignments a
    join class_students cs on cs.class_id = a.class_id
    where a.id = student_progress.assignment_id and cs.student_id = auth.uid()
  )
);
drop policy if exists "student_progress_update" on student_progress;
create policy "student_progress_update" on student_progress for update using (
  student_id = auth.uid() and current_role_name() = 'student'
);

-- 9. LECTURE_HIGHLIGHTS ------------------------------------------------
-- A student selects text inside a lecture block and highlights it, with
-- an optional note. Stored as plain character offsets into that block's
-- `data->>'body'`. One row per highlight (a student can make several per
-- lecture). Visible to the student who wrote it, the class's teacher, and
-- admins — this is how "annotate the lecture, teacher sees it" works.
create table if not exists lecture_highlights (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references module_content (id) on delete cascade,
  assignment_id uuid not null references module_assignments (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  start_offset int not null,
  end_offset int not null,
  quote text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table lecture_highlights enable row level security;

-- LECTURE_HIGHLIGHTS: student manages their own; the teacher of the
-- assignment's class (and admin) can read, but not edit.
drop policy if exists "lecture_highlights_select" on lecture_highlights;
create policy "lecture_highlights_select" on lecture_highlights for select using (
  student_id = auth.uid()
  or current_role_name() = 'admin'
  or exists (
    select 1 from module_assignments a
    join classes c on c.id = a.class_id
    where a.id = lecture_highlights.assignment_id and c.teacher_id = auth.uid()
  )
);
drop policy if exists "lecture_highlights_insert" on lecture_highlights;
create policy "lecture_highlights_insert" on lecture_highlights for insert with check (
  student_id = auth.uid()
  and current_role_name() = 'student'
  and exists (
    select 1 from module_assignments a
    join class_students cs on cs.class_id = a.class_id
    where a.id = lecture_highlights.assignment_id and cs.student_id = auth.uid()
  )
);
drop policy if exists "lecture_highlights_delete" on lecture_highlights;
create policy "lecture_highlights_delete" on lecture_highlights for delete using (
  student_id = auth.uid() and current_role_name() = 'student'
);

-- ==========================================================
-- STORAGE (images for Interactive > Image Hotspots blocks)
-- ==========================================================
insert into storage.buckets (id, name, public)
values ('module-images', 'module-images', true)
on conflict (id) do nothing;

-- Publicly readable (images are embedded directly in the student player);
-- only teachers/admins can upload, replace, or remove images.
drop policy if exists "module_images_public_read" on storage.objects;
create policy "module_images_public_read" on storage.objects for select using (
  bucket_id = 'module-images'
);
drop policy if exists "module_images_teacher_admin_insert" on storage.objects;
create policy "module_images_teacher_admin_insert" on storage.objects for insert with check (
  bucket_id = 'module-images' and current_role_name() in ('teacher', 'admin')
);
drop policy if exists "module_images_teacher_admin_update" on storage.objects;
create policy "module_images_teacher_admin_update" on storage.objects for update using (
  bucket_id = 'module-images' and current_role_name() in ('teacher', 'admin')
);
drop policy if exists "module_images_teacher_admin_delete" on storage.objects;
create policy "module_images_teacher_admin_delete" on storage.objects for delete using (
  bucket_id = 'module-images' and current_role_name() in ('teacher', 'admin')
);
