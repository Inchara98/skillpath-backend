// elevate-bpp-server.js
//
// A third BPP (provider role in Beckn terms), alongside course-bpp and
// ngo-bpp. Same protocol, different domain: instead of courses or
// donations, this handles personalized learning journeys.
//
// demo-bap sends `init` then `confirm` here -- same 2-step transaction
// pattern as the donation flow. The difference: generating a real
// journey takes a few seconds (it's an actual Claude call, not a
// database write), which is exactly the kind of thing Beckn's async
// ACK-then-callback pattern was made for. So: ACK immediately, then once
// Claude has actually produced a journey, push it back via `on_update`
// -- the same action donations use for "accepted"/"paid", here carrying
// "journey ready" plus the generated content itself.
//
// Built with the same claim-locking shape as ngo-bpp's donations, even
// though there's only one journey source (this AI) today -- so a second
// real source could compete for the same request later without any
// architecture change here.

const http = require('http');
const crypto = require('crypto');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ---- Database (Supabase Postgres, via REST) ----
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
      console.error(`[elevate-bpp] failed to load ${table}:`, resp.status, await resp.text());
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error(`[elevate-bpp] failed to load ${table}:`, err.message);
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
      if (!resp.ok) resp.text().then((t) => console.error(`[elevate-bpp] failed to save to ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[elevate-bpp] failed to save to ${table}:`, err.message));
}

// ---- In-memory store, backed by Supabase table `journey_requests` ----
// id -> { id, participantId, participantName, goal, timeframe,
//         currentTier, assessment, status, journey, claimedBy, context, createdAt }
// status: 'requested' -> 'confirmed' -> 'generating' -> 'ready'
const requests = new Map();

function persistRequest(r) {
  dbUpsert(
    'journey_requests',
    {
      id: r.id,
      participant_id: r.participantId,
      participant_name: r.participantName,
      goal: r.goal,
      timeframe: r.timeframe,
      current_tier: r.currentTier,
      assessment: r.assessment,
      status: r.status,
      journey: r.journey,
      claimed_by: r.claimedBy,
      context: r.context,
      created_at: r.createdAt,
    },
    'id'
  );
}

async function loadFromDatabase() {
  const rows = await dbSelect('journey_requests');
  rows.forEach((row) => {
    requests.set(row.id, {
      id: row.id,
      participantId: row.participant_id,
      participantName: row.participant_name,
      goal: row.goal,
      timeframe: row.timeframe,
      currentTier: row.current_tier,
      assessment: row.assessment,
      status: row.status,
      journey: row.journey,
      claimedBy: row.claimed_by,
      context: row.context,
      createdAt: row.created_at,
    });
  });
  console.log(`[elevate-bpp] loaded from database: ${requests.size} journey requests`);
}

// ---- Sending callbacks back to demo-bap ----
// Same direct hand-off pattern as course-bpp/ngo-bpp: no separate
// gateway process actually runs in this demo -- ONIX_ELEVATE_CALLER is
// set directly to demo-bap's own callback base.
function sendCallback(callback) {
  console.log(`[elevate-bpp] SENDING BACK (${callback.context.action}):`, JSON.stringify(callback));
  const base = process.env.ONIX_ELEVATE_CALLER || 'http://localhost:3001/api/bap-webhook';
  const url = `${base}/${callback.context.action}`;
  console.log(`[elevate-bpp] attempting hand-off to: ${url}`);
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback),
  })
    .then((res) => console.log(`[elevate-bpp] handed off ${callback.context.action} -- status ${res.status}`))
    .catch((err) => console.error('[elevate-bpp] failed to hand off callback:', err.message, '| cause:', err.cause));
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

// ---- The AI journey generation itself ----
// Deliberately a plain Claude call, same style as the WhatsApp bot's
// callClaude -- no separate AI infrastructure needed for this.
async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || `Claude API error (${resp.status})`);
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function generateJourney(r) {
  const prompt = `You design short, practical learning journeys for early childhood care practitioners moving between certification tiers (pre-bronze, bronze, silver, gold) in a program called Bana Pele.

Given:
- Goal: ${r.goal}
- Target timeframe: ${r.timeframe || 'not specified'}
- Current tier: ${r.currentTier || 'not specified'}
- Their own description of their current setup: ${r.assessment || 'not provided'}

Respond with ONLY a JSON object, nothing else, in exactly this shape:
{"summary": "one sentence describing this journey", "steps": [{"title": "...", "description": "..."}]}
Keep it to 3-6 concrete, realistic steps. No markdown, no extra text.`;

  try {
    const raw = await callClaude(prompt, `Generate the journey for: ${r.goal}`, 1000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[elevate-bpp] journey generation failed, using a minimal fallback:', err.message);
    return {
      summary: `A path toward: ${r.goal}`,
      steps: [{ title: 'Speak with your provider', description: "We couldn't generate a detailed plan automatically -- your provider can help build one with you directly." }],
    };
  }
}

// ---- The actual server ----

const server = http.createServer(async (req, res) => {
  console.log(`[elevate-bpp] incoming request: ${req.method} ${req.url}`);

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

  // ---- For the PWA / any future frontend ----

  if (req.method === 'GET' && req.url.startsWith('/api/elevate/journeys')) {
    const url = new URL(req.url, 'http://placeholder');
    const participantId = url.searchParams.get('participantId');
    let list = Array.from(requests.values());
    if (participantId) list = list.filter((r) => r.participantId === participantId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/state')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requests: Array.from(requests.values()) }));
    return;
  }

  // Claims this journey request for a specific source (e.g. an AI
  // engine, or later a real alternate provider) -- same
  // first-come-first-served protection as ngo-bpp's donation claims.
  const claimMatch = req.url.match(/^\/api\/elevate\/journeys\/([^/?]+)\/claim$/);
  if (req.method === 'POST' && claimMatch) {
    const r = requests.get(claimMatch[1]);
    if (!r) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'request not found' }));
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      body = {};
    }
    const claimedBy = body.claimedBy || null;
    if (r.claimedBy && claimedBy && r.claimedBy !== claimedBy) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Already claimed by ${r.claimedBy}`, claimedBy: r.claimedBy }));
      return;
    }
    r.claimedBy = claimedBy || r.claimedBy || null;
    requests.set(r.id, r);
    persistRequest(r);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'claimed', request: r }));
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

    console.log(`\n========== [elevate-bpp] ACTION: ${actionFromUrl} ==========`);
    console.log(JSON.stringify(incoming));

    // Immediate ACK -- required by Beckn, not the real answer yet.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { ack: { status: 'ACK' } } }));

    if (actionFromUrl === 'init') {
      const participant = extractParticipant(incoming.message);
      const journeyRequest = incoming.message.journeyRequest || {};
      const id = crypto.randomUUID();
      const record = {
        id,
        participantId: participant.id,
        participantName: participant.name,
        goal: journeyRequest.goal || '',
        timeframe: journeyRequest.timeframe || '',
        currentTier: journeyRequest.currentTier || '',
        assessment: journeyRequest.assessment || '',
        status: 'requested',
        journey: null,
        claimedBy: null,
        context: incoming.context,
        createdAt: new Date().toISOString(),
      };
      requests.set(id, record);
      persistRequest(record);
      console.log(`[elevate-bpp] new journey request ${id} from ${participant.name}`);

      sendCallback({
        context: { ...incoming.context, action: 'on_init', timestamp: new Date().toISOString() },
        message: { requestId: id, journeyRequest, status: { code: 'REQUESTED' } },
      });
      return;
    }

    if (actionFromUrl === 'confirm') {
      const requestId = incoming.message.requestId;
      const r = requests.get(requestId);
      if (!r) {
        console.error(`[elevate-bpp] confirm referenced unknown request id: ${requestId}`);
        return;
      }
      r.status = 'generating';
      requests.set(r.id, r);
      persistRequest(r);

      sendCallback({
        context: { ...incoming.context, action: 'on_confirm', timestamp: new Date().toISOString() },
        message: { requestId: r.id, status: { code: 'CONFIRMED' } },
      });

      // The AI generation itself happens AFTER confirm, async -- this is
      // the real reason this domain needs Beckn's async pattern rather
      // than a synchronous reply: generating a genuine journey via
      // Claude takes a few real seconds, not milliseconds.
      generateJourney(r)
        .then((journey) => {
          r.status = 'ready';
          r.journey = journey;
          requests.set(r.id, r);
          persistRequest(r);
          sendCallback({
            context: { ...r.context, action: 'on_update', timestamp: new Date().toISOString() },
            message: { requestId: r.id, participantId: r.participantId, status: { code: 'READY' }, journey },
          });
        })
        .catch((err) => {
          console.error(`[elevate-bpp] failed to generate journey for ${r.id}:`, err.message);
        });
      return;
    }

    console.log(`[elevate-bpp] no handler for action "${actionFromUrl}" -- ACK already sent, nothing more to do`);
    return;
  }

  console.log(`[elevate-bpp] rejecting request -- path was "${req.url}"`);
  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT || 3004;
loadFromDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`[elevate-bpp] listening on port ${PORT}`);
  });
});
