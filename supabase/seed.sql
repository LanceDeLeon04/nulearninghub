-- ==========================================================
-- Learning Hub - Default account + section seed data
-- Run this AFTER schema.sql, in the Supabase SQL editor.
--
-- NOTES / ASSUMPTIONS (change before running if wrong):
--  - The app logs in with EMAIL, not username. Every username below
--    is turned into `<username>@learninghub.local`. Swap the domain
--    in the `email_domain` variable below if you have a real one.
--  - Your request listed "faculty2" twice; the second one is seeded
--    as "faculty3" so usernames stay unique.
--  - Passwords are stored properly hashed (bcrypt via pgcrypto).
--  - Students are seeded as student01..student60 with dummy names
--    "Student 01".."Student 60", split evenly (10 each) across the
--    6 sections below, in order.
--  - IMPORTANT: auth.users has several NOT-quite-nullable text columns
--    (confirmation_token, recovery_token, email_change*, phone_change*,
--    reauthentication_token). Leaving them NULL is what causes
--    "Database error querying schema" on login — this version sets
--    them all to '' explicitly to avoid that.
-- ==========================================================

do $$
declare
  email_domain text := 'learninghub.local';
  default_pw   text := 'password123';

  admin1_id uuid := gen_random_uuid();
  admin2_id uuid := gen_random_uuid();
  fac1_id   uuid := gen_random_uuid();
  fac2_id   uuid := gen_random_uuid();
  fac3_id   uuid := gen_random_uuid();

  section_names text[] := array['11STEM01A','11STEM01B','11ABM01A','11ABM01B','11HUMSS01A','11HUMSS01B'];
  section_ids   uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  section_teachers uuid[];

  stu_id uuid;
  i int;
  sec_idx int;
begin
  section_teachers := array[fac1_id, fac2_id, fac3_id, fac1_id, fac2_id, fac3_id];

  -- 1) Admins
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    (admin1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin.rizo@' || email_domain, extensions.crypt('rizo$2026', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Molina G. Rizo','role','admin'),
     now(), now(), '', '', '', '', '', '', '', ''),
    (admin2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin.lance@' || email_domain, extensions.crypt('Lance$0445', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Lance De Leon','role','admin'),
     now(), now(), '', '', '', '', '', '', '', '');

  -- 2) Faculty (dummy names — replace with real ones later in profiles)
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    (fac1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'faculty1@' || email_domain, extensions.crypt(default_pw, extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Faculty One','role','teacher'),
     now(), now(), '', '', '', '', '', '', '', ''),
    (fac2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'faculty2@' || email_domain, extensions.crypt(default_pw, extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Faculty Two','role','teacher'),
     now(), now(), '', '', '', '', '', '', '', ''),
    (fac3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'faculty3@' || email_domain, extensions.crypt(default_pw, extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Faculty Three','role','teacher'),
     now(), now(), '', '', '', '', '', '', '', '');

  -- 3) Sections / classes, one per faculty round-robin
  for i in 1..6 loop
    insert into classes (id, name, subject, teacher_id)
    values (
      section_ids[i],
      section_names[i],
      regexp_replace(regexp_replace(section_names[i], '^[0-9]+', ''), '[0-9]+[A-Za-z]?$', ''),
      section_teachers[i]
    );
  end loop;

  -- 4) 60 dummy students, split 10 per section, enrolled as they're created
  for i in 1..60 loop
    stu_id := gen_random_uuid();
    sec_idx := ((i - 1) / 10) + 1; -- 1..6

    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values
      (stu_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'student' || lpad(i::text, 2, '0') || '@' || email_domain,
       extensions.crypt(default_pw, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('full_name', 'Student ' || lpad(i::text, 2, '0'), 'role', 'student'),
       now(), now(), '', '', '', '', '', '', '', '');

    insert into class_students (class_id, student_id)
    values (section_ids[sec_idx], stu_id);
  end loop;
end $$;
