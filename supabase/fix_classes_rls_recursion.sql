-- Fix: "infinite recursion detected in policy for relation classes"
--
-- classes_select checked class_students, and class_students_select checked
-- classes, inline, in each other's USING clause — a policy-evaluation cycle.
-- Run this once against your existing database to replace those policies
-- with versions that go through SECURITY DEFINER helper functions instead,
-- which bypass RLS on the table they read and so don't re-trigger the
-- other policy.
--
-- Safe to run multiple times.

create or replace function is_class_teacher(cid uuid)
returns boolean as $$
  select exists (select 1 from classes where id = cid and teacher_id = auth.uid());
$$ language sql stable security definer set search_path = public;

create or replace function is_class_student(cid uuid)
returns boolean as $$
  select exists (select 1 from class_students where class_id = cid and student_id = auth.uid());
$$ language sql stable security definer set search_path = public;

drop policy if exists "classes_select" on classes;
create policy "classes_select" on classes for select using (
  teacher_id = auth.uid()
  or current_role_name() = 'admin'
  or is_class_student(classes.id)
);

drop policy if exists "class_students_select" on class_students;
create policy "class_students_select" on class_students for select using (
  student_id = auth.uid()
  or current_role_name() = 'admin'
  or is_class_teacher(class_students.class_id)
);

drop policy if exists "class_students_delete" on class_students;
create policy "class_students_delete" on class_students for delete using (
  is_class_teacher(class_students.class_id)
  or current_role_name() = 'admin'
);

drop policy if exists "module_assignments_select" on module_assignments;
create policy "module_assignments_select" on module_assignments for select using (
  current_role_name() = 'admin'
  or is_class_teacher(module_assignments.class_id)
  or is_class_student(module_assignments.class_id)
);

drop policy if exists "module_assignments_insert" on module_assignments;
create policy "module_assignments_insert" on module_assignments for insert with check (
  assigned_by = auth.uid()
  and current_role_name() = 'teacher'
  and is_class_teacher(module_assignments.class_id)
  and exists (select 1 from modules m where m.id = module_assignments.module_id and m.status = 'approved')
);

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
    or is_class_teacher(p_class_id)
    or is_class_student(p_class_id)
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
