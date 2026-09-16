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
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/schema_chat_and_pairs.sql`.
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
