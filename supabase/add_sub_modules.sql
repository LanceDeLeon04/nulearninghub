-- ==========================================================
-- Learning Hub - Sub-modules (sub-topics inside a module)
--
-- A module is currently a flat list of content blocks. In the real
-- course material each module is actually made of sub-topics
-- ("Section 1.1: Lexical Competence", "Section 1.2: Morphological
-- Competence", the Self-Check, the closing reflection...). This file
-- adds a first-class table for those sub-topics, hangs every content
-- block off one of them, and backfills the existing seeded modules by
-- reading the section headings already present in the block titles.
--
-- Safe to re-run: every statement is idempotent, and the backfill only
-- touches blocks that don't have a sub-module yet.
--
-- Run AFTER schema.sql and the seed_content_*.sql files.
-- ==========================================================

-- 1. SUB_MODULES ------------------------------------------------
-- An ordered sub-topic inside a module. Blocks belong to exactly one
-- sub-module (or to none, which the player treats as "loose" content
-- shown after every named sub-topic).
create table if not exists sub_modules (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  title text not null,
  description text,
  -- Position of this sub-topic inside its module. Blocks keep their own
  -- module-wide order_index; sub_modules.order_index is what decides the
  -- order the sub-topics themselves are listed and unlocked in.
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sub_modules_module_idx on sub_modules (module_id, order_index);

-- 2. LINK CONTENT BLOCKS TO A SUB-MODULE -------------------------
-- Nullable on purpose: a module that has never been organised into
-- sub-topics still works exactly as before, and deleting a sub-module
-- leaves its blocks in place (they just fall back to "Other content")
-- rather than destroying the teacher's work.
alter table module_content add column if not exists sub_module_id uuid references sub_modules (id) on delete set null;
create index if not exists module_content_sub_module_idx on module_content (sub_module_id);

-- 3. ROW LEVEL SECURITY ------------------------------------------
-- Mirrors module_content exactly: readable by anyone who can read the
-- parent module, writable only by the owning teacher or an admin.
alter table sub_modules enable row level security;

drop policy if exists "sub_modules_select" on sub_modules;
create policy "sub_modules_select" on sub_modules for select using (
  exists (
    select 1 from modules m
    where m.id = sub_modules.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin' or m.status = 'approved')
  )
);
drop policy if exists "sub_modules_insert" on sub_modules;
create policy "sub_modules_insert" on sub_modules for insert with check (
  exists (
    select 1 from modules m where m.id = sub_modules.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);
drop policy if exists "sub_modules_update" on sub_modules;
create policy "sub_modules_update" on sub_modules for update using (
  exists (
    select 1 from modules m where m.id = sub_modules.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);
drop policy if exists "sub_modules_delete" on sub_modules;
create policy "sub_modules_delete" on sub_modules for delete using (
  exists (
    select 1 from modules m where m.id = sub_modules.module_id
    and (m.teacher_id = auth.uid() or current_role_name() = 'admin')
  )
);

-- 4. BACKFILL ----------------------------------------------------
-- Derives sub-topics from the block titles the course content already
-- uses. A new sub-topic starts at:
--   * the first block of the module;
--   * any block titled "Section N.N: ..." (the real sub-topic headings);
--   * the "Self-Check & Reflection" block (its own wrap-up sub-topic);
--   * the "Reflection, Optional Task & Closing" block.
-- Modules that contain no "Section" heading at all (Preliminaries, whose
-- blocks are About the Author / Table of Contents / Foreword) fall back
-- to starting a new sub-topic at every lecture block, so each front-matter
-- page becomes its own short sub-topic instead of all three being lumped
-- together.
--
-- Only blocks with sub_module_id IS NULL are touched, so running this
-- again after a teacher has organised a module by hand is a no-op.

create or replace function derive_sub_module_title(p_block_title text)
returns text
language sql
immutable
as $$
  select case
    -- "Module 1: Linguistic Competence – Overview" -> "Overview & Learning Outcomes"
    when p_block_title ilike '%overview%' then 'Overview & Learning Outcomes'
    when p_block_title ilike 'self-check%' then 'Self-Check & Reflection'
    when p_block_title ilike 'reflection,%' then 'Reflection & Closing'
    -- "Section 1.1: Lexical Competence" -> "Lexical Competence"
    when p_block_title ~ '^Section [0-9]+\.[0-9]+:\s*' then regexp_replace(p_block_title, '^Section [0-9]+\.[0-9]+:\s*', '')
    else p_block_title
  end;
$$;

create or replace function backfill_sub_modules()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module record;
  v_block record;
  v_has_sections boolean;
  v_current_sub uuid;
  v_next_order int;
  v_starts_new boolean;
begin
  for v_module in select id from modules loop
    -- Continue numbering after any sub-modules that already exist.
    select coalesce(max(order_index) + 1, 0) into v_next_order
      from sub_modules where module_id = v_module.id;

    select exists (
      select 1 from module_content
      where module_id = v_module.id and title ~ '^Section [0-9]+\.[0-9]+'
    ) into v_has_sections;

    v_current_sub := null;

    for v_block in
      select id, type, title, order_index
      from module_content
      where module_id = v_module.id
      order by order_index
    loop
      -- Already organised by hand? Follow along rather than overriding:
      -- later unassigned blocks attach to the last sub-module we saw.
      if exists (select 1 from module_content where id = v_block.id and sub_module_id is not null) then
        select sub_module_id into v_current_sub from module_content where id = v_block.id;
        continue;
      end if;

      if v_has_sections then
        v_starts_new :=
          v_current_sub is null
          or v_block.title ~ '^Section [0-9]+\.[0-9]+'
          or v_block.title ilike 'self-check%'
          or v_block.title ilike 'reflection,%';
      else
        v_starts_new := v_current_sub is null or v_block.type = 'lecture';
      end if;

      if v_starts_new then
        insert into sub_modules (module_id, title, order_index)
        values (v_module.id, derive_sub_module_title(v_block.title), v_next_order)
        returning id into v_current_sub;
        v_next_order := v_next_order + 1;
      end if;

      update module_content set sub_module_id = v_current_sub where id = v_block.id;
    end loop;
  end loop;
end;
$$;

select backfill_sub_modules();

-- 5. SUB-MODULE COMPLETION RPC -----------------------------------
-- How many blocks each sub-module of a module has, and how many of them
-- this student has completed for a given assignment. The player uses
-- this for per-sub-topic progress rings and for deciding which sub-topic
-- to unlock next; MyModules uses it for the "3 of 6 sub-topics" line.
-- Runs as the caller (no security definer) so ordinary RLS on
-- student_progress still applies — a student only ever sees their own.
create or replace function get_sub_module_progress(p_assignment_id uuid)
returns table (
  sub_module_id uuid,
  title text,
  order_index int,
  total_blocks int,
  completed_blocks int
)
language sql
stable
as $$
  select
    sm.id,
    sm.title,
    sm.order_index,
    count(mc.id)::int as total_blocks,
    count(sp.id) filter (where sp.completed)::int as completed_blocks
  from module_assignments a
  join sub_modules sm on sm.module_id = a.module_id
  left join module_content mc on mc.sub_module_id = sm.id
  left join student_progress sp
    on sp.content_id = mc.id
   and sp.assignment_id = a.id
   and sp.student_id = auth.uid()
  where a.id = p_assignment_id
  group by sm.id, sm.title, sm.order_index
  order by sm.order_index;
$$;

grant execute on function get_sub_module_progress(uuid) to authenticated;
