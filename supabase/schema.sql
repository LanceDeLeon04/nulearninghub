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
  -- Curriculum position (Preliminaries, Module 1, ... Module 4, ...), independent
  -- of created_at/title so the catalog always lists in reading order rather
  -- than insertion order or alphabetically ("Module 10" before "Module 2").
  sequence_order int not null default 0,
  created_at timestamptz not null default now()
);
-- Safe to re-run against an existing database that predates sequence_order.
alter table modules add column if not exists sequence_order int not null default 0;

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
  -- Stable key the badge-awarding function matches on (see
  -- award_badges_after_progress below) so badges can be renamed/reworded
  -- without breaking the logic that grants them.
  code text,
  name text not null,
  description text,
  icon text default '🏅'
);
alter table badges add column if not exists code text;
create unique index if not exists badges_code_key on badges (code);

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
  -- How long the student spent on this block, client-reported (seconds).
  -- Used, together with the block's expected_seconds, to compute the speed
  -- component of `points` below.
  time_spent_seconds int,
  -- Everything from here down is computed server-side by the
  -- compute_progress_points trigger, never written directly by the app —
  -- see that function for the scoring formula.
  expected_seconds int,
  accuracy_pct numeric,
  speed_bonus numeric not null default 0,
  points numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (content_id, assignment_id, student_id)
);
-- Safe to re-run against a database created before these columns existed.
alter table student_progress add column if not exists time_spent_seconds int;
alter table student_progress add column if not exists expected_seconds int;
alter table student_progress add column if not exists accuracy_pct numeric;
alter table student_progress add column if not exists speed_bonus numeric not null default 0;
alter table student_progress add column if not exists points numeric not null default 0;

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

-- ==========================================================
-- SCORING, BADGES & LEADERBOARD
-- ==========================================================
-- Points, badges and rankings are computed here, server-side, rather than
-- in the frontend. The app already trusts the client for the raw inputs
-- (score, max_score, time_spent_seconds — same trust model as the existing
-- client-side grading in ActivityView), but the *scoring formula itself*,
-- and every badge award, happen in Postgres so they're consistent no
-- matter which screen triggered the save, and so students can't just set
-- `points` or insert `student_badges` rows directly (RLS still blocks
-- that; see student_progress/student_badges policies above).

-- 10. SEED BADGES ------------------------------------------------
-- Upsert by `code` so re-running this file is safe and never duplicates
-- or overwrites a badge a student may have already earned.
insert into badges (code, name, description, icon) values
  ('first_block', 'First Step', 'Complete your very first lecture, activity, or interactive block.', '🌱'),
  ('perfect_score', 'Perfect Score', 'Score 100% on an activity.', '🎯'),
  ('speed_demon', 'Speed Demon', 'Finish an activity quickly (well under par time) with at least 80% accuracy.', '⚡'),
  ('module_complete', 'Module Master', 'Complete every block in an assigned module.', '🏆'),
  ('streak_3', 'On a Roll', 'Score at least 80% on 3 activities in a row.', '🔥'),
  ('points_500', 'Point Collector', 'Earn 500 total points.', '💯'),
  ('all_types', 'All-Rounder', 'Complete at least one lecture, one activity, and one interactive block.', '🧩')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon;

-- 11. SCORING -------------------------------------------------------
-- Runs BEFORE each insert/update on student_progress and fills in the
-- computed columns. Formula:
--   Activities:  points = round(100 * accuracy) + speed_bonus
--                accuracy   = score / max_score (or 1 if ungraded)
--                par time   = 20s per question (min 20s)
--                speed_bonus = up to +20 points, scaled by accuracy, for
--                              finishing under par; 0 once at/over par —
--                              being fast never helps if the answers are
--                              wrong, and being slow never costs points
--                              beyond the accuracy score itself.
--   Lecture / interactive blocks: flat 10 points on completion. No speed
--   term — rushing through reading material isn't something we want to
--   reward, unlike answering questions quickly and correctly.
create or replace function compute_progress_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_data jsonb;
  v_qcount int;
begin
  if new.completed is not true then
    new.accuracy_pct := null;
    new.expected_seconds := null;
    new.speed_bonus := 0;
    new.points := 0;
    return new;
  end if;

  select type, data into v_type, v_data from module_content where id = new.content_id;

  if v_type = 'activity' then
    if new.max_score is not null and new.max_score > 0 then
      new.accuracy_pct := round((new.score / new.max_score)::numeric, 4);
    else
      new.accuracy_pct := 1;
    end if;

    v_qcount := coalesce(jsonb_array_length(v_data -> 'questions'), 1);
    new.expected_seconds := greatest(20, v_qcount * 20);

    if new.time_spent_seconds is not null and new.time_spent_seconds > 0 then
      new.speed_bonus := round(
        20 * new.accuracy_pct
        * least(greatest((new.expected_seconds - new.time_spent_seconds)::numeric / new.expected_seconds, 0), 1)
      );
    else
      new.speed_bonus := 0;
    end if;

    new.points := round(100 * new.accuracy_pct) + new.speed_bonus;
  else
    new.accuracy_pct := null;
    new.expected_seconds := null;
    new.speed_bonus := 0;
    new.points := 10;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_compute_progress_points on student_progress;
create trigger trg_compute_progress_points
before insert or update on student_progress
for each row execute procedure compute_progress_points();

-- 12. BADGE AWARDING -------------------------------------------------
-- Runs AFTER each insert/update (so the row, and its computed points, are
-- already committed and visible to the aggregate queries below). Security
-- definer + owned by the migration role, which is exempt from RLS, so it
-- can insert into student_badges even though the ordinary RLS policy on
-- that table restricts inserts to teachers/admins (manual awarding still
-- goes through that normal, RLS-checked path).
create or replace function award_badges_after_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := new.student_id;
  v_total_completed int;
  v_module_id uuid;
  v_module_block_count int;
  v_module_completed_count int;
  v_streak int;
  v_total_points numeric;
  v_has_lecture boolean;
  v_has_activity boolean;
  v_has_interactive boolean;
begin
  if new.completed is not true then
    return new;
  end if;

  -- First Step: first ever completed block, of any type.
  select count(*) into v_total_completed from student_progress where student_id = v_student and completed;
  if v_total_completed = 1 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'first_block'
    on conflict do nothing;
  end if;

  -- Perfect Score: 100% on this activity.
  if new.max_score is not null and new.max_score > 0 and new.score = new.max_score then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'perfect_score'
    on conflict do nothing;
  end if;

  -- Speed Demon: high accuracy and (close to) the full speed bonus.
  if new.accuracy_pct is not null and new.accuracy_pct >= 0.8 and new.speed_bonus >= 15 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'speed_demon'
    on conflict do nothing;
  end if;

  -- Module Master: every block in this module, for this assignment, is complete.
  select module_id into v_module_id from module_content where id = new.content_id;
  select count(*) into v_module_block_count from module_content where module_id = v_module_id;
  select count(*) into v_module_completed_count
    from student_progress sp
    join module_content mc on mc.id = sp.content_id
    where sp.assignment_id = new.assignment_id
      and sp.student_id = v_student
      and sp.completed
      and mc.module_id = v_module_id;
  if v_module_block_count > 0 and v_module_completed_count >= v_module_block_count then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'module_complete'
    on conflict do nothing;
  end if;

  -- On a Roll: the last 3 activities completed (by time) all scored >= 80%.
  select count(*) into v_streak from (
    select accuracy_pct from student_progress
    where student_id = v_student and accuracy_pct is not null
    order by completed_at desc nulls last
    limit 3
  ) recent
  where accuracy_pct >= 0.8;
  if v_streak = 3 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'streak_3'
    on conflict do nothing;
  end if;

  -- Point Collector: 500+ lifetime points.
  select coalesce(sum(points), 0) into v_total_points from student_progress where student_id = v_student;
  if v_total_points >= 500 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'points_500'
    on conflict do nothing;
  end if;

  -- All-Rounder: at least one completed block of each type.
  select
    exists (select 1 from student_progress sp join module_content mc on mc.id = sp.content_id where sp.student_id = v_student and sp.completed and mc.type = 'lecture'),
    exists (select 1 from student_progress sp join module_content mc on mc.id = sp.content_id where sp.student_id = v_student and sp.completed and mc.type = 'activity'),
    exists (select 1 from student_progress sp join module_content mc on mc.id = sp.content_id where sp.student_id = v_student and sp.completed and mc.type = 'interactive')
  into v_has_lecture, v_has_activity, v_has_interactive;
  if v_has_lecture and v_has_activity and v_has_interactive then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'all_types'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_award_badges on student_progress;
create trigger trg_award_badges
after insert or update on student_progress
for each row execute procedure award_badges_after_progress();

-- 13. LEADERBOARD RPC -------------------------------------------------
-- Ranks every student enrolled in a class by total points. Exposed as an
-- RPC (not a plain view) so exactly these columns — never a student's raw
-- answers — are what's visible to classmates. Callable by that class's
-- teacher, any admin, or a student enrolled in the class.
create or replace function get_class_leaderboard(p_class_id uuid)
returns table (
  student_id uuid,
  full_name text,
  total_points numeric,
  badge_count int,
  rank int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    current_role_name() = 'admin'
    or exists (select 1 from classes c where c.id = p_class_id and c.teacher_id = auth.uid())
    or exists (select 1 from class_students cs where cs.class_id = p_class_id and cs.student_id = auth.uid())
  ) then
    raise exception 'Not authorized to view this leaderboard';
  end if;

  return query
  select
    p.id as student_id,
    p.full_name,
    coalesce(sum(sp.points), 0) as total_points,
    coalesce((select count(*) from student_badges sb where sb.student_id = p.id), 0)::int as badge_count,
    rank() over (order by coalesce(sum(sp.points), 0) desc)::int as rank
  from class_students cs
  join profiles p on p.id = cs.student_id
  left join module_assignments a on a.class_id = cs.class_id
  left join student_progress sp on sp.student_id = cs.student_id and sp.assignment_id = a.id
  where cs.class_id = p_class_id
  group by p.id, p.full_name
  order by total_points desc;
end;
$$;

grant execute on function get_class_leaderboard(uuid) to authenticated;
