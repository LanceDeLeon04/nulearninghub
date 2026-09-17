-- ==========================================================
-- Add: require completion before advancing to next block
-- Run this in the Supabase SQL editor against your existing project.
-- ==========================================================
-- Adds require_completion to module_content. Defaults to true, so every
-- existing block starts out requiring completion (matches the behavior
-- most teachers want: no skipping ahead without reading/submitting).
-- Set to false for any block you want students to be able to skip.

alter table module_content
  add column if not exists require_completion boolean not null default true;
