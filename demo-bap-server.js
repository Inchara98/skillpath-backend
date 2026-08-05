// demo-bap/server.js
//
// This is a REAL buyer (BAP) app for our demo -- replaces the generic
// "sandbox-bap" mock. It has two jobs:
//
//   1. FRONTEND: serves a simple webpage with 4 buttons
//      (Discover / Select / Enroll / Confirm) so anyone can click
//      through the flow without needing Postman.
//
//   2. BACKEND: when a button is clicked, it sends the real Beckn
//      request out to onix-bap. Beckn doesn't reply instantly --
//      the real answer arrives moments later as a SEPARATE incoming
//      call (on_discover, on_select, on_init, on_confirm). This app
//      also receives those callbacks and remembers the latest state,
//      so the webpage can show what actually happened.
//
// The webpage polls this app's own /api/state endpoint once a second
// to pick up new results as they arrive.
//
// ---- CHANGE LOG: multi-learner + OTP auth ----
// State used to be one single global object (always "Naledi"). It's
// now a Map of learners keyed by learner id, so multiple real phone
// numbers each get their own independent tier/courses/log. A learner
// identifies themselves with `x-learner-token` header (returned by
// /api/auth/otp/verify -- see below). Requests with NO token (like
// the built-in demo page's own JS, which we haven't changed) fall
// back to a fixed "demo-guest" learner named Naledi, so the existing
// browser demo keeps working exactly as it did before.

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
      console.error(`[demo-bap] failed to load ${table}:`, resp.status, await resp.text());
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error(`[demo-bap] failed to load ${table}:`, err.message);
    return [];
  }
}

// Fire-and-forget by design -- persistence failures get logged but
// never block or break the actual request being served.
function dbUpsert(table, row, conflictColumn) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  })
    .then((resp) => {
      if (!resp.ok) resp.text().then((t) => console.error(`[demo-bap] failed to save to ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[demo-bap] failed to save to ${table}:`, err.message));
}

// Where onix-bap lives -- 'onix-bap' is a Docker container name, only
// resolvable when this server runs on the same Docker network (e.g.
// your laptop). Once deployed elsewhere (Render, etc.), this MUST be
// set via the ONIX_BAP_CALLER env var to wherever onix-bap is actually
// reachable from the internet (e.g. an ngrok tunnel to your laptop).
const ONIX_BAP_CALLER = process.env.ONIX_BAP_CALLER || 'http://onix-bap:8081/bap/caller';

// ---- Fixed network details for this small sandbox network ----
// (In a bigger network these would be discovered dynamically; here
// there's only one BPP, so we can point at it directly.)
const NETWORK_ID = 'beckn.one/testnet';
const BAP_ID = 'bap.example.com';
const BAP_URI = 'http://onix-bap:8081/bap/receiver';
const BPP_ID = 'bpp.example.com';
const BPP_URI = 'http://onix-bpp:8082/bpp/receiver';

// This is DIFFERENT from BPP_URI above -- BPP_URI is the Beckn protocol
// address (goes through onix-bap/onix-bpp), used for the actual Beckn
// discover/select/init/confirm flow. BPP_BASE_URL below is a plain
// direct HTTP address used ONLY for the handful of server-to-server
// calls that aren't part of the Beckn flow itself (e.g. approve/reject
// buttons, reading the provider's course catalog for tier lookups).
// Locally both servers run on the same machine so "localhost" works;
// once deployed separately (e.g. to Render), this MUST be set to
// course-bpp-server's real public URL via an environment variable.
const BPP_BASE_URL = process.env.BPP_BASE_URL || 'http://localhost:3002';

// ---- The NGO BPP -- a second provider in the network, alongside
// course-bpp. Same direct hand-off convention: NGO_BPP_CALLER points
// straight at ngo-bpp-server's own /api/webhook base.
const NGO_BPP_CALLER = process.env.NGO_BPP_CALLER || 'http://localhost:3003/api/webhook';
const NGO_BPP_ID = 'ngo.example.com';
const NGO_BPP_URI = 'http://onix-ngo:8083/bpp/receiver';

// ---- The Elevate BPP -- a third provider, this one generating
// personalized learning journeys via Claude rather than handling
// courses or donations.
const ELEVATE_BPP_CALLER = process.env.ELEVATE_BPP_CALLER || 'http://localhost:3004/api/webhook';
const ELEVATE_BPP_ID = 'elevate.example.com';
const ELEVATE_BPP_URI = 'http://onix-elevate:8084/bpp/receiver';

// Where whatsapp-bot-server.js is reachable -- used ONLY to relay an
// on_update push (NGO accepted / paid) into an actual WhatsApp message,
// since demo-bap itself has no way to send WhatsApp messages directly.
const WA_BOT_BASE_URL = process.env.WA_BOT_BASE_URL || 'http://localhost:4000';

// =====================================================================
// ---- OTP auth (demo-grade: fixed code, no expiry, no real SMS) ----
// =====================================================================
// A real production version would generate a random code, expire it
// after a few minutes, and send it through an SMS provider (Twilio,
// etc). For this prototype the code is always "123456" so it's easy
// to test end-to-end without wiring up SMS yet.
const DEMO_OTP = '123456';

// phone -> learnerId, so the same phone number always comes back to
// the same learner record instead of creating a new one every login.
const learnerIdByPhone = new Map();

// learnerId -> learner state (this replaces the old single `state` object)
const learners = new Map();

// transactionId -> learnerId, so an incoming on_* callback (which only
// carries a transactionId, not "who it's for") can be routed back to
// the right learner's state.
const transactionToLearner = new Map();

function createLearner(phone, name) {
  const id = crypto.randomUUID();
  const learner = {
    id,
    phone,
    name: name || 'Learner',
    // Starts with a real, unique transaction id immediately -- never
    // null -- so two learners can't ever collide on the same
    // transactionToLearner key if an action fires before their first
    // discover (shouldn't normally happen, but this makes it safe
    // even if it does).
    transactionId: crypto.randomUUID(),
    catalog: null,
    courseProgress: {},
    tier: 'Bronze',
    log: [],
  };
  learners.set(id, learner);
  transactionToLearner.set(learner.transactionId, learner.id);
  if (phone) learnerIdByPhone.set(phone, id);
  persistLearner(learner);
  return learner;
}

function persistLearner(learner) {
  dbUpsert(
    'learners',
    {
      id: learner.id,
      phone: learner.phone,
      name: learner.name,
      transaction_id: learner.transactionId,
      catalog: learner.catalog,
      peer_catalog: learner.peerCatalog,
      donor_catalog: learner.donorCatalog,
      space_catalog: learner.spaceCatalog,
      journey: learner.journey,
      course_progress: learner.courseProgress,
      tier: learner.tier,
      log: learner.log,
    },
    'id'
  );
}

// The demo page's own JS (unchanged) never sends a token -- everything
// it does happens as this one fixed guest learner, exactly like the
// single-user version used to behave.
const DEMO_GUEST_ID = 'demo-guest';
const demoGuest = {
  id: DEMO_GUEST_ID,
  phone: null,
  name: 'Naledi',
  transactionId: crypto.randomUUID(),
  catalog: null,
  courseProgress: {},
  tier: 'Bronze',
  log: [],
};
learners.set(DEMO_GUEST_ID, demoGuest);
transactionToLearner.set(demoGuest.transactionId, DEMO_GUEST_ID);

// Resolves which learner a request is for, based on the
// `x-learner-token` header. Falls back to the demo guest if missing
// or unrecognized, so nothing that used to work stops working.
function resolveLearner(req) {
  const token = req.headers['x-learner-token'];
  if (token && learners.has(token)) return learners.get(token);
  return learners.get(DEMO_GUEST_ID);
}

// Looks up (and lazily creates) the progress record for a course, for
// one specific learner.
function getCourseProgress(learner, courseId) {
  if (!learner.courseProgress[courseId]) {
    learner.courseProgress[courseId] = {
      status: 'not_started', // not_started -> enrolled -> completed
      blocked: false, // true if the last enroll attempt was auto-rejected (tier too low)
      blockedMessage: '',
    };
  }
  return learner.courseProgress[courseId];
}

// Pulls the course id a given on_init/on_confirm response is actually
// about, straight out of its own contract -- so we always know which
// course to update, without needing to separately remember "the
// currently selected course" (which is what caused the bug where
// switching courses could apply stale status to the wrong one).
function extractCourseIdFromContract(message) {
  try {
    return message.contract.commitments[0].descriptor.code;
  } catch (err) {
    return null;
  }
}

function addLog(learner, direction, action, payload) {
  learner.log.unshift({
    direction, // 'sent' or 'received'
    action,
    payload,
    time: new Date().toISOString(),
  });
  // keep the log from growing forever
  learner.log = learner.log.slice(0, 30);
}

function buildContext(learner, action) {
  return {
    networkId: NETWORK_ID,
    action,
    version: '2.0.0',
    bapId: BAP_ID,
    bapUri: BAP_URI,
    bppId: BPP_ID,
    bppUri: BPP_URI,
    transactionId: learner.transactionId,
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: 'PT30S',
  };
}

// Same shape as buildContext, but addressed to the NGO BPP instead of
// course-bpp -- this is what makes it a genuine second provider in the
// network rather than a special case bolted onto the course flow.
function buildNgoContext(learner, action) {
  return {
    networkId: NETWORK_ID,
    action,
    version: '2.0.0',
    bapId: BAP_ID,
    bapUri: BAP_URI,
    bppId: NGO_BPP_ID,
    bppUri: NGO_BPP_URI,
    transactionId: learner.transactionId,
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: 'PT30S',
  };
}

// Same shape again, addressed to the Elevate BPP -- a third, genuinely
// independent provider.
function buildElevateContext(learner, action) {
  return {
    networkId: NETWORK_ID,
    action,
    version: '2.0.0',
    bapId: BAP_ID,
    bapUri: BAP_URI,
    bppId: ELEVATE_BPP_ID,
    bppUri: ELEVATE_BPP_URI,
    transactionId: learner.transactionId,
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: 'PT30S',
  };
}

// Builds a minimal but real Beckn Contract object referencing the
// selected course -- required by the select/init/confirm schemas.
// Now takes the actual learner instead of a hardcoded participant, so
// course-bpp can tell different learners apart from the contract
// itself (that's the whole mechanism Beckn uses for identity here).
function buildContract(learner, courseId, statusCode) {
  return {
    id: 'contract-' + learner.id,
    participants: [
      {
        id: learner.id,
        descriptor: { name: learner.name, code: 'practitioner' },
      },
    ],
    commitments: [
      {
        id: 'commitment-' + courseId,
        descriptor: { name: courseId, code: courseId },
        status: { code: statusCode },
        resources: [
          {
            id: courseId,
            descriptor: { name: courseId },
            quantity: { unitQuantity: 1, unitCode: 'COURSE' },
          },
        ],
        offer: {
          id: 'offer-' + courseId,
          resourceIds: [courseId],
        },
      },
    ],
  };
}

// Send a Beckn action request out to onix-bap. This is "fire and
// forget" from our side -- the real answer comes back later as a
// separate incoming call to our own /api/bap-webhook/on_<action>.
async function triggerAction(learner, action, extra = {}) {
  if (action === 'discover') {
    learner.transactionId = crypto.randomUUID();
    // Clear old results while the new search is in flight, so the UI
    // can show a "searching..." state instead of stale results. Only
    // clear whichever one is actually being searched for.
    if (extra.category === 'peers') {
      learner.peerCatalog = null;
    } else if (extra.category === 'donors') {
      learner.donorCatalog = null;
    } else if (extra.category === 'spaces') {
      learner.spaceCatalog = null;
    } else {
      learner.catalog = null;
    }
  }
  // Every transaction this learner starts needs to be routable back to
  // them when the async on_* callback arrives later.
  transactionToLearner.set(learner.transactionId, learner.id);

  // The frontend always tells us exactly which course an
  // Enroll/Mark Complete click is for -- we use that directly on
  // every request rather than remembering a single "currently
  // selected course" globally (that older approach is what caused
  // status from one course to leak onto another when switching
  // between them quickly).
  const courseId = extra.courseId || (learner.catalog && learner.catalog[0] && learner.catalog[0].id);

  const context = buildContext(learner, action);
  let message = {};
  if (action === 'discover') {
    // Real Beckn schema requires message.intent to be present (even
    // empty). A search term goes in intent.textSearch. We also use
    // intent.category as a simple way to ask for something other than
    // courses -- e.g. category: "peers" asks course-bpp for its peer
    // directory instead of the training catalog.
    message = { intent: {} };
    if (extra.query) message.intent.textSearch = extra.query;
    if (extra.category) message.intent.category = extra.category;
  } else if (action === 'select') {
    // A fresh enroll attempt on this specific course -- clear any old
    // rejection message for it so it doesn't linger on a retry.
    if (courseId) {
      const progress = getCourseProgress(learner, courseId);
      progress.blocked = false;
      progress.blockedMessage = '';
    }
    message = { contract: buildContract(learner, courseId, 'DRAFT') };
  } else if (action === 'init') {
    message = { contract: buildContract(learner, courseId, 'ACTIVE') };
  } else if (action === 'confirm') {
    message = { contract: buildContract(learner, courseId, 'COMPLETED') };
  }

  const payload = { context, message };
  addLog(learner, 'sent', action, payload);
  persistLearner(learner);

  const url = `${ONIX_BAP_CALLER}/${action}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Starts a real Beckn transaction with the NGO BPP -- a genuinely
// separate provider from course-bpp, same protocol. `details` comes
// straight from whatsapp-bot: { description, amount, deadline, region }.
async function triggerNgoDonation(learner, details) {
  learner.transactionId = crypto.randomUUID();
  transactionToLearner.set(learner.transactionId, learner.id);

  const context = buildNgoContext(learner, 'init');
  const message = {
    participant: { id: learner.id, name: learner.name || 'Learner' },
    donationRequest: {
      description: details.description || '',
      amount: details.amount || '',
      deadline: details.deadline || '',
      region: details.region || '',
      crId: details.crId || '',
    },
  };

  const payload = { context, message };
  addLog(learner, 'sent', 'init', payload);
  persistLearner(learner);

  const url = `${NGO_BPP_CALLER}/init`;
  console.log(`[demo-bap] sending donation init to: ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`[demo-bap] donation init response status: ${res.status}`);
}

// Finalizes the transaction once the NGO BPP has acknowledged the
// request with an id (see handleCallback's on_init branch below). The
// business-meaningful status changes -- accepted, paid -- come later as
// separate on_update pushes, not through this confirm step.
async function confirmNgoDonation(learner) {
  const context = buildNgoContext(learner, 'confirm');
  const message = { requestId: learner.pendingNgoRequestId };
  const payload = { context, message };
  addLog(learner, 'sent', 'confirm', payload);
  persistLearner(learner);

  await fetch(`${NGO_BPP_CALLER}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// demo-bap has no way to send a WhatsApp message itself -- this hands
// that off to whatsapp-bot-server.js, which owns the actual Meta API
// connection. Used only to relay an on_update push into a real message.
async function notifyLearnerViaWhatsApp(phone, text) {
  await fetch(`${WA_BOT_BASE_URL}/api/internal/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message: text }),
  });
}

// Starts a real Beckn transaction with the Elevate BPP -- a third,
// independent provider, same protocol as courses/donations. `details`
// comes from whoever's calling (the PWA, eventually): { goal, timeframe,
// currentTier, assessment }.
// Render's free tier spins services down after ~15 min idle -- the very
// first request to a sleeping service sometimes gets a 502 from
// Render's own gateway while the container is still starting, before
// our code even runs. Retrying after a short wait (rather than failing
// immediately, which is what was happening before) fixes this -- by
// the second or third attempt, the service is almost always fully up.
async function fetchWithColdStartRetry(url, options, attempts = 3, delayMs = 6000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status !== 502 && res.status !== 503) return res;
      lastErr = new Error(`Got ${res.status} (attempt ${i + 1}/${attempts})`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      console.log(`[demo-bap] ${url} not ready yet, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

async function triggerJourneyRequest(learner, details) {
  learner.transactionId = crypto.randomUUID();
  transactionToLearner.set(learner.transactionId, learner.id);

  const context = buildElevateContext(learner, 'init');
  const message = {
    participant: { id: learner.id, name: learner.name || 'Learner' },
    journeyRequest: {
      goal: details.goal || '',
      timeframe: details.timeframe || '',
      currentTier: details.currentTier || '',
      assessment: details.assessment || '',
    },
  };

  const payload = { context, message };
  addLog(learner, 'sent', 'init', payload);
  persistLearner(learner);

  const url = `${ELEVATE_BPP_CALLER}/init`;
  console.log(`[demo-bap] sending journey init to: ${url}`);
  const res = await fetchWithColdStartRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`[demo-bap] journey init response status: ${res.status}`);
}

// Finalizes the transaction once the Elevate BPP has acknowledged the
// request with an id. The actual generated journey arrives later,
// separately, via on_update -- generating it via Claude takes real
// seconds, which is exactly why this needs the async pattern rather
// than a synchronous reply.
async function confirmJourneyRequest(learner) {
  const context = buildElevateContext(learner, 'confirm');
  const message = { requestId: learner.pendingJourneyRequestId };
  const payload = { context, message };
  addLog(learner, 'sent', 'confirm', payload);
  persistLearner(learner);

  await fetchWithColdStartRetry(`${ELEVATE_BPP_CALLER}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Relays an NGO status change into the SAME dashboard entry the
// Provider App already shows for this request (matched by the CR
// tracking id whatsapp-bot generated when the request was first raised)
// -- otherwise the dashboard would keep showing "new" forever even
// after the NGO has already accepted or paid.
async function updateDashboardRequestStatus(crId, label) {
  if (!crId) return;
  await fetch(`${WA_BOT_BASE_URL}/api/internal/update-request-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: crId, label }),
  });
}

// Handle an incoming on_* callback from onix-bap. Routed to the right
// learner via the transactionId embedded in the callback's own context.
function handleCallback(action, incoming) {
  const incomingTransactionId = incoming.context && incoming.context.transactionId;
  const message = incoming.message || {};

  let learnerId = transactionToLearner.get(incomingTransactionId);
  // Fall back to a direct participantId lookup for on_update specifically --
  // this is what keeps accept/paid notifications working even after a
  // restart wipes the in-memory transactionId->learner map (which was
  // never persisted, unlike the learners themselves). ngo-bpp already
  // knows the learner's real id and includes it directly, so there's no
  // need to depend on the ephemeral mapping surviving that long.
  if (!learnerId && action === 'on_update' && message.participantId) {
    learnerId = message.participantId;
  }
  const learner = learnerId && learners.get(learnerId);
  if (!learner) {
    console.error(`[demo-bap] received ${action} for unknown transaction ${incomingTransactionId} -- ignoring`);
    return;
  }

  addLog(learner, 'received', action, incoming);

  if (action === 'on_discover' && message.catalogs) {
    const firstCatalog = message.catalogs[0];
    if (firstCatalog && firstCatalog.id === 'catalog-peer-provider-001') {
      // This is a peer-directory response, not a course catalog.
      // course-bpp deliberately doesn't know phone numbers (it only
      // knows the learner id Beckn carries) -- we look each one up in
      // OUR OWN learners table to attach the phone number the WhatsApp
      // bot actually needs to message that peer.
      const resources = firstCatalog.resources || [];
      learner.peerCatalog = resources.map((r) => {
        const peerLearner = learners.get(r.id);
        return {
          id: r.id,
          name: (r.descriptor && r.descriptor.name) || r.id,
          phone: peerLearner ? peerLearner.phone : null,
          ...(r.peerProfile || {}),
        };
      });
    } else if (firstCatalog && firstCatalog.id === 'catalog-donor-provider-001') {
      // Donors aren't learners -- they carry their own contact info
      // directly on the resource, no phone lookup needed at all.
      const resources = firstCatalog.resources || [];
      learner.donorCatalog = resources.map((r) => ({
        id: r.id,
        name: (r.descriptor && r.descriptor.name) || r.id,
        ...(r.donorProfile || {}),
      }));
    } else if (firstCatalog && firstCatalog.id === 'catalog-space-provider-001') {
      const resources = firstCatalog.resources || [];
      learner.spaceCatalog = resources.map((r) => ({
        id: r.id,
        name: (r.descriptor && r.descriptor.name) || r.id,
        ...(r.spaceProfile || {}),
      }));
    } else {
      // Flatten every provider's resources into a simple list of courses
      // for our simple single-provider demo.
      const resources = message.catalogs.flatMap((cat) => cat.resources || []);
      learner.catalog = resources.map((r) => ({
        id: r.id,
        name: r.descriptor && r.descriptor.name,
      }));
    }
  }

  if (action === 'on_init') {
    const courseId = extractCourseIdFromContract(message);
    if (courseId) {
      const progress = getCourseProgress(learner, courseId);
      const commitment = message.contract && message.contract.commitments && message.contract.commitments[0];
      const statusCode = commitment && commitment.status && commitment.status.code;
      if (statusCode === 'REJECTED') {
        progress.status = 'not_started';
        progress.blocked = true;
        progress.blockedMessage = 'Enrollment not approved — you need to reach a higher tier before starting this program.';
      } else {
        progress.status = 'enrolled';
        progress.blocked = false;
        progress.blockedMessage = '';
      }
    } else if (message.donationRequest) {
      // This on_init came from the NGO BPP, not course-bpp -- finalize
      // the transaction with an automatic confirm. There's no manual
      // approval step here; the real decision (accept/decline, pay)
      // happens later on the NGO's own side and arrives as on_update.
      learner.pendingNgoRequestId = message.requestId;
      confirmNgoDonation(learner).catch((err) =>
        console.error('[demo-bap] failed to auto-confirm NGO donation request:', err.message)
      );
    } else if (message.journeyRequest) {
      // Same auto-confirm reasoning as donations -- the real result
      // (the generated journey) arrives later via on_update, since
      // generating it via Claude takes real seconds.
      learner.pendingJourneyRequestId = message.requestId;
      confirmJourneyRequest(learner).catch((err) =>
        console.error('[demo-bap] failed to auto-confirm journey request:', err.message)
      );
    }
  }

  if (action === 'on_update' && message.journey) {
    // The generated journey is ready -- store it on the learner record
    // so it's visible via /api/state, the same way catalog/peer/donor
    // data already is. No WhatsApp relay for this one (yet) -- the PWA
    // is expected to poll or eventually get its own push channel.
    learner.journey = message.journey;
    persistLearner(learner);
    console.log(`[demo-bap] journey ready for learner ${learner.id}`);
  }

  if (action === 'on_update' && message.requestId) {
    const statusCode = message.status && message.status.code;
    let text = null;
    let dashboardLabel = null;
    if (statusCode === 'ACCEPTED') {
      text = `📋 Good news — a support organisation has accepted your donation request${message.crId ? ` (${message.crId})` : ''} and will be in touch soon.`;
      dashboardLabel = 'NGO accepted';
    } else if (statusCode === 'PAID') {
      text = `🎉 The support organisation has completed the donation for your request${message.crId ? ` (${message.crId})` : ''}!`;
      dashboardLabel = 'NGO paid';
    }
    if (text && learner.phone) {
      notifyLearnerViaWhatsApp(learner.phone, text).catch((err) =>
        console.error('[demo-bap] failed to relay NGO update to WhatsApp:', err.message)
      );
    } else if (text && !learner.phone) {
      console.error(`[demo-bap] got an NGO update for learner ${learner.id} but they have no phone on file -- can't notify them`);
    }
    if (dashboardLabel && message.crId) {
      updateDashboardRequestStatus(message.crId, dashboardLabel).catch((err) =>
        console.error('[demo-bap] failed to relay NGO update to the dashboard:', err.message)
      );
    }
  }

  if (action === 'on_confirm') {
    const courseId = extractCourseIdFromContract(message);
    if (courseId) {
      const progress = getCourseProgress(learner, courseId);
      const commitment = message.contract && message.contract.commitments && message.contract.commitments[0];
      const statusCode = commitment && commitment.status && commitment.status.code;
      if (statusCode === 'REJECTED') {
        // Provider declined the completion request -- stay enrolled,
        // don't touch the tier, just show why it wasn't accepted.
        progress.status = 'enrolled';
        progress.blocked = true;
        progress.blockedMessage = 'Completion not approved yet — check with your training provider and try again.';
      } else {
        progress.status = 'completed';
        progress.blocked = false;
        progress.blockedMessage = '';
        // NOTE: the real Beckn OnConfirmAction schema only allows a
        // "contract" property (additionalProperties: false), so
        // course-bpp can't tell us which tier this unlocks over the
        // wire -- onix-bpp rejects it if it tries. Instead we ask the
        // provider directly (server-to-server, not part of the Beckn
        // flow) which tier THIS specific course actually certifies to,
        // rather than assuming it's always Silver.
        updateTierForCompletedCourse(learner, courseId);
      }
    }
  }

  persistLearner(learner);
}

// Looks up which tier a just-completed course actually certifies to,
// by asking the provider app directly (its own internal API, not a
// Beckn call) -- so completing the Gold-level course correctly grants
// Gold, not a hardcoded Silver.
async function updateTierForCompletedCourse(learner, courseId) {
  try {
    const res = await fetch(`${BPP_BASE_URL}/api/state`);
    const providerState = await res.json();
    const course = providerState.catalog.find((c) => c.id === courseId);
    if (course && course.unlocksTier) {
      learner.tier = course.unlocksTier;
      persistLearner(learner);
    }
  } catch (err) {
    console.error('[demo-bap] failed to determine unlocked tier:', err.message);
  }
}

// ---- The frontend page (plain HTML + vanilla JS, no build step) ----
// Unchanged from before -- it never sends x-learner-token, so it
// always operates as the fixed "demo-guest" learner (Naledi), same
// behavior as the original single-user version.

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SkillPath — Citizen Learning &amp; National Training Registry</title>
  <style>
    :root {
      --citizen-accent: #E8622C;
      --citizen-accent-dark: #C94F1F;
      --citizen-bg: #FFF8F2;
      --citizen-ink: #2B2320;
      --gov-navy: #10243E;
      --gov-navy-deep: #0A1A2E;
      --gov-gold: #C9A227;
      --gov-green: #1F7A4C;
      --gov-bg: #F4F6F8;
      --gov-ink: #1A2733;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, sans-serif;
      background: #E7E9EC;
      margin: 0;
      padding: 32px;
      color: var(--gov-ink);
    }
    .masthead { max-width: 1240px; margin: 0 auto 24px; }
    .masthead h1 { font-size: 20px; margin: 0 0 2px; color: var(--gov-navy-deep); }
    .masthead p { margin: 0; font-size: 13px; color: #667; }

    .stage {
      max-width: 1240px;
      margin: 0 auto;
      display: flex;
      gap: 32px;
      align-items: flex-start;
    }

    /* ---------- CITIZEN APP (phone-styled) ---------- */
    .phone-shell {
      width: 380px;
      flex-shrink: 0;
      background: var(--gov-navy-deep);
      border-radius: 40px;
      padding: 14px;
      box-shadow: 0 24px 48px rgba(10,26,46,0.35);
    }
    .phone-screen {
      background: var(--citizen-bg);
      border-radius: 28px;
      overflow: hidden;
      min-height: 640px;
      display: flex;
      flex-direction: column;
    }
    .status-bar {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; padding: 10px 20px 4px; color: var(--citizen-ink); font-weight: 600;
    }
    .app-bar {
      background: var(--citizen-accent);
      color: white;
      padding: 14px 20px 18px;
      border-radius: 0 0 20px 20px;
    }
    .app-bar .app-name { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
    .app-bar .app-tag { font-size: 12px; opacity: 0.9; margin-top: 2px; }
    .phone-body { padding: 16px 18px 20px; flex: 1; overflow-y: auto; }

    .tier-card {
      background: white; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06); display: flex; justify-content: space-between; align-items: center;
    }
    .tier-card .label { font-size: 12px; color: #8a7a6f; text-transform: uppercase; letter-spacing: 0.04em; }
    .tier { font-size: 20px; font-weight: 800; }
    .tier.Bronze { color: #a05a2c; }
    .tier.Silver { color: #8a8f98; }
    .tier.Gold { color: var(--gov-gold); }

    .success-banner {
      background: #E4F5EC; color: #1F7A4C; padding: 12px 14px; border-radius: 12px;
      margin-bottom: 12px; font-weight: 700; font-size: 13.5px; display: none;
    }

    .search-row { display: flex; gap: 8px; margin-bottom: 14px; }
    .search-row input {
      flex: 1; padding: 11px 14px; font-size: 14px; border: 1px solid #EBD9C9;
      border-radius: 24px; background: white; outline: none;
    }
    .search-row input:focus { border-color: var(--citizen-accent); }
    button.primary {
      background: var(--citizen-accent); color: white; border: none;
      padding: 11px 18px; border-radius: 24px; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    button.primary:hover { background: var(--citizen-accent-dark); }
    button.primary:disabled { opacity: 0.5; cursor: default; }

    .course-card {
      background: white; border-radius: 14px; padding: 14px 16px; margin-bottom: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .course-card h3 { margin: 0 0 8px; font-size: 14.5px; font-weight: 700; color: var(--citizen-ink); }
    .course-card .full-btn { width: 100%; }
    .badge { display: inline-block; font-size: 11px; padding: 3px 9px; border-radius: 20px; margin-left: 6px; font-weight: 700; }
    .badge.enrolled { background: #FFF0E4; color: var(--citizen-accent-dark); }
    .badge.completed { background: #E4F5EC; color: var(--gov-green); }
    .waiting-note { font-size: 12.5px; color: #A6763F; background: #FFF3E4; padding: 8px 10px; border-radius: 10px; }
    .blocked-note { font-size: 12.5px; color: #B3261E; background: #FDECEA; padding: 8px 10px; border-radius: 10px; margin-bottom: 8px; }
    .empty-note { font-size: 13px; color: #9a8f86; padding: 8px 2px; }

    details { margin-top: 16px; }
    summary { cursor: pointer; color: #a6957f; font-size: 11.5px; }
    pre { background: #1A1512; color: #8fd19e; padding: 10px; border-radius: 8px; overflow-x: auto; font-size: 11px; max-height: 220px; overflow-y: auto; }
    .log-entry { margin-bottom: 10px; }
    .log-entry .meta { font-size: 11px; color: #a6957f; margin-bottom: 3px; }

    /* ---------- GOVERNMENT AUTHORITY PORTAL ---------- */
    .gov-portal { flex: 1; min-width: 0; }
    .gov-header {
      background: var(--gov-navy);
      color: white;
      border-radius: 12px 12px 0 0;
      padding: 18px 24px;
      display: flex; align-items: center; gap: 14px;
    }
    .seal {
      width: 40px; height: 40px; border-radius: 50%;
      border: 2px solid var(--gov-gold);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: var(--gov-gold); flex-shrink: 0;
    }
    .gov-header .name { font-size: 17px; font-weight: 800; letter-spacing: 0.01em; }
    .gov-header .sub { font-size: 12px; color: #B9C4D0; margin-top: 1px; }

    .gov-body {
      background: white;
      border-radius: 0 0 12px 12px;
      padding: 4px 0 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .gov-section {
      padding: 18px 24px;
      border-bottom: 1px solid #E7EAEE;
    }
    .gov-section:last-child { border-bottom: none; }
    .gov-section h2 {
      font-size: 13px; margin: 0 0 12px; color: var(--gov-navy);
      text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800;
    }
    .registry-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid #F0F2F5; font-size: 14px;
    }
    .registry-row:last-child { border-bottom: none; }
    .tier-tag {
      font-size: 11px; padding: 3px 9px; border-radius: 4px; background: #EEF1F5; color: var(--gov-navy);
      font-weight: 700; border: 1px solid #DDE3EA;
    }
    .application-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; border: 1px solid #E7EAEE; border-radius: 8px; margin-bottom: 8px;
      background: #FAFBFC;
    }
    .application-row .desc { font-size: 13.5px; }
    .application-row .desc .kind { display: block; font-size: 11px; color: #8a94a0; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
    button.approve-btn {
      background: var(--gov-green); color: white; border: none;
      padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer;
    }
    button.approve-btn:hover { background: #175f3b; }
    .none-pending { font-size: 13.5px; color: #8a94a0; padding: 4px 0; }

    .gov-form-row { display: flex; gap: 10px; margin-bottom: 10px; }
    .gov-form-row input, .gov-form-row select {
      padding: 10px 12px; font-size: 13.5px; border: 1px solid #D6DBE1; border-radius: 6px; background: #FAFBFC;
    }
    .gov-form-row input { flex: 1; }
    button.register-btn {
      background: var(--gov-navy); color: white; border: none;
      padding: 10px 18px; border-radius: 6px; font-size: 13.5px; font-weight: 700; cursor: pointer;
    }
    button.register-btn:hover { background: var(--gov-navy-deep); }

    .record-line { font-size: 13.5px; padding: 3px 0; color: var(--gov-ink); }
    .record-line b { color: var(--gov-navy); }
    .record-block { padding: 10px 0; border-bottom: 1px solid #F0F2F5; }
    .record-block:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="masthead">
    <h1>SkillPath — National Skilling &amp; Certification Demo</h1>
    <p>Left: the citizen-facing mobile app. Right: the Government Training Authority's own portal — two independent systems, transacting live via Beckn.</p>
  </div>

  <div class="stage">

    <!-- CITIZEN APP: styled like a consumer mobile app -->
    <div class="phone-shell">
      <div class="phone-screen">
        <div class="status-bar"><span>9:41</span><span>●●●●</span></div>
        <div class="app-bar">
          <div class="app-name">SkillPath</div>
          <div class="app-tag">Naledi's learning account</div>
        </div>
        <div class="phone-body">

          <div class="tier-card">
            <div>
              <div class="label">Current Tier</div>
              <div id="tier" class="tier Bronze">Bronze</div>
            </div>
          </div>

          <div id="successBanner" class="success-banner">🎉 You've been upgraded to Silver tier!</div>

          <div class="search-row">
            <input id="searchInput" type="text" placeholder="Filter by name (e.g. 'first aid')..." onkeydown="if(event.key==='Enter') searchCourses()" />
            <button class="primary" onclick="searchCourses()">Go</button>
          </div>

          <div id="courseList"><div class="empty-note">Loading available training programs…</div></div>

          <details>
            <summary>Technical log (verification / debugging)</summary>
            <div id="log"></div>
          </details>
        </div>
      </div>
    </div>

    <!-- GOVERNMENT AUTHORITY PORTAL: styled like an official back-office system -->
    <div class="gov-portal">
      <div class="gov-header">
        <div class="seal">✓</div>
        <div>
          <div class="name">National Skilling Authority</div>
          <div class="sub">Provider Portal — Training Registry &amp; Applications</div>
        </div>
      </div>

      <div class="gov-body">
        <div class="gov-section">
          <h2>Applications Awaiting Approval</h2>
          <div id="providerPending">Loading…</div>
        </div>

        <div class="gov-section">
          <h2>Registered Training Programs</h2>
          <div id="providerCatalog">Loading…</div>
        </div>

        <div class="gov-section">
          <h2>Register a New Training Program</h2>
          <div class="gov-form-row">
            <input id="newCourseName" type="text" placeholder="Program name" />
          </div>
          <div class="gov-form-row">
            <select id="newCourseTier">
              <option value="Silver">Certifies to Silver</option>
              <option value="Gold">Certifies to Gold</option>
            </select>
            <input id="newCourseDuration" type="text" placeholder="Duration (e.g. 2 weeks)" />
          </div>
          <button class="register-btn" onclick="addCourse()">Register Program</button>
        </div>

        <div class="gov-section">
          <h2>Citizen Records</h2>
          <div id="providerPractitioner">Loading…</div>
        </div>
      </div>
    </div>

  </div>

  <script>
    // Internally, "Enroll" and "Mark as Complete" trigger the real
    // Beckn select/init/confirm actions behind the scenes -- the
    // practitioner never sees those protocol names, just a normal
    // course enrollment flow.
    //
    // This page never sends x-learner-token, so every action here
    // operates as the fixed "demo-guest" learner (Naledi) on the
    // server -- unchanged from the original single-user behavior.

    async function callAction(action, extra) {
      await fetch('/api/trigger/' + action, {
        method: 'POST',
        headers: extra ? { 'Content-Type': 'application/json' } : undefined,
        body: extra ? JSON.stringify(extra) : undefined,
      });
    }

    // Tracks, per course, whether we're still waiting on a reply --
    // this is purely an optimistic client-side hint shown right after
    // a click, cleared as soon as the real server state (fetched via
    // refresh) catches up. Keying this by courseId is what keeps each
    // course card fully independent of the others.
    let waitingCourses = {}; // courseId -> 'enrolled' | 'completed'

    async function enroll(courseId) {
      // Enrolling is really "select" (pick the course) followed by
      // "init" (start the enrollment) -- done back-to-back so it
      // feels like one click to the user. The provider must now
      // manually approve "init" before status actually changes.
      waitingCourses[courseId] = 'enrolled';
      await callAction('select', { courseId });
      await new Promise(r => setTimeout(r, 600));
      await callAction('init', { courseId });
      setTimeout(refresh, 800);
    }

    async function markComplete(courseId) {
      // Marking complete triggers "confirm" -- the provider must
      // manually approve this too before the tier actually upgrades.
      waitingCourses[courseId] = 'completed';
      await callAction('confirm', { courseId });
      setTimeout(refresh, 800);
    }

    // Sends the learner's search text to the provider (via discover)
    // and waits for it to filter its catalog and reply.
    async function searchCourses() {
      const query = document.getElementById('searchInput').value.trim();
      document.getElementById('courseList').innerHTML =
        '<div class="empty-note">Searching…</div>';
      await fetch('/api/trigger/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      setTimeout(refresh, 600);
    }

    function renderCourses(catalog, courseProgress, searched) {
      const el = document.getElementById('courseList');
      if (!catalog) {
        if (searched) {
          el.innerHTML = '<div class="empty-note">Searching…</div>';
        }
        return;
      }
      if (catalog.length === 0) {
        el.innerHTML = '<div class="empty-note">No programs matched your search. Try a different term.</div>';
        return;
      }

      el.innerHTML = catalog.map(c => {
        // Each course's own real status, independent of every other
        // course -- this is what fixes status incorrectly carrying
        // over between courses.
        const progress = (courseProgress && courseProgress[c.id]) || {
          status: 'not_started',
          blocked: false,
          blockedMessage: '',
        };

        // Once the real server status for this course catches up
        // (enrolled, completed, or rejected), the optimistic "waiting"
        // flag for it is no longer needed.
        if (
          waitingCourses[c.id] === 'enrolled' &&
          (progress.status === 'enrolled' || progress.blocked)
        ) {
          delete waitingCourses[c.id];
        }
        if (waitingCourses[c.id] === 'completed' && progress.status === 'completed') {
          delete waitingCourses[c.id];
        }

        let badge = '';
        let action = '';
        let notice = '';

        if (progress.status === 'completed') {
          badge = '<span class="badge completed">Completed</span>';
        } else if (progress.status === 'enrolled') {
          if (waitingCourses[c.id] === 'completed') {
            badge = '<span class="badge enrolled">Enrolled</span>';
            action = '<div class="waiting-note">⏳ Completion request sent — awaiting authority approval…</div>';
          } else {
            badge = '<span class="badge enrolled">Enrolled</span>';
            action = '<button class="primary full-btn" onclick="markComplete(\\'' + c.id + '\\')">Mark as Complete</button>';
          }
        } else if (waitingCourses[c.id] === 'enrolled') {
          action = '<div class="waiting-note">⏳ Enrollment request sent — awaiting authority approval…</div>';
        } else if (progress.blocked) {
          notice = '<div class="blocked-note">🚫 ' + progress.blockedMessage + '</div>';
          action = '<button class="primary full-btn" onclick="enroll(\\'' + c.id + '\\')">Enroll</button>';
        } else {
          action = '<button class="primary full-btn" onclick="enroll(\\'' + c.id + '\\')">Enroll</button>';
        }

        return '<div class="course-card">' +
          '<h3>' + c.name + badge + '</h3>' +
          notice +
          '<div>' + action + '</div>' +
          '</div>';
      }).join('');
    }

    function renderLog(log) {
      const el = document.getElementById('log');
      el.innerHTML = log.map(entry =>
        '<div class="log-entry">' +
        '<div class="meta ' + entry.direction + '">' + entry.time + ' — ' + entry.direction.toUpperCase() + ' — ' + entry.action + '</div>' +
        '<pre>' + JSON.stringify(entry.payload, null, 2) + '</pre>' +
        '</div>'
      ).join('');
    }

    // Renders the PROVIDER's own view -- fetched directly from
    // course-bpp's own /api/state endpoint (a separate app, a
    // separate port, no shared database). This is what proves the
    // two panels on screen are genuinely two independent apps.
    //
    // course-bpp now tracks MULTIPLE practitioners (one per real
    // learner), so this renders all of them, not just one.
    function renderProviderPanel(providerState) {
      const catalogEl = document.getElementById('providerCatalog');
      catalogEl.innerHTML = providerState.catalog.map(c =>
        '<div class="registry-row">' +
          '<span>' + c.name + '</span>' +
          '<span class="tier-tag">CERTIFIES ' + c.unlocksTier.toUpperCase() + '</span>' +
        '</div>'
      ).join('');

      const pendingEl = document.getElementById('providerPending');
      const pending = providerState.pendingRequests || [];
      if (pending.length === 0) {
        pendingEl.innerHTML = '<div class="none-pending">No applications waiting on review.</div>';
      } else {
        pendingEl.innerHTML = pending.map(p => {
          const kind = p.action === 'init' ? 'Enrollment Application' : 'Completion Certification Request';
          return '<div class="application-row">' +
            '<div class="desc"><span class="kind">' + kind + ' — ' + (p.learnerName || 'Unknown') + '</span>' + p.courseName + '</div>' +
            '<button class="approve-btn" onclick="approveRequest(\\'' + p.id + '\\')">Approve</button>' +
          '</div>';
        }).join('');
      }

      const practitioners = providerState.practitioners || [];
      document.getElementById('providerPractitioner').innerHTML = practitioners.map(p =>
        '<div class="record-block">' +
          '<div class="record-line">Name: <b>' + p.name + '</b></div>' +
          '<div class="record-line">Status on record: <b>' + p.courseStatus + '</b></div>' +
          '<div class="record-line">Certified tier: <b>' + p.currentTier + '</b></div>' +
        '</div>'
      ).join('');
    }

    // Provider clicks "Approve" on a pending enrollment/completion
    // request -- THIS is what actually triggers on_init/on_confirm
    // being sent back to the learner's app.
    async function approveRequest(id) {
      await fetch('http://localhost:3002/api/pending/' + id + '/approve', {
        method: 'POST',
      });
      setTimeout(refresh, 500);
    }

    // Provider adds a brand new course to their own catalog -- takes
    // effect immediately, and the learner can then search and find it.
    async function addCourse() {
      const name = document.getElementById('newCourseName').value.trim();
      const unlocksTier = document.getElementById('newCourseTier').value;
      const duration = document.getElementById('newCourseDuration').value.trim() || '1 week';
      if (!name) return;

      await fetch('http://localhost:3002/api/add-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unlocksTier, duration }),
      });

      document.getElementById('newCourseName').value = '';
      document.getElementById('newCourseDuration').value = '';
      setTimeout(refresh, 500);
    }

    async function refreshProviderPanel() {
      try {
        // Fetched directly from the provider app's own port (3002) --
        // not proxied through this app -- to make clear it's a
        // separate system being queried live.
        const res = await fetch('http://localhost:3002/api/state');
        const providerState = await res.json();
        renderProviderPanel(providerState);
      } catch (err) {
        document.getElementById('providerCatalog').innerHTML =
          '<div class="none-pending">Could not reach the authority portal.</div>';
      }
    }

    async function refresh() {
      const res = await fetch('/api/state');
      const state = await res.json();

      document.getElementById('tier').textContent = state.tier;
      document.getElementById('tier').className = 'tier ' + state.tier;
      document.getElementById('successBanner').style.display =
        state.tier === 'Silver' ? 'block' : 'none';

      renderCourses(state.catalog, state.courseProgress);
      renderLog(state.log);
      await refreshProviderPanel();
    }

    refresh();
    // Auto-load the full list of training programs once, right when
    // the page opens -- so the citizen can browse everything on
    // offer before typing anything. The search box then just narrows
    // this list down; it's not the only way to find a program.
    searchCourses();
    setInterval(refresh, 1500);
  </script>
</body>
</html>`;

// ---- The actual server ----

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0].replace(/\/$/, '') || '/';

  // Log every incoming request -- demo-bap didn't do this before, which
  // made it hard to tell "request never arrived" apart from "request
  // arrived but silently failed". course-bpp and ngo-bpp both already
  // log this; demo-bap should too.
  console.log(`[demo-bap] incoming request: ${req.method} ${req.url}`);

  // Open up CORS on every response, so a Flutter Web app (or anything
  // else) on a different origin can call these endpoints directly.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-learner-token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // A minimal privacy policy page -- needed to satisfy Meta's app
  // "Publish" requirement for the WhatsApp bot. This is a genuine,
  // if brief, description of what this prototype actually does with
  // data -- not filler text.
  if (req.method === 'GET' && path === '/privacy-policy') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Bana Pele -- Privacy Policy</title></head>
<body style="font-family: sans-serif; max-width: 640px; margin: 40px auto; line-height: 1.5;">
  <h1>Privacy Policy -- Bana Pele Enrollment Prototype</h1>
  <p>This is a prototype application for testing training-program enrollment
  via WhatsApp and a companion mobile app. It is not yet a production
  service.</p>
  <h2>What we collect</h2>
  <p>Your name and phone number, submitted when you use the app or message
  our WhatsApp bot, along with your enrollment and completion status for
  training programs.</p>
  <h2>How it's used</h2>
  <p>Solely to operate the enrollment flow -- letting you discover training
  programs, enroll, and track completion/certification status.</p>
  <h2>Storage</h2>
  <p>Data is currently stored only in server memory for testing purposes and
  is not persisted to a permanent database.</p>
  <h2>Contact</h2>
  <p>This is a prototype; for questions, contact the development team
  directly.</p>
</body>
</html>`);
    return;
  }

  // Serve the frontend page.
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
    return;
  }

  // Docker healthcheck.
  if (req.method === 'GET' && path === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // ---- OTP auth ----

  if (req.method === 'POST' && path === '/api/auth/otp/request') {
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
      const phone = (parsed.phone || '').trim();
      if (!phone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'phone is required' }));
        return;
      }
      // Demo only: OTP is always DEMO_OTP, nothing is actually sent.
      console.log(`[demo-bap] OTP requested for ${phone} (demo code: ${DEMO_OTP})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true }));
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/auth/otp/verify') {
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
      const phone = (parsed.phone || '').trim();
      const otp = (parsed.otp || '').trim();
      const name = (parsed.name || '').trim();

      if (otp !== DEMO_OTP) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid otp' }));
        return;
      }
      if (!phone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'phone is required' }));
        return;
      }

      let learnerId = learnerIdByPhone.get(phone);
      let learner = learnerId && learners.get(learnerId);
      if (!learner) {
        learner = createLearner(phone, name || undefined);
      } else if (name && learner.name !== name) {
        learner.name = name;
      }

      console.log(`[demo-bap] OTP verified for ${phone} -> learner ${learner.id} (${learner.name})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // The token IS the learner id in this demo -- fine for a
      // prototype, but a real version should issue a signed JWT
      // instead of a bare id a client could guess or forge.
      res.end(JSON.stringify({ token: learner.id, learnerId: learner.id, name: learner.name }));
    });
    return;
  }

  // Frontend polls this to get the latest state, for whichever learner
  // the request's x-learner-token identifies.
  if (req.method === 'GET' && path === '/api/state') {
    const learner = resolveLearner(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      transactionId: learner.transactionId,
      catalog: learner.catalog,
      peerCatalog: learner.peerCatalog,
      donorCatalog: learner.donorCatalog,
      spaceCatalog: learner.spaceCatalog,
      journey: learner.journey,
      courseProgress: learner.courseProgress,
      tier: learner.tier,
      log: learner.log,
    }));
    return;
  }

  // Frontend button clicks land here. Some triggers (like a search)
  // send a small JSON body, e.g. { "query": "first aid" }.
  const triggerMatch = path.match(/^\/api\/trigger\/([a-zA-Z_]+)$/);
  // Dedicated route for kicking off a real Beckn transaction with the
  // NGO BPP -- kept separate from the generic /api/trigger/:action
  // route above since the target BPP and message shape are both
  // different (donationRequest, not a course contract).
  // Dedicated route for kicking off a real Beckn transaction with the
  // Elevate BPP -- same reasoning as the donation-request route above:
  // different target BPP, different message shape (journeyRequest).
  if (req.method === 'POST' && path === '/api/trigger/journey-request') {
    const learner = resolveLearner(req);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let extra = {};
      try {
        extra = body ? JSON.parse(body) : {};
      } catch (err) {
        // Ignore malformed/empty body.
      }
      triggerJourneyRequest(learner, extra)
        .then(() => {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent' }));
        })
        .catch((err) => {
          console.error('[demo-bap] failed to trigger journey request:', err.message, '| cause:', err.cause);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/trigger/donation-request') {
    const learner = resolveLearner(req);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let extra = {};
      try {
        extra = body ? JSON.parse(body) : {};
      } catch (err) {
        // Ignore malformed/empty body.
      }
      triggerNgoDonation(learner, extra)
        .then(() => {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent' }));
        })
        .catch((err) => {
          console.error('[demo-bap] failed to trigger NGO donation request:', err.message, '| cause:', err.cause);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (req.method === 'POST' && triggerMatch) {
    const action = triggerMatch[1];
    const learner = resolveLearner(req);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let extra = {};
      try {
        extra = body ? JSON.parse(body) : {};
      } catch (err) {
        // Ignore malformed/empty body -- just proceed with no extra data.
      }
      triggerAction(learner, action, extra)
        .then(() => {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent' }));
        })
        .catch((err) => {
          console.error('[demo-bap] failed to trigger action:', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  // onix-bap delivers on_* callbacks here. These are routed to the
  // right learner via the transactionId inside the payload itself,
  // not via any header -- onix-bap doesn't know about learner tokens.
  const webhookMatch = path.match(/^\/api\/bap-webhook\/(on_[a-zA-Z_]+)$/);
  if (req.method === 'POST' && webhookMatch) {
    const action = webhookMatch[1];
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
      console.log(`[demo-bap] received callback: ${action}`);
      handleCallback(action, incoming);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { ack: { status: 'ACK' } } }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ---- Load everything from the database at startup ----
async function loadStateFromDb() {
  if (!SUPABASE_URL) {
    console.log('[demo-bap] SUPABASE_URL not set -- running in-memory only, data will not persist across restarts');
    return;
  }

  const dbLearners = await dbSelect('learners');
  dbLearners.forEach((row) => {
    const learner = {
      id: row.id,
      phone: row.phone,
      name: row.name,
      transactionId: row.transaction_id,
      catalog: row.catalog,
      peerCatalog: row.peer_catalog,
      donorCatalog: row.donor_catalog,
      spaceCatalog: row.space_catalog,
      journey: row.journey,
      courseProgress: row.course_progress || {},
      tier: row.tier || 'Bronze',
      log: row.log || [],
    };
    learners.set(learner.id, learner);
    if (learner.transactionId) transactionToLearner.set(learner.transactionId, learner.id);
    if (learner.phone) learnerIdByPhone.set(learner.phone, learner.id);
  });

  // Make sure the fixed demo-guest record is captured in the database
  // going forward, whether this is the very first run or not (harmless
  // no-op upsert if it was already loaded above with the same data).
  persistLearner(learners.get(DEMO_GUEST_ID));

  console.log(`[demo-bap] loaded from database: ${learners.size} learner(s)`);
}

// Render (and most cloud hosts) assign their own port and expect the app
// to listen on it via the PORT env var -- 3001 is only used as a fallback
// for running this locally on your own machine.
const PORT = process.env.PORT || 3001;
loadStateFromDb().then(() => {
  server.listen(PORT, () => {
    console.log(`demo-bap server running on port ${PORT}`);
  });
});
