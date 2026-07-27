// course-bpp/server.js
//
// This is a REAL seller (BPP) app for our demo. It replaces the
// generic "sandbox-bpp" container. Beckn (onix-bpp) will forward
// every action (discover, select, init, confirm, ...) to this single
// endpoint: POST /api/webhook
//
// For each action, we:
//   1. Immediately reply with a small ACK (Beckn requires this).
//   2. A moment later, we POST the real answer (on_select, on_init,
//      on_confirm) back to the buyer's adapter (context.bapUri).
//
// This "reply later, separately" pattern is normal for Beckn --
// it's called an asynchronous callback.
//
// ---- CHANGE LOG: multiple practitioners ----
// Used to be one single hardcoded practitioner ("Naledi"). Now it's a
// Map keyed by participant id. We never need our own login system on
// this side -- Beckn already carries the learner's identity in every
// contract's `participants[0]` (id + name), asserted by the BAP
// (demo-bap). We just trust that and look the practitioner up (or
// create their record the first time we see them).

const http = require('http');
const crypto = require('crypto');

// ---- Database (Supabase Postgres, via REST -- no npm packages needed) ----
// Optional: if these aren't set, everything below falls back to the
// original in-memory-only behaviour (data still works, just doesn't
// survive a restart).
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function dbSelect(table, query = '') {
  if (!SUPABASE_URL) return [];
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: supabaseHeaders() });
    if (!resp.ok) {
      console.error(`[course-bpp] failed to load ${table}:`, resp.status, await resp.text());
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error(`[course-bpp] failed to load ${table}:`, err.message);
    return [];
  }
}

// Insert-or-update a single row. Fire-and-forget by design (callers
// don't await this) -- persistence failures get logged but never block
// or break the actual request being served.
function dbUpsert(table, row, conflictColumn) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  })
    .then((resp) => {
      if (!resp.ok) resp.text().then((t) => console.error(`[course-bpp] failed to save to ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[course-bpp] failed to save to ${table}:`, err.message));
}

function dbDelete(table, idColumn, idValue) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/${table}?${idColumn}=eq.${encodeURIComponent(idValue)}`, {
    method: 'DELETE',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
  })
    .then((resp) => {
      if (!resp.ok) resp.text().then((t) => console.error(`[course-bpp] failed to delete from ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[course-bpp] failed to delete from ${table}:`, err.message));
}

// ---- Our simple demo "database" (just variables in memory) ----

// The catalog of courses this BPP offers -- shared by every learner,
// same as a real course catalog would be.
const catalog = [
  {
    id: 'course-001',
    name: 'Child Safety & Protection Basics',
    unlocksTier: 'Silver',
    duration: '2 weeks',
  },
  {
    id: 'course-002',
    name: 'First Aid for Early Childhood Educators',
    unlocksTier: 'Silver',
    duration: '1 week',
  },
  {
    id: 'course-003',
    name: 'Advanced Classroom Management',
    unlocksTier: 'Gold',
    duration: '3 weeks',
  },
];

const course = catalog[0];

// participantId -> { id, name, currentTier, courseStatus }
// This replaces the old single `practitioner` const. A "fallback"
// record (naledi-001) is seeded so the built-in demo page (which
// always sends the same fixed learner id from demo-bap's own
// "demo-guest" fallback) keeps behaving exactly as before.
const practitioners = new Map();

// Provider-managed directories -- same idea as practitioners' peer
// profiles, but these entries are NOT enrolled learners at all. A
// donor/space owner is added directly by the provider (via the
// endpoints below), and carries its OWN contact info, since there's no
// "learner account" to cross-reference for a phone number the way
// peers work.
const donors = new Map(); // id -> { id, name, supportType, area, contactPhone, contactEmail, description }
const spaces = new Map(); // id -> { id, name, spaceType, area, address, capacity, contactName, contactPhone, availability }

function persistDonor(d) {
  dbUpsert(
    'donors',
    {
      id: d.id,
      name: d.name,
      support_type: d.supportType,
      area: d.area,
      contact_phone: d.contactPhone,
      contact_email: d.contactEmail,
      description: d.description,
    },
    'id'
  );
}

function persistSpace(s) {
  dbUpsert(
    'spaces',
    {
      id: s.id,
      name: s.name,
      space_type: s.spaceType,
      area: s.area,
      address: s.address,
      capacity: s.capacity,
      contact_name: s.contactName,
      contact_phone: s.contactPhone,
      availability: s.availability,
    },
    'id'
  );
}

function getPractitioner(id, name) {
  if (!id) id = 'naledi-001'; // defensive fallback, shouldn't normally happen
  if (!practitioners.has(id)) {
    practitioners.set(id, {
      id,
      name: name || id,
      currentTier: 'Bronze',
      courseStatus: 'not_started', // not_started -> enrolled -> completed
      // Peer-support profile -- set by the PROVIDER (via the dashboard),
      // never by the learner or the WhatsApp bot. Only meaningful once
      // set for Silver/Gold tier practitioners who can mentor others.
      area: null,
      yearsExperience: null,
      elpType: null,
      hubs: [],
      certifications: [],
    });
    persistPractitioner(practitioners.get(id));
  }
  const p = practitioners.get(id);
  if (name && p.name !== name) {
    p.name = name; // keep the name fresh if it changes
    persistPractitioner(p);
  }
  return p;
}

function persistPractitioner(p) {
  dbUpsert(
    'practitioners',
    {
      id: p.id,
      name: p.name,
      current_tier: p.currentTier,
      course_status: p.courseStatus,
      area: p.area,
      years_experience: p.yearsExperience,
      elp_type: p.elpType,
      hubs: p.hubs || [],
      certifications: p.certifications || [],
    },
    'id'
  );
}

// Pulls { id, name } out of the incoming Contract's first participant
// -- this IS the learner's identity, as asserted by the BAP. We trust
// it rather than running our own separate login system on this side.
function extractParticipant(incomingMessage) {
  try {
    const p = incomingMessage.contract.participants[0];
    return { id: p.id, name: (p.descriptor && p.descriptor.name) || p.id };
  } catch (err) {
    return { id: 'naledi-001', name: 'Naledi' }; // defensive fallback
  }
}

// "init" (enroll) and "confirm" (mark complete) requests wait here
// until the provider manually clicks "Approve" in their own panel --
// this is the real two-way part of the demo: the provider actually
// has to act, not just auto-reply instantly.
let pendingRequests = [];

// Tier progression used to gate enrollment: a course can only be
// enrolled in if the learner has already reached the tier just below
// what that course certifies to (Gold-certifying courses require
// Silver already; Silver-certifying courses are open to Bronze).
const TIER_RANK = { Bronze: 0, Silver: 1, Gold: 2 };
function meetsPrerequisite(targetCourse, currentTier) {
  const targetRank = TIER_RANK[targetCourse.unlocksTier] ?? 0;
  const currentRank = TIER_RANK[currentTier] ?? 0;
  return currentRank >= targetRank - 1;
}

// Shared hand-off: signs and forwards a callback (on_discover,
// on_select, on_init, on_confirm...) to onix-bpp, which routes it to
// the right BAP. Used for both auto-responses and provider-approved
// or auto-rejected responses.
function sendCallback(callback) {
  logPayload('SENDING BACK', callback);
  // 'onix-bpp' is a Docker container name -- only resolvable on the
  // same Docker network. Once deployed elsewhere, set ONIX_BPP_CALLER
  // to wherever onix-bpp is actually reachable (e.g. an ngrok tunnel).
  const onixBppBase = process.env.ONIX_BPP_CALLER || 'http://onix-bpp:8082/bpp/caller';
  const bppCallerUrl = `${onixBppBase}/${callback.context.action}`;
  console.log(`[course-bpp] attempting hand-off to: ${bppCallerUrl}`);
  fetch(bppCallerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback),
  })
    .then((res) => {
      console.log(
        `[course-bpp] handed off ${callback.context.action} to onix-bpp caller -- status ${res.status}`
      );
    })
    .catch((err) => {
      // err.message alone is often just "fetch failed" -- the real
      // reason (DNS failure, connection refused, timeout, etc.) is
      // usually in err.cause, which we weren't logging before.
      console.error('[course-bpp] failed to hand off callback:', err.message, '| cause:', err.cause);
    });
}

// Small helper to pretty-print any object into the logs, so the full
// Beckn payload (context + message) is visible and verifiable --
// not just a one-line summary.
function logPayload(label, payload) {
  console.log(`[course-bpp] ${label}:`);
  console.log(JSON.stringify(payload, null, 2));
}

// ---- Build the reply message for each action ----
// We reuse the same "contract" shape Beckn expects, just filled
// with our course/tier data instead of generic placeholders.

function buildContract(status, courseId, participantId, participantName) {
  // Look up the actual course being transacted, falling back to the
  // original demo course if something's missing -- this matters now
  // that the catalog can have more than one course.
  const targetCourse = catalog.find((c) => c.id === courseId) || course;

  return {
    id: 'contract-' + participantId,
    participants: [
      {
        id: participantId,
        descriptor: { name: participantName, code: 'practitioner' },
      },
    ],
    commitments: [
      {
        id: 'commitment-' + targetCourse.id,
        descriptor: { name: targetCourse.name, code: targetCourse.id },
        status: { code: status }, // e.g. DRAFT, ACTIVE, COMPLETED
        resources: [
          {
            id: 'resource-' + targetCourse.id,
            descriptor: { name: targetCourse.name, code: targetCourse.id },
            quantity: { unitQuantity: 1, unitCode: 'COURSE' },
          },
        ],
        offer: {
          id: 'offer-' + targetCourse.id,
          resourceIds: ['resource-' + targetCourse.id],
        },
      },
    ],
    // This course is free -- no real payment involved in the demo.
    consideration: [
      {
        id: 'consideration-001',
        price: { currency: 'INR', value: '0.00' },
        status: { code: status },
        breakup: [
          { title: 'Course Fee', price: { currency: 'INR', value: '0.00' } },
        ],
      },
    ],
  };
}

// Pulls the course id the buyer is actually referring to out of the
// incoming Contract object (select/init/confirm all send one).
function extractCourseId(incomingMessage) {
  try {
    return incomingMessage.contract.commitments[0].descriptor.code;
  } catch (err) {
    return course.id; // fall back to the original demo course
  }
}

function buildResponse(action, incomingContext, incomingMessage) {
  const context = {
    ...incomingContext,
    action: 'on_' + action,
    timestamp: new Date().toISOString(),
  };

  if (action === 'discover') {
    const intent = (incomingMessage && incomingMessage.intent) || {};

    // Real Beckn discover can search across different categories --
    // we use this same mechanism to let the buyer ask for "peers"
    // (other practitioners open to mentoring) instead of courses,
    // without needing a whole separate protocol action for it.
    if (intent.category === 'peers') {
      const peers = Array.from(practitioners.values()).filter(
        (p) => p.area // show any practitioner the provider has actually set a peer profile for, regardless of tier
      );
      return {
        context,
        message: {
          catalogs: [
            {
              id: 'catalog-peer-provider-001',
              descriptor: { name: 'Peer Support Directory' },
              provider: {
                id: 'course-provider-001',
                descriptor: { name: 'ELP Training Provider' },
              },
              resources: peers.map((p) => ({
                id: p.id,
                descriptor: { name: p.name },
                // Not part of the standard Beckn Resource schema -- a
                // custom field, same approach as the tier-upgrade field
                // on on_confirm, so the peer profile travels along with
                // the resource instead of needing a second round trip.
                peerProfile: {
                  tier: p.currentTier,
                  area: p.area,
                  yearsExperience: p.yearsExperience,
                  elpType: p.elpType,
                  hubs: p.hubs || [],
                  certifications: p.certifications || [],
                },
              })),
            },
          ],
        },
      };
    }

    if (intent.category === 'donors') {
      return {
        context,
        message: {
          catalogs: [
            {
              id: 'catalog-donor-provider-001',
              descriptor: { name: 'Donor & Resource Support Directory' },
              provider: { id: 'course-provider-001', descriptor: { name: 'ELP Training Provider' } },
              resources: Array.from(donors.values()).map((d) => ({
                id: d.id,
                descriptor: { name: d.name },
                donorProfile: {
                  supportType: d.supportType,
                  area: d.area,
                  contactPhone: d.contactPhone,
                  contactEmail: d.contactEmail,
                  description: d.description,
                },
              })),
            },
          ],
        },
      };
    }

    if (intent.category === 'spaces') {
      return {
        context,
        message: {
          catalogs: [
            {
              id: 'catalog-space-provider-001',
              descriptor: { name: 'Community Space Directory' },
              provider: { id: 'course-provider-001', descriptor: { name: 'ELP Training Provider' } },
              resources: Array.from(spaces.values()).map((s) => ({
                id: s.id,
                descriptor: { name: s.name },
                spaceProfile: {
                  spaceType: s.spaceType,
                  area: s.area,
                  address: s.address,
                  capacity: s.capacity,
                  contactName: s.contactName,
                  contactPhone: s.contactPhone,
                  availability: s.availability,
                },
              })),
            },
          ],
        },
      };
    }

    // Buyer is searching -- the search term (if any) arrives in
    // message.intent.textSearch (a plain string per the real Intent
    // schema). We filter our catalog down to courses whose name
    // matches (case-insensitive, partial match). An empty/missing
    // search term returns the full catalog.
    const searchTerm = (intent.textSearch || '').trim().toLowerCase();

    const matchingCourses = searchTerm
      ? catalog.filter((c) => c.name.toLowerCase().includes(searchTerm))
      : catalog;

    // Must match the real Beckn Catalog schema: message.catalogs is an
    // array, each with a provider, resources, and offers. If nothing
    // matches the search, we still return a valid (empty) resources
    // array -- not an error.
    return {
      context,
      message: {
        catalogs: [
          {
            id: 'catalog-course-provider-001',
            descriptor: { name: 'ELP Training Provider Catalog' },
            provider: {
              id: 'course-provider-001',
              descriptor: { name: 'ELP Training Provider' },
            },
            resources: matchingCourses.map((c) => ({
              id: c.id,
              descriptor: { name: c.name },
              quantity: { unitQuantity: 1, unitCode: 'COURSE' },
            })),
            offers: matchingCourses.map((c) => ({
              id: 'offer-' + c.id,
              resourceIds: [c.id],
            })),
          },
        ],
      },
    };
  }

  const participant = extractParticipant(incomingMessage);

  if (action === 'select') {
    // Buyer is looking at the course before committing.
    const courseId = extractCourseId(incomingMessage);
    return { context, message: { contract: buildContract('DRAFT', courseId, participant.id, participant.name) } };
  }

  if (action === 'init') {
    // Buyer is starting enrollment.
    const courseId = extractCourseId(incomingMessage);
    const p = getPractitioner(participant.id, participant.name);
    p.courseStatus = 'enrolled';
    persistPractitioner(p);
    return { context, message: { contract: buildContract('ACTIVE', courseId, participant.id, participant.name) } };
  }

  if (action === 'confirm') {
    // Buyer confirms -- in our simple demo, confirming IS completing
    // the course, so we upgrade the tier right here.
    const courseId = extractCourseId(incomingMessage);
    const targetCourse = catalog.find((c) => c.id === courseId) || course;
    const p = getPractitioner(participant.id, participant.name);
    p.courseStatus = 'completed';
    p.currentTier = targetCourse.unlocksTier;
    persistPractitioner(p);

    // NOTE: the real Beckn OnConfirmAction schema only allows a
    // "contract" property in the message (additionalProperties:
    // false), so we can't send "practitioner"/"newTier" on the wire --
    // onix-bpp will reject the callback with a schema validation
    // error if we do ("property practitioner is unsupported"). The
    // tier bump is tracked here in our own in-memory state instead;
    // the buyer's app (demo-bap) applies its own
    // "course completed -> tier upgraded" rule locally.
    return {
      context,
      message: {
        contract: buildContract('COMPLETED', courseId, participant.id, participant.name),
      },
    };
  }

  // We don't have special handling for other actions in this demo.
  return null;
}

// ---- The actual server ----

const server = http.createServer((req, res) => {
  // Log every single incoming request -- helps us see exactly what
  // onix-bpp is actually sending, even if it doesn't match below.
  console.log(`[course-bpp] incoming request: ${req.method} ${req.url}`);

  // Open up CORS on every response, since the provider panel on
  // demo-bap's page (a different origin, localhost:3001) calls these
  // endpoints directly from the browser to fetch state and post
  // approve/add-course actions -- and so does the Flutter provider app.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // Preflight request the browser sends before a cross-origin POST.
    res.writeHead(204);
    res.end();
    return;
  }

  // Docker's healthcheck pings this to confirm the app is alive.
  if (req.method === 'GET' && req.url.startsWith('/api/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Exposes this app's OWN internal state (its full catalog, EVERY
  // practitioner it currently knows about, and any requests currently
  // awaiting the provider's manual approval) so a UI running on a
  // different origin can display the "provider's side of the story"
  // next to the learner's side.
  if (req.method === 'GET' && req.url.startsWith('/api/state')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        catalog,
        practitioners: Array.from(practitioners.values()),
        pendingRequests: pendingRequests.map((p) => ({
          id: p.id,
          action: p.action,
          courseId: p.courseId,
          courseName: p.courseName,
          learnerId: p.learnerId,
          learnerName: p.learnerName,
        })),
      })
    );
    return;
  }

  // The provider clicks "Approve" for a pending init/confirm request.
  // THIS is when the real answer (on_init / on_confirm) actually gets
  // built and sent back -- not automatically when the request first
  // arrived. That's the real two-way part of the demo.
  const approveMatch = req.url
    .split('?')[0]
    .match(/^\/api\/pending\/([a-zA-Z0-9-]+)\/approve$/);
  if (req.method === 'POST' && approveMatch) {
    const pendingId = approveMatch[1];
    const pendingIndex = pendingRequests.findIndex((p) => p.id === pendingId);

    if (pendingIndex === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Pending request not found' }));
      return;
    }

    const pending = pendingRequests[pendingIndex];
    pendingRequests.splice(pendingIndex, 1);
    dbDelete('pending_requests', 'id', pendingId);

    // buildResponse re-derives the participant from pending.message
    // itself, so the right practitioner's tier/status gets updated
    // here even though this handler doesn't otherwise know who they are.
    const callback = buildResponse(pending.action, pending.context, pending.message);
    console.log(`[course-bpp] APPROVED ${pending.action} for ${pending.learnerName} (id=${pendingId})`);
    sendCallback(callback);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'approved' }));
    return;
  }

  // The provider clicks "Reject" for a pending init/confirm request.
  // Sends back a REJECTED contract instead of ACTIVE/COMPLETED -- the
  // learner's app already knows how to show a rejection (it's the same
  // path as the automatic tier-blocked rejection), it just hasn't had a
  // manual way to trigger one until now.
  const rejectMatch = req.url
    .split('?')[0]
    .match(/^\/api\/pending\/([a-zA-Z0-9-]+)\/reject$/);
  if (req.method === 'POST' && rejectMatch) {
    const pendingId = rejectMatch[1];
    const pendingIndex = pendingRequests.findIndex((p) => p.id === pendingId);

    if (pendingIndex === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Pending request not found' }));
      return;
    }

    const pending = pendingRequests[pendingIndex];
    pendingRequests.splice(pendingIndex, 1);
    dbDelete('pending_requests', 'id', pendingId);

    const participant = extractParticipant(pending.message);
    const courseId = extractCourseId(pending.message);
    const context = {
      ...pending.context,
      action: 'on_' + pending.action,
      timestamp: new Date().toISOString(),
    };
    const callback = {
      context,
      message: { contract: buildContract('REJECTED', courseId, participant.id, participant.name) },
    };

    console.log(`[course-bpp] REJECTED ${pending.action} for ${pending.learnerName} (id=${pendingId})`);
    sendCallback(callback);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'rejected' }));
    return;
  }

  // The provider adds a brand new course to their catalog. No
  // approval needed for this one -- it takes effect immediately, and
  // the next time a learner searches, it can show up.
  if (req.method === 'POST' && req.url.startsWith('/api/add-course')) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const name = (parsed.name || '').trim();
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Course name is required' }));
        return;
      }

      const newCourse = {
        id: 'course-' + String(catalog.length + 1).padStart(3, '0'),
        name,
        unlocksTier: parsed.unlocksTier || 'Silver',
        duration: parsed.duration || '1 week',
      };
      catalog.push(newCourse);
      dbUpsert('courses', { id: newCourse.id, name: newCourse.name, unlocks_tier: newCourse.unlocksTier, duration: newCourse.duration }, 'id');
      console.log(`[course-bpp] provider added new course: ${newCourse.name} (${newCourse.id})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'added', course: newCourse }));
    });
    return;
  }

  // Lets the provider set/edit a practitioner's peer-support profile
  // from the dashboard -- this is the ONLY way this data gets set. It
  // never comes from the learner or the WhatsApp bot directly.
  const peerProfileMatch = req.url.match(/^\/api\/practitioners\/([^/?]+)\/peer-profile/);
  if (req.method === 'POST' && peerProfileMatch) {
    const practitionerId = decodeURIComponent(peerProfileMatch[1]);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const p = practitioners.get(practitionerId) || getPractitioner(practitionerId, parsed.name || practitionerId);
      if (parsed.tier) p.currentTier = parsed.tier;
      p.area = parsed.area || null;
      p.yearsExperience = parsed.yearsExperience != null ? Number(parsed.yearsExperience) : null;
      p.elpType = parsed.elpType || null;
      p.hubs = Array.isArray(parsed.hubs) ? parsed.hubs : [];
      p.certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];
      persistPractitioner(p);
      console.log(`[course-bpp] provider set peer profile for practitioner ${practitionerId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'updated', practitioner: p }));
    });
    return;
  }

  // Provider creates/edits a donor entry -- a donor is never a learner,
  // so there's nothing to "look up first" like practitioners -- this
  // always creates the record if it doesn't already exist.
  const donorMatch = req.url.match(/^\/api\/donors\/([^/?]+)/);
  if (req.method === 'POST' && donorMatch) {
    const donorId = decodeURIComponent(donorMatch[1]);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const d = donors.get(donorId) || { id: donorId };
      d.name = parsed.name || d.name || donorId;
      d.supportType = parsed.supportType || null;
      d.area = parsed.area || null;
      d.contactPhone = parsed.contactPhone || null;
      d.contactEmail = parsed.contactEmail || null;
      d.description = parsed.description || null;
      donors.set(donorId, d);
      persistDonor(d);
      console.log(`[course-bpp] provider set donor entry for ${donorId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'updated', donor: d }));
    });
    return;
  }

  // Provider creates/edits a community-space entry, same pattern as donors.
  const spaceMatch = req.url.match(/^\/api\/spaces\/([^/?]+)/);
  if (req.method === 'POST' && spaceMatch) {
    const spaceId = decodeURIComponent(spaceMatch[1]);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const s = spaces.get(spaceId) || { id: spaceId };
      s.name = parsed.name || s.name || spaceId;
      s.spaceType = parsed.spaceType || null;
      s.area = parsed.area || null;
      s.address = parsed.address || null;
      s.capacity = parsed.capacity || null;
      s.contactName = parsed.contactName || null;
      s.contactPhone = parsed.contactPhone || null;
      s.availability = parsed.availability || null;
      spaces.set(spaceId, s);
      persistSpace(s);
      console.log(`[course-bpp] provider set space entry for ${spaceId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'updated', space: s }));
    });
    return;
  }

  // onix-bpp calls a path like /api/webhook/select, /api/webhook/init,
  // /api/webhook/confirm -- the action name is the last part of the URL.
  const webhookMatch = req.url.match(/^\/api\/webhook\/([a-zA-Z_]+)$/);

  if (req.method !== 'POST' || !webhookMatch) {
    console.log(`[course-bpp] rejecting request -- path was "${req.url}"`);
    res.writeHead(404);
    res.end();
    return;
  }

  const actionFromUrl = webhookMatch[1];

  let body = '';
  req.on('data', (chunk) => (body += chunk));

  req.on('end', () => {
    let incoming;
    try {
      incoming = JSON.parse(body);
    } catch (err) {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    const action = actionFromUrl || (incoming.context && incoming.context.action);
    console.log(`\n========== [course-bpp] ACTION: ${action} ==========`);
    logPayload('RECEIVED (from Beckn, via onix-bpp)', incoming);

    // 1. Immediately ACK so the caller isn't left waiting. This is
    // just Beckn's required "I got your message" ACK -- not the real
    // answer yet.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { ack: { status: 'ACK' } } }));

    // 2a. "init" (enroll) requests first get checked for tier
    // eligibility -- a Gold-certifying course requires the learner
    // to already be at Silver, for example. Ineligible requests are
    // auto-rejected immediately (no human approval needed for a
    // straightforward eligibility check); eligible ones proceed to
    // the pending-approval queue below, same as "confirm".
    if (action === 'init') {
      const courseId = extractCourseId(incoming.message);
      const targetCourse = catalog.find((c) => c.id === courseId) || course;
      const participant = extractParticipant(incoming.message);
      const p = getPractitioner(participant.id, participant.name);

      if (!meetsPrerequisite(targetCourse, p.currentTier)) {
        console.log(
          `[course-bpp] AUTO-REJECTED init for "${targetCourse.name}" -- ` +
            `${p.name} is ${p.currentTier}, this course requires reaching ` +
            `a higher tier first`
        );
        const callback = {
          context: { ...incoming.context, action: 'on_init', timestamp: new Date().toISOString() },
          message: { contract: buildContract('REJECTED', targetCourse.id, p.id, p.name) },
        };
        sendCallback(callback);
        return;
      }
    }

    // 2b. "init" (enroll, once eligible) and "confirm" (mark complete)
    // are the meaningful moments where the provider is actually
    // agreeing to something -- so instead of auto-replying, we park
    // these and wait for the provider to click "Approve" in their
    // own panel.
    if (action === 'init' || action === 'confirm') {
      const courseId = extractCourseId(incoming.message);
      const targetCourse = catalog.find((c) => c.id === courseId) || course;
      const participant = extractParticipant(incoming.message);
      const pendingRow = {
        id: crypto.randomUUID(),
        action,
        context: incoming.context,
        message: incoming.message,
        courseId: targetCourse.id,
        courseName: targetCourse.name,
        learnerId: participant.id,
        learnerName: participant.name,
      };
      pendingRequests.push(pendingRow);
      dbUpsert(
        'pending_requests',
        {
          id: pendingRow.id,
          action: pendingRow.action,
          context: pendingRow.context,
          message: pendingRow.message,
          course_id: pendingRow.courseId,
          course_name: pendingRow.courseName,
          learner_id: pendingRow.learnerId,
          learner_name: pendingRow.learnerName,
        },
        'id'
      );
      console.log(
        `[course-bpp] ${action} for "${targetCourse.name}" (learner: ${participant.name}) is now PENDING PROVIDER APPROVAL`
      );
      return;
    }

    // 2c. Everything else (discover, select) is just "browsing" and
    // auto-responds immediately, same as before.
    const callback = buildResponse(action, incoming.context, incoming.message);
    if (callback) {
      sendCallback(callback);
    }
  });
});

// ---- Load everything from the database at startup ----
// If SUPABASE_URL isn't set, this just logs a warning and the server
// runs exactly as it always did -- in-memory only, wiped on restart.
async function loadStateFromDb() {
  if (!SUPABASE_URL) {
    console.log('[course-bpp] SUPABASE_URL not set -- running in-memory only, data will not persist across restarts');
    return;
  }

  const dbCourses = await dbSelect('courses');
  if (dbCourses.length > 0) {
    catalog.length = 0; // clear the 3 hardcoded seed courses, DB is the source of truth now
    dbCourses.forEach((c) => catalog.push({ id: c.id, name: c.name, unlocksTier: c.unlocks_tier, duration: c.duration }));
  } else {
    // First run ever -- seed the database with the original 3 demo courses.
    for (const c of catalog) {
      dbUpsert('courses', { id: c.id, name: c.name, unlocks_tier: c.unlocksTier, duration: c.duration }, 'id');
    }
  }

  const dbPractitioners = await dbSelect('practitioners');
  dbPractitioners.forEach((p) => {
    practitioners.set(p.id, {
      id: p.id,
      name: p.name,
      currentTier: p.current_tier,
      courseStatus: p.course_status,
      area: p.area,
      yearsExperience: p.years_experience,
      elpType: p.elp_type,
      hubs: p.hubs || [],
      certifications: p.certifications || [],
    });
  });

  const dbDonors = await dbSelect('donors');
  dbDonors.forEach((d) => {
    donors.set(d.id, {
      id: d.id,
      name: d.name,
      supportType: d.support_type,
      area: d.area,
      contactPhone: d.contact_phone,
      contactEmail: d.contact_email,
      description: d.description,
    });
  });

  const dbSpaces = await dbSelect('spaces');
  dbSpaces.forEach((s) => {
    spaces.set(s.id, {
      id: s.id,
      name: s.name,
      spaceType: s.space_type,
      area: s.area,
      address: s.address,
      capacity: s.capacity,
      contactName: s.contact_name,
      contactPhone: s.contact_phone,
      availability: s.availability,
    });
  });

  const dbPending = await dbSelect('pending_requests');
  dbPending.forEach((p) => {
    pendingRequests.push({
      id: p.id,
      action: p.action,
      context: p.context,
      message: p.message,
      courseId: p.course_id,
      courseName: p.course_name,
      learnerId: p.learner_id,
      learnerName: p.learner_name,
    });
  });

  console.log(
    `[course-bpp] loaded from database: ${catalog.length} courses, ${practitioners.size} practitioners, ${pendingRequests.length} pending requests, ${donors.size} donors, ${spaces.size} spaces`
  );
}

const PORT = process.env.PORT || 3002;
loadStateFromDb().then(() => {
  server.listen(PORT, () => {
    console.log(`course-bpp demo server running on port ${PORT}`);
  });
});
