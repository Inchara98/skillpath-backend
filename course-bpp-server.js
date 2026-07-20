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

function getPractitioner(id, name) {
  if (!id) id = 'naledi-001'; // defensive fallback, shouldn't normally happen
  if (!practitioners.has(id)) {
    practitioners.set(id, {
      id,
      name: name || id,
      currentTier: 'Bronze',
      courseStatus: 'not_started', // not_started -> enrolled -> completed
    });
  }
  const p = practitioners.get(id);
  if (name && p.name !== name) p.name = name; // keep the name fresh if it changes
  return p;
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
  const bppCallerUrl = `http://onix-bpp:8082/bpp/caller/${callback.context.action}`;
  fetch(bppCallerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback),
  })
    .then(() => {
      console.log(
        `[course-bpp] handed off ${callback.context.action} to onix-bpp caller -- OK`
      );
    })
    .catch((err) => {
      console.error('[course-bpp] failed to hand off callback:', err.message);
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
    // Buyer is searching -- the search term (if any) arrives in
    // message.intent.textSearch (a plain string per the real Intent
    // schema). We filter our catalog down to courses whose name
    // matches (case-insensitive, partial match). An empty/missing
    // search term returns the full catalog.
    const intent = (incomingMessage && incomingMessage.intent) || {};
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
      console.log(`[course-bpp] provider added new course: ${newCourse.name} (${newCourse.id})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'added', course: newCourse }));
    });
    return;
  }

  // Only look at the path itself, ignore any query string (?foo=bar)
  // or trailing slash, since onix-bpp may attach one.
  const path = req.url.split('?')[0].replace(/\/$/, '');

  // onix-bpp calls a path like /api/webhook/select, /api/webhook/init,
  // /api/webhook/confirm -- the action name is the last part of the URL.
  const webhookMatch = path.match(/^\/api\/webhook\/([a-zA-Z_]+)$/);

  if (req.method !== 'POST' || !webhookMatch) {
    console.log(`[course-bpp] rejecting request -- path was "${path}"`);
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
      pendingRequests.push({
        id: crypto.randomUUID(),
        action,
        context: incoming.context,
        message: incoming.message,
        courseId: targetCourse.id,
        courseName: targetCourse.name,
        learnerId: participant.id,
        learnerName: participant.name,
      });
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

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`course-bpp demo server running on port ${PORT}`);
});
