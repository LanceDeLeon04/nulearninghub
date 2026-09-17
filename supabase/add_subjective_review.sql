-- ==========================================================
-- Learning Hub - Teacher review of subjective answers
--
-- Some questions have no single correct string: write your own sentence,
-- rewrite this message, create a dialogue. Those are flagged in the block's
-- JSON as `"subjective": true`. The app's auto-grader skips them entirely —
-- they contribute nothing to score/max_score — and the activity is saved
-- "for review": no points yet, no badges, until the class's teacher reads
-- the answer and scores it by hand.
--
-- Safe to re-run. Run AFTER schema.sql and schema_chat_and_pairs.sql.
-- ==========================================================

-- 1. REVIEW COLUMNS ON STUDENT_PROGRESS --------------------------
alter table student_progress add column if not exists pending_review boolean not null default false;
-- Points available across the subjective questions in this activity — the
-- denominator the teacher scores against.
alter table student_progress add column if not exists subjective_max numeric not null default 0;
-- What the teacher awarded for the subjective part, and their comment.
alter table student_progress add column if not exists teacher_score numeric;
alter table student_progress add column if not exists teacher_feedback text;
alter table student_progress add column if not exists reviewed_at timestamptz;
alter table student_progress add column if not exists reviewed_by uuid references profiles (id) on delete set null;

create index if not exists student_progress_pending_review_idx
  on student_progress (assignment_id) where pending_review;

-- 2. LET THE CLASS'S TEACHER SCORE -------------------------------
-- Until now only the student could update their own progress row. The
-- teacher who owns the assignment's class (and admins) can now update it
-- too — that's the whole grading path. Postgres OR's permissive policies
-- together, so the student's own policy is untouched.
drop policy if exists "student_progress_update_teacher" on student_progress;
create policy "student_progress_update_teacher" on student_progress for update using (
  current_role_name() = 'admin'
  or exists (
    select 1 from module_assignments a
    join classes c on c.id = a.class_id
    where a.id = student_progress.assignment_id and c.teacher_id = auth.uid()
  )
);

-- 3. SCORING WITH A HELD-BACK SUBJECTIVE PART --------------------
-- Replaces the version in schema.sql. Two changes:
--   * while pending_review is true, the row is worth 0 points and has no
--     accuracy — "for review, no score yet" is the literal truth, not a
--     provisional number that changes under the student later;
--   * once reviewed, the teacher's points are folded in, so accuracy is
--     (auto + teacher) / (auto max + subjective max).
-- Everything else — par time, speed bonus, the flat 10 for lecture and
-- interactive blocks — is unchanged.
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
  v_total_max numeric;
  v_total_score numeric;
begin
  if new.completed is not true then
    new.accuracy_pct := null;
    new.expected_seconds := null;
    new.speed_bonus := 0;
    new.points := 0;
    return new;
  end if;

  -- Awaiting a teacher's read: deliberately worth nothing yet.
  if new.pending_review is true then
    new.accuracy_pct := null;
    new.expected_seconds := null;
    new.speed_bonus := 0;
    new.points := 0;
    return new;
  end if;

  select type, data into v_type, v_data from module_content where id = new.content_id;

  if v_type = 'activity' then
    v_total_max := coalesce(new.max_score, 0) + coalesce(new.subjective_max, 0);
    v_total_score := coalesce(new.score, 0) + coalesce(new.teacher_score, 0);

    if v_total_max > 0 then
      new.accuracy_pct := round((v_total_score / v_total_max)::numeric, 4);
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

-- 4. NO BADGES WHILE A ROW IS UNREVIEWED -------------------------
-- Otherwise "Perfect Score" could fire off the auto-graded half of an
-- activity whose written half hasn't been read yet. Re-running this
-- function body is identical to schema.sql's apart from the early return.
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
  if new.completed is not true or new.pending_review is true then
    return new;
  end if;

  select count(*) into v_total_completed from student_progress where student_id = v_student and completed;
  if v_total_completed = 1 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'first_block'
    on conflict do nothing;
  end if;

  -- Perfect Score now means everything, including anything a teacher scored.
  if (coalesce(new.max_score, 0) + coalesce(new.subjective_max, 0)) > 0
     and (coalesce(new.score, 0) + coalesce(new.teacher_score, 0))
         = (coalesce(new.max_score, 0) + coalesce(new.subjective_max, 0)) then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'perfect_score'
    on conflict do nothing;
  end if;

  if new.accuracy_pct is not null and new.accuracy_pct >= 0.8 and new.speed_bonus >= 15 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'speed_demon'
    on conflict do nothing;
  end if;

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

  select coalesce(sum(points), 0) into v_total_points from student_progress where student_id = v_student;
  if v_total_points >= 500 then
    insert into student_badges (student_id, badge_id)
    select v_student, id from badges where code = 'points_500'
    on conflict do nothing;
  end if;

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

-- 5. PAIR SUBMISSIONS CARRY THE SAME FLAGS -----------------------
-- Same function as in schema_chat_and_pairs.sql plus the two review
-- columns, so a pair activity with a written part is held for review for
-- both partners rather than only the one who pressed Submit. The old
-- 6-argument signature is dropped so PostgREST doesn't see two overloads
-- and refuse to pick one.
drop function if exists submit_pair_activity_progress(uuid, uuid, jsonb, numeric, numeric, int);

create or replace function submit_pair_activity_progress(
  p_content_id uuid,
  p_assignment_id uuid,
  p_response jsonb,
  p_score numeric,
  p_max_score numeric,
  p_time_spent_seconds int,
  p_subjective_max numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_pending boolean := coalesce(p_subjective_max, 0) > 0;
begin
  if current_role_name() <> 'student' then
    raise exception 'Only students can submit activities';
  end if;

  select case when requester_id = auth.uid() then partner_id else requester_id end
    into v_partner
  from pair_requests
  where content_id = p_content_id
    and assignment_id = p_assignment_id
    and status = 'accepted'
    and (requester_id = auth.uid() or partner_id = auth.uid())
  limit 1;

  if v_partner is null then
    raise exception 'No accepted pair found for this activity';
  end if;

  if not exists (
    select 1 from module_assignments a
    join class_students cs on cs.class_id = a.class_id
    where a.id = p_assignment_id and cs.student_id = auth.uid()
  ) then
    raise exception 'Not enrolled in this assignment';
  end if;

  insert into student_progress
    (content_id, assignment_id, student_id, response, score, max_score, subjective_max,
     pending_review, teacher_score, completed, completed_at, time_spent_seconds)
  select
    p_content_id, p_assignment_id, s, p_response, p_score, p_max_score, coalesce(p_subjective_max, 0),
    v_pending, null, true, now(), p_time_spent_seconds
  from unnest(array[auth.uid(), v_partner]) as s
  on conflict (content_id, assignment_id, student_id) do update set
    response = excluded.response,
    score = excluded.score,
    max_score = excluded.max_score,
    subjective_max = excluded.subjective_max,
    pending_review = excluded.pending_review,
    teacher_score = null,
    teacher_feedback = null,
    reviewed_at = null,
    reviewed_by = null,
    completed = true,
    completed_at = now(),
    time_spent_seconds = excluded.time_spent_seconds;
end;
$$;

grant execute on function submit_pair_activity_progress(uuid, uuid, jsonb, numeric, numeric, int, numeric) to authenticated;

-- 6. WHAT'S WAITING TO BE REVIEWED -------------------------------
-- Everything the calling teacher owes a score on, newest first. Runs as
-- the caller, so the student_progress select policy already limits it to
-- that teacher's own classes; admins see all.
create or replace function get_pending_reviews()
returns table (
  progress_id uuid,
  student_id uuid,
  student_name text,
  class_name text,
  module_title text,
  block_title text,
  block_data jsonb,
  response jsonb,
  subjective_max numeric,
  auto_score numeric,
  auto_max numeric,
  submitted_at timestamptz
)
language sql
stable
as $$
  select
    sp.id,
    p.id,
    p.full_name,
    c.name,
    m.title,
    mc.title,
    mc.data,
    sp.response,
    sp.subjective_max,
    sp.score,
    sp.max_score,
    sp.completed_at
  from student_progress sp
  join profiles p on p.id = sp.student_id
  join module_assignments a on a.id = sp.assignment_id
  join classes c on c.id = a.class_id
  join module_content mc on mc.id = sp.content_id
  join modules m on m.id = mc.module_id
  where sp.pending_review
  order by sp.completed_at desc nulls last;
$$;

grant execute on function get_pending_reviews() to authenticated;

-- 7. BACKFILL subjective_max FOR ALREADY-SUBMITTED WORK ----------
-- Rows submitted before this feature existed were auto-graded against the
-- written questions too. Recompute their subjective_max from the block's
-- JSON so the numbers line up; they are NOT flipped back to pending_review,
-- since re-opening work a student already saw scored would be worse than
-- leaving it as it was. New submissions get the new behaviour.
update student_progress sp
set subjective_max = sub.pts
from (
  select mc.id as content_id,
         coalesce(sum((q ->> 'points')::numeric), 0) as pts
  from module_content mc
  cross join lateral jsonb_array_elements(coalesce(mc.data -> 'questions', '[]'::jsonb)) q
  where (q ->> 'subjective')::boolean is true
  group by mc.id
) sub
where sp.content_id = sub.content_id
  and sp.subjective_max = 0;
