# Learning Hub

A role-based learning platform for **Admins**, **Teachers**, and **Students**, built with React (Vite) + Supabase.

## Structure

```
learning-hub/
├── src/
│   ├── main.jsx, App.jsx, index.css
│   ├── supabaseClient.js        # Supabase client init
│   ├── context/AuthContext.jsx  # session + role
│   ├── components/
│   │   ├── PrivateRoute.jsx     # route guard by role
│   │   ├── Navbar.jsx           # role-aware nav
│   │   ├── ReadAloud.jsx        # Web Speech API play/pause/stop
│   │   └── blocks/              # per-content-type editors + student views
│   │       ├── LectureEditor.jsx / LectureView.jsx
│   │       ├── ActivityEditor.jsx / ActivityView.jsx     (MC, T/F, short answer, matching)
│   │       ├── InteractiveEditor.jsx / InteractiveView.jsx  (routes by subtype)
│   │       ├── FlashcardsEditor.jsx / FlashcardsView.jsx
│   │       └── HotspotsEditor.jsx / HotspotsView.jsx     (clickable image hotspots)
│   ├── lib/blockTypes.js        # shared block/question shapes + grading
│   └── pages/
│       ├── Login.jsx            # single login for all roles
│       ├── RoleHome.jsx         # redirects "/" to role dashboard
│       ├── teacher/  (Dashboard, CreateClass, Modules, AddModule, ModuleBuilder)
│       ├── student/  (Dashboard, MyModules, MyBadges, ModulePlayer)
│       └── admin/    (Dashboard, ModuleApproval, ClassManagement, CreateAccounts)
├── supabase/
│   ├── schema.sql                # tables + RLS policies + storage bucket
│   ├── schema_chat_and_pairs.sql # in-app chat (all users) + pair-activity requests, run after schema.sql
│   ├── add_sub_modules.sql       # sub-topics inside a module + backfill for existing content
│   ├── add_module_media.sql      # module cover photo column + author portrait
│   ├── add_subjective_review.sql # teacher-scored written answers + review RPCs
│   ├── fix_answer_keys.sql       # activity data rewritten to match the official key
│   └── functions/create-user/    # edge function: admin-only account creation
├── .env.example
└── package.json
```

## Flow

1. **Login** — one page, no public sign-up. `AuthContext` reads `profiles.role`
   after login and routes to `/admin`, `/teacher`, or `/student`.
2. **Teacher** — Dashboard → Create Class (pick students from `profiles` where
   `role='student'`) → Add Module (inserted with `status='pending'`, shows
   "My Submissions" with a **Build Content** link) → Module Builder (add,
   reorder, edit, delete self-contained content blocks — Lecture, Activity,
   Interactive) → Modules (catalog of every `approved` module from every
   teacher, admin-approved) → Assign Module (pick any approved module + one
   of your own classes + a due date → inserts into `module_assignments`).
3. **Student** — Dashboard → My Modules (assigned modules with due date,
   days-left badge, and a completion progress bar) → Module Player (steps
   through a module's blocks, tracks per-block completion in
   `student_progress`) → My Badges.
4. **Admin** — Dashboard → Module Approval (manage every module application —
   pending, approved, rejected — with tabs and status-change actions) →
   Class Management (create sections, assign/reassign a section to a
   teacher, add or remove students from a section's roster) → Create
   Accounts (calls the `create-user` edge function, since creating auth
   users needs the service-role key, which must never live in frontend
   code).

## Module content blocks

A module is self-contained: everything a student needs is stored as ordered
rows in `module_content` (see `src/lib/blockTypes.js` for the exact JSON
shape of each type's `data` column), with per-student completion/responses
in `student_progress`.

- **Lecture** — text content with an optional read-aloud control (browser
  Web Speech API, no external service or API key needed).
- **Activity** — Forms-style graded questions: Multiple Choice, True/False,
  Short Answer, and Matching. Auto-graded on submit.
- **Interactive** — the open-ended type. Two subtypes ship today:
  - *Flashcards* — front/back cards students flip through.
  - *Image Hotspots* — teacher uploads (or links) an image and places
    clickable pins on it; each pin reveals a label + description. Students
    complete the block once every pin has been clicked. Images upload to
    the `module-images` Supabase Storage bucket (public read; only
    teachers/admins can write — see `schema.sql`).
  More subtypes can be added by registering an editor/view pair in
  `InteractiveEditor.jsx` / `InteractiveView.jsx` without any schema change.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/schema_chat_and_pairs.sql`,
   then the `supabase/seed*.sql` files you want, and finally
   in order: `supabase/add_sub_modules.sql`, `supabase/add_module_media.sql`,
   `supabase/add_subjective_review.sql`, `supabase/fix_answer_keys.sql`. All
   four read or rewrite content that's already there, so they go last, and
   all four are idempotent.
3. Deploy the edge function:
   ```
   supabase functions deploy create-user
   ```
4. Copy `.env.example` to `.env` and fill in your project URL + anon key.
5. Create your first **admin** manually (Supabase Dashboard → Authentication →
   Add user, then update that row's `profiles.role` to `'admin'` in the table
   editor) — every other account should be created through the app.
6. Install and run:
   ```
   npm install
   npm run dev
   ```

## Answer keys and teacher-scored answers

Activity answers follow the official "Final References and Key to Correction"
document. `fix_answer_keys.sql` rewrites every activity block's `data` in
place — matched on module title + block title — so applying a key correction
doesn't destroy student progress the way re-running a seed file would. The
seed files themselves carry the same corrected content, for fresh installs.

Two things fall out of that key:

- **Marked words.** Prompts that say "replace the underlined word" now
  actually mark it: `__word__` renders underlined, `**word**` bold, via
  `src/components/RichText.jsx`. Before this, several of those items pointed
  at nothing, and one (Module 1, Activity 4) was keyed to the wrong option.
- **"Answers may vary" questions are not auto-scored.** A question with
  `"subjective": true` contributes nothing to the auto-graded
  `score`/`max_score`. Its points go to `subjective_max`, the submission is
  saved with `pending_review = true`, and until a teacher scores it the row
  is worth **zero points and earns no badges** — the student sees "For
  review — no score yet" rather than a provisional number that silently
  changes later.

  Teachers score it at **Review Submissions** (`/teacher/review-submissions`),
  which lists every pending row from their own classes with the student's
  answer beside the key's model answer (`sampleAnswer`, never shown to
  students). Saving a score clears the flag, and the database trigger
  recomputes accuracy as `(auto + teacher) / (auto max + subjective max)`.
  Resubmitting an activity clears any previous teacher score — it was given
  for different words.

## Lecture formatting and photos

Lecture bodies are still plain text, but they're now typeset rather than
dumped into a `<pre>`. `src/lib/lectureFormat.js` parses the body into
headings, subheadings, list items and indented paragraphs, and supports
`**inline bold**`.

The one rule to know if you touch that parser: **it must never add, remove or
reorder a character.** Highlights are stored as plain character offsets into
`data.body`, so an invented or swallowed character would shift every
highlight a student has ever saved. The markup characters that shouldn't be
visible — the `**` of bold, the `\n` at the end of each line — are still
rendered, inside a `.lecture-syntax` span that CSS hides with
`font-size: 0`: present for the DOM TreeWalker that computes offsets,
invisible to the reader. There's a round-trip check worth keeping: the
concatenated text of every segment must equal the original body exactly.

What gets bolded automatically: `MODULE n`/ALL-CAPS lines (major heading),
`Section n.n` / `Activity n` / short unpunctuated lines (subheading), and a
run-in `Label:` at the start of a paragraph ("Reflection Prompt: …"). A
named heading like "Closing Section" only counts when it's the whole line.
Anything else, wrap in `**asterisks**`.

Photos come in two places:

- **Per lecture block** — `data.imageUrl` / `imageCaption` / `imageSize`
  (`small` | `medium` | `full`), uploaded from Lecture Editor into the
  existing `module-images` bucket. No schema change; it's just block JSON.
- **Per module** — `modules.cover_image_url`, set in Module Builder, shown on
  the student's module card, at the top of the player, and in preview.

The author's portrait ships as `public/author-portrait.png` and is attached
to the Preliminaries "About the Author" lecture by `add_module_media.sql`.

## Sub-modules (sub-topics)

A module is no longer a flat list of blocks. Each module owns an ordered list
of **sub-topics** (`sub_modules`), and every content block points at one via
`module_content.sub_module_id`.

- **Students** see a collapsible sub-topic navigator in the player, each row
  with its own progress ring. A sub-topic unlocks only once every *required*
  block in the sub-topics before it is done, so the Self-Check can't be
  reached by skipping the practice. Finishing one fires a small confetti
  burst; finishing the module still fires the big one.
- **Teachers** manage sub-topics in Module Builder: add, rename, reorder,
  delete. Deleting a sub-topic never deletes content — the FK is
  `ON DELETE SET NULL`, so its blocks fall back into "Other content" and can
  be re-filed from the dropdown on each block.
- **Block order is still module-wide.** `module_content.order_index` is the
  single source of truth for sequence; `sub_modules.order_index` decides the
  order the sub-topics are listed and unlocked in. Keep a sub-topic's blocks
  contiguous in the block order and the two agree naturally.
- `sub_module_id` is nullable, so a module that was never organised keeps
  working exactly as before — it just renders as one "Other content" group.
- `add_sub_modules.sql` backfills the seeded course content by reading the
  section headings already in the block titles ("Section 1.1: Lexical
  Competence" → sub-topic "Lexical Competence", plus Overview, Self-Check and
  Closing sub-topics). Preliminaries, which has no sections, becomes one
  sub-topic per front-matter page. Re-running it is a no-op for blocks that
  already have a sub-topic.

## Notes / next steps

- Badges are stored but nothing awards them yet — add a teacher/admin "award
  badge" UI or trigger it from module-completion logic once that's built.
- Module content itself (lessons, files, quizzes) isn't modeled yet —
  `modules` tracks title/subject/description/status, and
  `module_assignments` tracks which class got which module and by when;
  extend with a `module_content`/`submissions` table once that's needed.
- RLS policies enforce the access rules at the database level, not just the
  UI: teachers can only assign to classes/sections they own, only approved
  modules can be assigned, and admins have full read/write on classes,
  enrollment, and module approval.
