-- Run this ONLY if you already ran the old (broken) seed.sql and got
-- "Database error querying schema" on login. It removes the accounts
-- this seed creates so you can re-run the fixed seed.sql cleanly.
-- Safe to run even if some/none of these exist yet.

delete from auth.users
where email like '%@learninghub.local';
-- profiles rows are removed automatically (on delete cascade),
-- which also cascades to class_students / classes ownership.

delete from classes
where name in ('11STEM01A','11STEM01B','11ABM01A','11ABM01B','11HUMSS01A','11HUMSS01B');
