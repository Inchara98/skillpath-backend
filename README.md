# SkillPath / Bana Pele

A Beckn-based early-childhood training platform, built as three small Node.js
backend services plus a Flutter frontend (in a separate repo). No frameworks,
no npm dependencies for the backend — plain Node `http` servers throughout.

There are two Flutter apps sharing one codebase:
- **Bana Pele** — the learner-facing app
- **National Skilling Authority** — the provider-facing dashboard app

...plus a WhatsApp bot as a third, no-app-install way for learners to reach
the same features.

## Why it's built this way

This is a demo/prototype of a **Beckn network** — an open protocol for
discovery and transactions (originally built for things like open commerce
networks, here repurposed for training/support discovery). The three backend
services play two standard Beckn roles:

- **BAP** ("Beckn Application Platform" — the buyer side): what the
  learner's app or the WhatsApp bot talks to. Represents *demand*.
- **BPP** ("Beckn Provider Platform" — the seller side): what actually owns
  the data (courses, peer profiles, donors, spaces). Represents *supply*.

They talk to each other using the real Beckn actions — `discover`, `select`,
`init`, `confirm` — round-tripped through `onix-bap` / `onix-bpp` gateway
processes (not part of this repo; think of them as the postal service
between BAP and BPP). This round-trip is deliberately real, not simulated:
the BPP ACKs a request immediately, then sends the actual answer back later
via a callback — same as a real production Beckn network would.

## The three services

All three are on Render, all Node.js, no framework:

| Service | File | Role | Render URL |
|---|---|---|---|
| **demo-bap** | `demo-bap-server.js` | Buyer/BAP side. Talks to learners (via the Flutter app or the WhatsApp bot). | `https://skillpath-demo-bap.onrender.com` |
| **course-bpp** | `course-bpp-server.js` | Seller/BPP side. Owns courses, practitioners/peers, donors, spaces. | `https://skillpath-course-bpp.onrender.com` |
| **whatsapp-bot** | `whatsapp-bot-server.js` | Talks to Meta's WhatsApp Business API on one side, and to demo-bap (the same 5 endpoints the Flutter app uses) on the other. | `https://skillpath-whatsapp-bot.onrender.com` |

There's also a **provider dashboard**, a Flutter *web* build, deployed as a
Render **Static Site**: `https://skillpath-provider-web.onrender.com`. Its
source lives in the separate Flutter monorepo (see below), not in this repo
— only the built output (`provider-web/`) is committed here for deploy.

**ngo-web** (`ngo-web/`) is a React + Vite + TypeScript SPA for NGO partner
users — the counterpart to provider-web, but for NGOs instead of government
users. Unlike provider-web, its full source lives in this repo. Not yet
deployed — would also be a Render **Static Site** (Root Directory `ngo-web`,
Build Command `npm install && npm run build`, Publish Directory `dist`,
with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set in Render's
Environment tab, since Vite bakes them into the build at build time, not
read at runtime). URL: _pending first deploy_.

## Repos

- **This repo** (`github.com/Inchara98/skillpath-backend`): the 3 backend
  services + the WhatsApp bot + the built provider-web static files.
- **Flutter monorepo** (local only, not pushed anywhere yet):
  `~/skillpath-v3/skillpath/` — source for both Flutter apps (Bana Pele +
  National Skilling Authority) and the provider dashboard.

## Role-separated auth (government vs NGO)

`ngo-web` and `provider-web` share one Supabase Auth project, but a
government account must never be able to sign into `ngo-web`, and an NGO
account must never be able to sign into `provider-web`. This is enforced
via a `profiles` table (`supabase/003_recreate_profiles_org_type.sql`) with
an `org_type` column (`'government'` | `'ngo'`) and RLS restricting writes
to the `service_role` key only — a signed-in user can read their own
`org_type` but can never set or change it from the client SDK. Accounts are
provisioned exclusively via `scripts/create-partner-user.mjs` (no public
sign-up screen anywhere).

`ngo-web`'s `src/lib/auth-context.tsx` implements the check: after
`signInWithPassword` succeeds, it reads `profiles.org_type` for that user
and immediately signs back out (rejecting the login) unless it equals
`'ngo'`.

**provider-web** (the Flutter app, source outside this repo) needs the
mirror-image check wherever it currently calls Supabase Auth sign-in:
after a successful `signInWithPassword`, query `profiles` for that user's
`org_type`, and reject the sign-in (call `signOut()`, surface an error)
unless it equals `'government'`. Same table, same RLS policy, opposite
required value.

**Known gap:** this only covers Supabase Auth/data accessed directly by
the client SDK. `course-bpp-server.js` and `demo-bap-server.js` still use
the `service_role` key for everything (bypasses RLS) and have no
authorization on their provider-only endpoints — an NGO account could
still call those HTTP endpoints directly, just not through either app's
UI. Hardening those endpoints (JWT verification + `org_type` check per
request) is a separate, not-yet-built follow-up.

## Database

All 3 services persist to **Supabase (Postgres)**. If `SUPABASE_URL` /
`SUPABASE_SERVICE_KEY` aren't set, everything still runs — it just falls
back to in-memory storage that resets whenever the service restarts (handy
for quick local testing, not for anything you want to keep).

Tables:
| Table | Owned by | Purpose |
|---|---|---|
| `courses`, `practitioners`, `pending_requests` | course-bpp | Course catalog, peer/practitioner profiles, pending init/confirm approvals |
| `donors`, `spaces` | course-bpp | Provider-managed directories (see below) |
| `learners` | demo-bap | Learner records — includes `catalog`, `peer_catalog`, `donor_catalog`, `space_catalog` as jsonb columns |
| `wa_sessions`, `wa_experts`, `centre_requests`, `peer_connect_requests` | whatsapp-bot | Bot session state, registered experts, support requests, peer-connect requests |
| `qa_logs` | whatsapp-bot | Logs every real Q&A answer (question, answer, phone, timestamp) |

**Important architecture detail:** course-bpp deliberately never knows phone
numbers — it only knows learner/practitioner *ids* (as the Beckn protocol
carries them). demo-bap cross-references its own `learners` table by that
same id to attach a phone number when one is needed (e.g. to message a peer
on WhatsApp). This means: **a peer/practitioner profile created directly by
a provider (without that person ever having logged into the app) has no
phone number and currently can't be "connected" via WhatsApp** — check the
`courseStatus` field on a practitioner record: `not_started` means they've
never logged in as a real learner and aren't reachable yet; `enrolled` or
`completed` means they have. Donors and spaces don't have this limitation —
they carry their own contact info directly on the record, no cross-reference
needed.

## The 5 demo flows

1. General Bana Pele program questions (Q&A, powered by Claude + web search)
2. Economic/donation help → connect to donors
3. Space to host an event → connect to space owners
4. Connect with peers (see the phone-number caveat above)
5. General support request (e.g. "make my play area safer") → stored and
   routed to an admin/expert

## Conversational design

Every WhatsApp message is classified by an AI router (`classifyConversation`,
via the Anthropic API) into an intent — natural phrasing like "connect me
with Marizanne" just works, no menu numbers needed. If `ANTHROPIC_API_KEY`
isn't set, or the AI call fails for any reason, the bot automatically falls
back to the older, fully deterministic menu flow (`handleMenuDrivenFlow` —
type 1/2/3/4). The bot should never go completely silent because of an AI
hiccup.

## Setup

```bash
git clone https://github.com/Inchara98/skillpath-backend.git
cd skillpath-backend
cp .env.example .env   # fill in real values — see .env.example for what each does
```

No `npm install` needed — there are no dependencies, just plain Node.

Run any of the 3 services locally:
```bash
npm run start:bap            # demo-bap-server.js,       default port 3001
npm run start:bpp             # course-bpp-server.js,     default port 3002
npm run start:whatsapp-bot    # whatsapp-bot-server.js,   default port 4000
```

For local testing, `whatsapp-bot` needs `BAP_BASE_URL` pointing at wherever
`demo-bap` is running (defaults to `http://localhost:3001`), and `demo-bap`
needs `BPP_BASE_URL` pointing at `course-bpp` (defaults to
`http://localhost:3002`). See `.env.example` for the full list and what
each variable is for.

## Deploying (Render)

Each of the 3 services is its own Render Web Service, auto-deploying on
push to `main`. The provider dashboard is a separate Render **Static Site**
serving the pre-built `provider-web/` folder. ngo-web would be set up the
same way as a Static Site, but building from source (Root Directory
`ngo-web`, Build Command `npm install && npm run build`, Publish Directory
`dist`) since — unlike provider-web — its source lives in this repo.

Standard workflow for a code change made via Claude:
1. Claude edits the file, presents it for download
2. Download it, then move it into your local clone, overwriting the old
   version — check the exact downloaded filename first, since repeat
   downloads often get a `(1)` suffix appended
3. `git add` / `git commit` / `git push`
4. Render auto-deploys

Render's free tier spins services down after ~15 minutes idle — the first
request after a gap can be slow or briefly return `fetch failed`; retry
after ~20-30 seconds rather than assuming something's broken.

## Known gaps (honestly incomplete, not hidden)

- **Peer phone numbers**: as described above, a peer profile created
  without the person ever enrolling has no phone number and can't be
  connected yet. The cleanest fix is letting the peer-profile endpoint
  accept an optional `phone` field directly, same pattern as donors/spaces.
- No dashboard UI yet for managing donors/spaces/peer profiles — only
  `curl` against the provider-only endpoints works right now.
- No reject button for centre-setup/support requests (backend supports the
  concept, UI doesn't expose it yet).
- No retry/backoff for cold-start `fetch failed` errors.

## Testing things manually

Useful `curl` patterns for exercising the system directly without the app
or WhatsApp:

```bash
# Create/update a donor (provider-only endpoint)
curl -X POST https://skillpath-course-bpp.onrender.com/api/donors/<id> \
  -H "Content-Type: application/json" \
  -d '{"name": "...", "supportType": "...", "area": "...", "contactPhone": "...", "contactEmail": "...", "description": "..."}'

# Create/update a space (provider-only endpoint)
curl -X POST https://skillpath-course-bpp.onrender.com/api/spaces/<id> \
  -H "Content-Type: application/json" \
  -d '{"name": "...", "spaceType": "...", "area": "...", "address": "...", "capacity": "...", "contactName": "...", "contactPhone": "...", "availability": "..."}'

# Create/update a peer profile (provider-only endpoint — can create a
# brand-new practitioner from scratch, doesn't require prior enrollment)
curl -X POST https://skillpath-course-bpp.onrender.com/api/practitioners/<id>/peer-profile \
  -H "Content-Type: application/json" \
  -d '{"name": "...", "tier": "Gold", "area": "...", "yearsExperience": 5, "elpType": "...", "hubs": [], "certifications": []}'

# See course-bpp's current in-memory state (courses, practitioners, pending requests
# — NOT donors/spaces, those aren't exposed here)
curl https://skillpath-course-bpp.onrender.com/api/state

# Trigger a real discover call from demo-bap (simulates what the app/bot does)
curl -X POST https://skillpath-demo-bap.onrender.com/api/trigger/discover \
  -H "Content-Type: application/json" \
  -d '{"category": "donors"}'   # or "spaces" or "peers", omit for courses

# Check what demo-bap currently has cached for the default guest learner
curl https://skillpath-demo-bap.onrender.com/api/state
```

The most reliable way to test the WhatsApp conversational flows is to just
message the real number directly rather than faking the Meta webhook
payload: **+1 (555) 148-7840**.
