# NGO Partner Platform (ngo-web)

The NGO-facing counterpart to `provider-web` (the government-facing Flutter
app) on the SkillPath / Bana Pele Beckn network. Built as a standalone React
SPA — unlike the rest of this repo's backend services, it's a real npm
project with real dependencies, not a plain-Node zero-dependency server.

## Why it's a separate stack from the rest of this repo

`provider-web` is Flutter; this is React + Vite + TypeScript + Tailwind CSS.
That was a deliberate pivot mid-build — Flutter's SDK wasn't available on
the machine this was built on, so React was chosen instead specifically
because it's a toolchain that can actually be installed, run, and verified
here. It talks to **Supabase directly** (Auth + Postgres via `@supabase/supabase-js`)
rather than going through any of the three Node backend services in this
repo — none of the ELP/support-request/notification data it displays exists
in `course-bpp-server.js` or `demo-bap-server.js` today.

## Setup

```bash
cd ngo-web
npm install
cp .env.example .env   # fill in real values, see below
npm run dev
```

Runs at `http://localhost:5173`.

### Environment variables

| Variable | What it's for |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon/public** key — safe for a client app. **Never** put the `service_role` key here; that one belongs only in the backend servers' own `.env` (see the repo root README). |

If these are unset, the app still loads (falls back to a harmless
placeholder client so nothing crashes) but sign-in will fail with a clear
error until real values are set.

## Auth

Email/password via Supabase Auth. There is **no public sign-up screen** —
accounts are provisioned exclusively via `scripts/create-partner-user.mjs`
at the repo root (run from `skillpath-backend/`, needs the backend's
`SUPABASE_SERVICE_KEY`). Login is also gated by a `profiles.org_type`
column: an account must have `org_type = 'ngo'` or it's signed back out
immediately with an error, even if the password was correct. See the repo
root README's "Role-separated auth" section and `src/lib/auth-context.tsx`.

## What's built vs. mock

**Every screen after login uses hardcoded mock data** — see
`src/data/mockDashboard.ts` for all of it, and its file-level comment for
why. There is no backend for ELPs, support requests, notifications, or
impact stats anywhere in this project yet. Nothing past login persists —
submitting the "Add Support Request" form, clicking a status action, etc.
just closes the modal or does nothing.

### Screens / routes

| Route | Page | Notes |
|---|---|---|
| `/` | Login | |
| `/actions` | My Actions Centre | Stat tiles, filterable action list, "Add Support Request" modal (Single + 5-step Batch wizard) |
| `/actions/:id` | Support Request Review | Only wired for one item (`a1`, Sunshine ELP) |
| `/support` | My Support | Active / Completed / My Impact tabs (bar chart + donut chart) |
| `/support/:id` | Active support detail | Only wired for `s1` |
| `/support/completed/:id` | Completed support detail | Only wired for `c1` |
| `/elps` | ELPs | "My ELPs" (6) and "Search ELPs" (all 12) tabs, working search/filters. Map view is a placeholder, not built. |
| `/elps/:id` | ELP profile | Only wired for Sunshine ELP (`ELP-SOW-0042`) |

**A recurring pattern throughout:** only the specific items/rows that were
shown as reference screenshots during development have real navigation and
detail content. Everything else with the same button (other action cards,
other ELPs, other support items) renders identically but the button is a
visual no-op. This isn't a bug — it's deliberate, screen-by-screen scoping;
check the specific page/component for which IDs are actually wired
(usually a `someDetails[id]` lookup guarding whether a `<Link>` or a plain
`<button>` renders).

## Project structure

```
src/
  pages/       route-level components (one per entry in the table above)
  components/  shared UI (Dropdown, modal, charts, icons, etc.)
  layouts/     DashboardLayout (sidebar + header shell for authenticated pages)
  lib/         auth-context, Supabase client, RequireAuth route guard,
               OpenMenuContext (coordinates dropdowns/popovers so only one
               is ever open at a time)
  data/        mockDashboard.ts -- the single source of all mock data
```

## Building for production

```bash
npm run build
```

Not yet deployed anywhere. Would be a Render **Static Site** (Root
Directory `ngo-web`, Build Command `npm install && npm run build`, Publish
Directory `dist`), matching `provider-web`'s deployment pattern — see the
repo root README's "The three services" section for the sibling services'
Render setup. `VITE_*` env vars must be set in Render's dashboard, not just
locally, since Vite bakes them in at build time.
