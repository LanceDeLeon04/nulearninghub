-- ==========================================================
-- Learning Hub — In-App Chat + Pair Activities
-- Run this AFTER supabase/schema.sql (in the Supabase SQL editor, or
-- `supabase db push`). Safe to re-run.
-- ==========================================================

-- ==========================================================
-- PART A — IN-APP CHAT (all users: admin, teacher, student)
-- ==========================================================

-- A1. CONVERSATIONS ------------------------------------------------
-- A conversation is just a set of participants + messages. Today every
-- conversation created by get_or_create_dm() has exactly two participants
-- (a direct message), but the shape supports group chats later.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- Everything the participant has read up to; drives unread counts.
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

-- Same pattern as is_class_teacher/is_class_student in schema.sql: wrap the
-- cross-table check in a SECURITY DEFINER function so evaluating the
-- conversation_participants policy doesn't recurse into itself.
create or replace function is_conversation_participant(cid uuid)
returns boolean as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = cid and user_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

drop policy if exists "conversations_select" on conversations;
create policy "conversations_select" on conversations for select using (
  is_conversation_participant(id)
);
-- No insert/update/delete policy on conversations — they're only ever
-- created through get_or_create_dm() below (SECURITY DEFINER, bypasses RLS).

drop policy if exists "conversation_participants_select" on conversation_participants;
create policy "conversation_participants_select" on conversation_participants for select using (
  is_conversation_participant(conversation_id)
);
drop policy if exists "conversation_participants_update_self" on conversation_participants;
create policy "conversation_participants_update_self" on conversation_participants for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);
-- No insert policy — participants are only added by get_or_create_dm().

drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  is_conversation_participant(conversation_id)
);
drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages for insert with check (
  sender_id = auth.uid() and is_conversation_participant(conversation_id)
);

-- A2. START-OR-REUSE A DIRECT CONVERSATION ---------------------------
-- Any authenticated user (admin/teacher/student) can message any other —
-- "chat for all users" per the app's product requirement, not scoped to
-- shared classes. Finds an existing 1:1 conversation between the caller
-- and p_other_user, or creates one.
create or replace function get_or_create_dm(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_other_user is null or p_other_user = auth.uid() then
    raise exception 'Cannot start a conversation with yourself';
  end if;
  if not exists (select 1 from profiles where id = p_other_user) then
    raise exception 'User not found';
  end if;

  select cp1.conversation_id into v_id
  from conversation_participants cp1
  join conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id and cp2.user_id = p_other_user
  where cp1.user_id = auth.uid()
    and (
      select count(*) from conversation_participants cp3
      where cp3.conversation_id = cp1.conversation_id
    ) = 2
  limit 1;

  if v_id is null then
    insert into conversations default values returning id into v_id;
    insert into conversation_participants (conversation_id, user_id)
    values (v_id, auth.uid()), (v_id, p_other_user);
  end if;

  return v_id;
end;
$$;
grant execute on function get_or_create_dm(uuid) to authenticated;

-- A3. CONVERSATION INBOX ----------------------------------------------
-- One row per conversation the caller is in, with the other participant,
-- a preview of the last message, and how many are unread. Powers the
-- Messages inbox list without exposing anyone else's inbox.
create or replace function get_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_user_name text,
  other_user_role text,
  last_message text,
  last_message_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.conversation_id,
    p.id as other_user_id,
    p.full_name as other_user_name,
    p.role as other_user_role,
    lm.body as last_message,
    lm.created_at as last_message_at,
    (
      select count(*)::int from messages m2
      where m2.conversation_id = cp.conversation_id
        and m2.created_at > cp.last_read_at
        and m2.sender_id <> auth.uid()
    ) as unread_count
  from conversation_participants cp
  join conversation_participants other
    on other.conversation_id = cp.conversation_id and other.user_id <> auth.uid()
  join profiles p on p.id = other.user_id
  left join lateral (
    select body, created_at from messages m
    where m.conversation_id = cp.conversation_id
    order by created_at desc
    limit 1
  ) lm on true
  where cp.user_id = auth.uid()
  order by coalesce(lm.created_at, to_timestamp(0)) desc;
$$;
grant execute on function get_my_conversations() to authenticated;

-- A4. MARK READ ---------------------------------------------------------
create or replace function mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
$$;
grant execute on function mark_conversation_read(uuid) to authenticated;

-- A5. TOTAL UNREAD COUNT (navbar badge) ----------------------------------
create or replace function get_unread_message_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    (
      select count(*) from messages m
      where m.conversation_id = cp.conversation_id
        and m.created_at > cp.last_read_at
        and m.sender_id <> auth.uid()
    )
  ), 0)::int
  from conversation_participants cp
  where cp.user_id = auth.uid();
$$;
grant execute on function get_unread_message_count() to authenticated;

-- A6. REALTIME -----------------------------------------------------------
-- Let clients subscribe to new messages for live delivery. Safe to re-run:
-- guarded so it doesn't error if already added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

-- ==========================================================
-- PART B — PAIR ACTIVITIES
-- ==========================================================
-- An activity block can be marked data->>'mode' = 'pair' (see
-- src/lib/blockTypes.js). Before answering, two students in the same
-- class enroll as partners: one requests, the other accepts. Once
-- accepted, submitting the activity (submit_pair_activity_progress below)
-- writes the same response/score to both students' student_progress rows.

-- B1. Let students see who else is in their own class(es). This already
-- existed for teachers/admins; students need it too, to pick a partner
-- (and it's handy for starting a chat with a classmate).
drop policy if exists "class_students_select" on class_students;
create policy "class_students_select" on class_students for select using (
  student_id = auth.uid()
  or current_role_name() = 'admin'
  or is_class_teacher(class_students.class_id)
  or is_class_student(class_students.class_id)
);

-- B2. PAIR_REQUESTS -------------------------------------------------
create table if not exists pair_requests (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references module_content (id) on delete cascade,
  assignment_id uuid not null references module_assignments (id) on delete cascade,
  requester_id uuid not null references profiles (id) on delete cascade,
  partner_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> partner_id)
);

-- Only one active (pending or accepted) pairing between the same two
-- people, for the same block+assignment, regardless of who requested.
create unique index if not exists pair_requests_active_uidx
  on pair_requests (content_id, assignment_id, least(requester_id, partner_id), greatest(requester_id, partner_id))
  where status in ('pending', 'accepted');

alter table pair_requests enable row level security;

-- Auto-stamp responded_at the moment a pending request is settled, rather
-- than trusting the client to send it.
create or replace function set_pair_request_responded_at()
returns trigger as $$
begin
  if new.status <> 'pending' and old.status = 'pending' then
    new.responded_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pair_request_responded on pair_requests;
create trigger trg_pair_request_responded
before update on pair_requests
for each row execute procedure set_pair_request_responded_at();

-- SELECT: either side of the request, that class's teacher, or admin.
drop policy if exists "pair_requests_select" on pair_requests;
create policy "pair_requests_select" on pair_requests for select using (
  requester_id = auth.uid()
  or partner_id = auth.uid()
  or current_role_name() = 'admin'
  or exists (
    select 1 from module_assignments a
    join classes c on c.id = a.class_id
    where a.id = pair_requests.assignment_id and c.teacher_id = auth.uid()
  )
);

-- INSERT: a student can request a partner who is enrolled in the same
-- class as the assignment (and so is the requester), for a block that is
-- actually a pair-mode activity in that module.
drop policy if exists "pair_requests_insert" on pair_requests;
create policy "pair_requests_insert" on pair_requests for insert with check (
  requester_id = auth.uid()
  and current_role_name() = 'student'
  and requester_id <> partner_id
  and exists (
    select 1 from module_content mc
    where mc.id = pair_requests.content_id
      and mc.type = 'activity'
      and coalesce(mc.data ->> 'mode', 'individual') = 'pair'
  )
  and exists (
    select 1 from module_assignments a
    join class_students cs_r on cs_r.class_id = a.class_id and cs_r.student_id = pair_requests.requester_id
    join class_students cs_p on cs_p.class_id = a.class_id and cs_p.student_id = pair_requests.partner_id
    where a.id = pair_requests.assignment_id and a.module_id = (select module_id from module_content where id = pair_requests.content_id)
  )
);

-- UPDATE: only while still pending. The invited partner can accept/decline;
-- the original requester can cancel their own outgoing request.
drop policy if exists "pair_requests_update" on pair_requests;
create policy "pair_requests_update" on pair_requests for update using (
  status = 'pending'
  and (partner_id = auth.uid() or requester_id = auth.uid())
) with check (
  (partner_id = auth.uid() and status in ('accepted', 'declined'))
  or (requester_id = auth.uid() and status = 'cancelled')
);

-- B3. SUBMIT A PAIR ACTIVITY ---------------------------------------------
-- Called by whichever partner clicks "Submit" — writes the identical
-- response/score to BOTH students' student_progress rows (one insert or
-- update each), so the pair is graded together. Runs as SECURITY DEFINER
-- because student_progress's own RLS only lets a student write their own
-- row; every check the normal insert policy would have made is redone
-- here by hand, for both students, before anything is written.
create or replace function submit_pair_activity_progress(
  p_content_id uuid,
  p_assignment_id uuid,
  p_response jsonb,
  p_score numeric,
  p_max_score numeric,
  p_time_spent_seconds int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
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
    (content_id, assignment_id, student_id, response, score, max_score, completed, completed_at, time_spent_seconds)
  values
    (p_content_id, p_assignment_id, auth.uid(), p_response, p_score, p_max_score, true, now(), p_time_spent_seconds)
  on conflict (content_id, assignment_id, student_id) do update set
    response = excluded.response,
    score = excluded.score,
    max_score = excluded.max_score,
    completed = true,
    completed_at = now(),
    time_spent_seconds = excluded.time_spent_seconds;

  insert into student_progress
    (content_id, assignment_id, student_id, response, score, max_score, completed, completed_at, time_spent_seconds)
  values
    (p_content_id, p_assignment_id, v_partner, p_response, p_score, p_max_score, true, now(), p_time_spent_seconds)
  on conflict (content_id, assignment_id, student_id) do update set
    response = excluded.response,
    score = excluded.score,
    max_score = excluded.max_score,
    completed = true,
    completed_at = now(),
    time_spent_seconds = excluded.time_spent_seconds;
end;
$$;
grant execute on function submit_pair_activity_progress(uuid, uuid, jsonb, numeric, numeric, int) to authenticated;

-- B4. REALTIME for pair_requests (so the invited partner sees the request
-- appear live, and the requester sees it get accepted).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pair_requests'
  ) then
    alter publication supabase_realtime add table pair_requests;
  end if;
end $$;
