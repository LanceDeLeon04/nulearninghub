-- ==========================================================
-- Learning Hub - Module & lecture photos
--
-- Adds a cover photo to modules, and drops the author's portrait into the
-- Preliminaries "About the Author" lecture. Lecture photos themselves need
-- no migration: they live in the block's existing `data` JSON
-- (imageUrl / imageCaption / imageSize) and are uploaded to the
-- module-images bucket that schema.sql already creates.
--
-- Safe to re-run. Run AFTER schema.sql and the seed_content_*.sql files.
-- ==========================================================

-- 1. MODULE COVER PHOTO ------------------------------------------
-- Nullable: modules without a photo render exactly as before.
alter table modules add column if not exists cover_image_url text;

-- No new RLS needed — this is a column on modules, so the existing
-- modules_select / modules_update_owner_or_admin policies already govern
-- who can see and change it.

-- 2. AUTHOR PORTRAIT ---------------------------------------------
-- The portrait ships with the app as a static file (public/author-portrait.png),
-- so it's served from the app's own origin and needs no storage upload or
-- signed URL. Swap the path here if you'd rather host it in the
-- module-images bucket.
update module_content
set data = data
  || jsonb_build_object(
       'imageUrl', '/author-portrait.png',
       'imageCaption', 'Molina G. Rizo, author',
       'imageSize', 'medium'
     )
where title = 'About the Author'
  and type = 'lecture';

-- 3. OPTIONAL: use the portrait as the Preliminaries cover ---------
-- Commented out by default — uncomment if you want the author's photo to
-- head the Preliminaries card in My Modules as well.
-- update modules
-- set cover_image_url = '/author-portrait.png'
-- where title = 'Preliminaries';
