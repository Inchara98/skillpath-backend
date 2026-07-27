// ngo-bpp-server.js
//
// This is the NGO side of the network -- a second BPP (seller/provider
// role in Beckn terms), alongside course-bpp. Same protocol, different
// domain: instead of courses, this BPP handles donation requests.
//
// demo-bap sends `init` then `confirm` here (a real Beckn transaction --
// same 2-step pattern as enrolling in a course). Later, whenever the NGO
// staff take an action in the teammate's UI (accept a request, mark it
// paid), THIS service pushes an unsolicited `on_update` callback back to
// demo-bap -- that's the standard Beckn action for a provider notifying
// the buyer side of a status change after the transaction is already
// confirmed. demo-bap then relays that to the learner via WhatsApp.
//
// Like course-bpp, every action gets an immediate ACK, then the real
// answer follows separately via callback -- never a synchronous reply.

const http = require('http');
const crypto = require('crypto');

// ---- Database (Supabase Postgres, via REST -- no npm packages needed) ----
// Same pattern as course-bpp/demo-bap. Optional: without these set,
// requests still work, just don't survive a restart.
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
      console.error(`[ngo-bpp] failed to load ${table}:`, resp.status, await resp.text());
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error(`[ngo-bpp] failed to load ${table}:`, err.message);
    return [];
  }
}

function dbUpsert(table, row, conflictColumn) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  })
    .then((resp) => {
      if (!resp.ok) resp.text().then((t) => console.error(`[ngo-bpp] failed to save to ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[ngo-bpp] failed to save to ${table}:`, err.message));
}

// ---- In-memory store, backed by Supabase table `ngo_requests` ----
// id -> { id, participantId, participantName, description, amount,
//         deadline, region, status, context, createdAt }
// `context` is the original Beckn context from the `init` call (carries
// transactionId, bapId, etc.) -- we hang onto it so later on_update
// callbacks (triggered by NGO staff actions, not by any live incoming
// request) still carry a valid, matching context.
const requests = new Map();

function persistRequest(r) {
  dbUpsert(
    'ngo_requests',
    {
      id: r.id,
      participant_id: r.participantId,
      participant_name: r.participantName,
      description: r.description,
      amount: r.amount,
      deadline: r.deadline,
      region: r.region,
      cr_id: r.crId,
      status: r.status,
      context: r.context,
      created_at: r.createdAt,
    },
    'id'
  );
}

async function loadFromDatabase() {
  const rows = await dbSelect('ngo_requests');
  rows.forEach((row) => {
    requests.set(row.id, {
      id: row.id,
      participantId: row.participant_id,
      participantName: row.participant_name,
      description: row.description,
      amount: row.amount,
      deadline: row.deadline,
      region: row.region,
      crId: row.cr_id,
      status: row.status,
      context: row.context,
      createdAt: row.created_at,
    });
  });
  console.log(`[ngo-bpp] loaded from database: ${requests.size} donation requests`);
}

// ---- Sending callbacks back to demo-bap ----
// Same direct hand-off pattern course-bpp uses: no separate gateway
// process actually runs in this demo -- ONIX_NGO_CALLER is set directly
// to demo-bap's own callback base (e.g.
// https://skillpath-demo-bap.onrender.com/api/bap-webhook), and we just
// append the action name, same convention as course-bpp/ONIX_BPP_CALLER.
function sendCallback(callback) {
  console.log(`[ngo-bpp] SENDING BACK (${callback.context.action}):`, JSON.stringify(callback));
  const base = process.env.ONIX_NGO_CALLER || 'http://localhost:3001/api/bap-webhook';
  const url = `${base}/${callback.context.action}`;
  console.log(`[ngo-bpp] attempting hand-off to: ${url}`);
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback),
  })
    .then((res) => console.log(`[ngo-bpp] handed off ${callback.context.action} -- status ${res.status}`))
    .catch((err) => console.error('[ngo-bpp] failed to hand off callback:', err.message, '| cause:', err.cause));
}

function extractParticipant(message) {
  try {
    return { id: message.participant.id, name: message.participant.name };
  } catch (err) {
    return { id: 'unknown-learner', name: 'Unknown' };
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ---- The actual server ----

const server = http.createServer(async (req, res) => {
  console.log(`[ngo-bpp] incoming request: ${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // ---- For your teammate's UI ----

  // List every donation request (optionally filter by ?status=requested)
  if (req.method === 'GET' && req.url.startsWith('/api/ngo/requests')) {
    const url = new URL(req.url, 'http://placeholder');
    const statusFilter = url.searchParams.get('status');
    let list = Array.from(requests.values());
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // Debug/state endpoint, same idea as course-bpp's /api/state
  if (req.method === 'GET' && req.url.startsWith('/api/state')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requests: Array.from(requests.values()) }));
    return;
  }

  // NGO staff accepts a request -- pushes on_update(status: ACCEPTED)
  const acceptMatch = req.url.match(/^\/api\/ngo\/requests\/([^/?]+)\/accept$/);
  if (req.method === 'POST' && acceptMatch) {
    const r = requests.get(acceptMatch[1]);
    if (!r) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'request not found' }));
      return;
    }
    r.status = 'accepted';
    requests.set(r.id, r);
    persistRequest(r);
    sendCallback({
      context: { ...r.context, action: 'on_update', timestamp: new Date().toISOString() },
      message: { requestId: r.id, crId: r.crId, status: { code: 'ACCEPTED' } },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'updated', request: r }));
    return;
  }

  // NGO staff marks a request as paid -- pushes on_update(status: PAID)
  const paidMatch = req.url.match(/^\/api\/ngo\/requests\/([^/?]+)\/paid$/);
  if (req.method === 'POST' && paidMatch) {
    const r = requests.get(paidMatch[1]);
    if (!r) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'request not found' }));
      return;
    }
    r.status = 'paid';
    requests.set(r.id, r);
    persistRequest(r);
    sendCallback({
      context: { ...r.context, action: 'on_update', timestamp: new Date().toISOString() },
      message: { requestId: r.id, crId: r.crId, status: { code: 'PAID' } },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'updated', request: r }));
    return;
  }

  // ---- The actual Beckn webhook: init, confirm ----
  const webhookMatch = req.url.match(/^\/api\/webhook\/([a-zA-Z_]+)$/);
  if (req.method === 'POST' && webhookMatch) {
    const actionFromUrl = webhookMatch[1];
    let incoming;
    try {
      incoming = await readJsonBody(req);
    } catch (err) {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    console.log(`\n========== [ngo-bpp] ACTION: ${actionFromUrl} ==========`);
    console.log(JSON.stringify(incoming));

    // 1. Immediate ACK -- required by Beckn, not the real answer yet.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { ack: { status: 'ACK' } } }));

    if (actionFromUrl === 'init') {
      const participant = extractParticipant(incoming.message);
      const donationRequest = incoming.message.donationRequest || {};
      const id = crypto.randomUUID();
      const record = {
        id,
        participantId: participant.id,
        participantName: participant.name,
        description: donationRequest.description || '',
        amount: donationRequest.amount || '',
        deadline: donationRequest.deadline || '',
        region: donationRequest.region || '',
        crId: donationRequest.crId || '',
        status: 'requested',
        context: incoming.context,
        createdAt: new Date().toISOString(),
      };
      requests.set(id, record);
      persistRequest(record);
      console.log(`[ngo-bpp] new donation request ${id} from ${participant.name}`);

      sendCallback({
        context: { ...incoming.context, action: 'on_init', timestamp: new Date().toISOString() },
        message: { requestId: id, donationRequest, status: { code: 'REQUESTED' } },
      });
      return;
    }

    if (actionFromUrl === 'confirm') {
      const requestId = incoming.message.requestId;
      const r = requests.get(requestId);
      if (!r) {
        console.error(`[ngo-bpp] confirm referenced unknown request id: ${requestId}`);
        return;
      }
      r.status = 'confirmed';
      requests.set(r.id, r);
      persistRequest(r);

      sendCallback({
        context: { ...incoming.context, action: 'on_confirm', timestamp: new Date().toISOString() },
        message: { requestId: r.id, status: { code: 'CONFIRMED' } },
      });
      return;
    }

    console.log(`[ngo-bpp] no handler for action "${actionFromUrl}" -- ACK already sent, nothing more to do`);
    return;
  }

  console.log(`[ngo-bpp] rejecting request -- path was "${req.url}"`);
  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT || 3003;
loadFromDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`[ngo-bpp] listening on port ${PORT}`);
  });
});
