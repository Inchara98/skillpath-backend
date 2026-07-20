// ---- Bana Pele WhatsApp enrollment bot ----
//
// This is a SEPARATE, standalone server. It does NOT talk Beckn directly
// and does NOT duplicate any enrollment/tier logic. It's just a new
// "client" of demo-bap-server.js -- exactly like the citizen_app Flutter
// app is -- except the UI is WhatsApp text messages instead of buttons.
//
// Flow per WhatsApp user (keyed by their phone number):
//   1. First message ever -> auto-login against demo-bap-server.js using
//      their WhatsApp phone number (no separate OTP typing needed --
//      WhatsApp already proved they own that phone by messaging from it).
//      Internally we still call the real /api/auth/otp/request + /verify
//      endpoints with the known DEMO_OTP, so this bot doesn't need any
//      special backend support -- it's just automating what a human
//      would type into the app.
//   2. "menu" / "hi" / "hello" -> show the main menu
//   3. "1" -> list courses (calls /api/trigger/discover), numbered
//   4. reply with a course number -> enroll (select + init), same as the
//      app's "Enroll" button
//   5. "2" or "status" -> show current progress (calls /api/state)
//   6. reply "complete <n>" against an enrolled course -> confirm
//
// Env vars required (set these in Render, never hardcode them):
//   WA_TOKEN              - Meta temporary/permanent access token
//   WA_PHONE_NUMBER_ID    - Meta's Phone Number ID for THIS app
//   WA_VERIFY_TOKEN       - any string you invent, must match what you
//                           type into Meta's webhook setup screen
//   BAP_BASE_URL           - where demo-bap-server.js is reachable, e.g.
//                           https://your-bap-server.onrender.com
//   PORT                  - Render sets this automatically

const http = require('http');

const WA_TOKEN = process.env.WA_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'bana-enroll-verify-2026';
const BAP_BASE_URL = process.env.BAP_BASE_URL || 'http://localhost:3001';
const PORT = process.env.PORT || 4000;
const GRAPH_VERSION = 'v20.0';
const DEMO_OTP = '123456'; // matches demo-bap-server.js's fixed demo code

// ---- per-phone-number session state (in memory, same "prototype,
// wiped on restart" tradeoff as the rest of the backend right now) ----
const sessions = new Map(); // phone -> { token, name, lastCourses: [{id,name}] }

function getSession(phone) {
  if (!sessions.has(phone)) sessions.set(phone, { token: null, name: null, lastCourses: [] });
  return sessions.get(phone);
}

// ---- talking to demo-bap-server.js (the same 5 endpoints the Flutter
// app uses -- see beckn_bap_api.dart and auth_api.dart) ----

async function bapFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-learner-token'] = token;
  const resp = await fetch(`${BAP_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { /* ignore */ }
  if (!resp.ok) throw new Error(json.error || `${path} failed (${resp.status})`);
  return json;
}

async function ensureLoggedIn(phone) {
  const session = getSession(phone);
  if (session.token) return session;

  await bapFetch('/api/auth/otp/request', { method: 'POST', body: { phone } });
  const verifyResp = await bapFetch('/api/auth/otp/verify', {
    method: 'POST',
    body: { phone, otp: DEMO_OTP },
  });
  session.token = verifyResp.token;
  session.name = verifyResp.name;
  return session;
}

async function discoverCourses(token) {
  await bapFetch('/api/trigger/discover', { method: 'POST', token, body: { query: '' } });
  // discover is async (real Beckn on_discover pattern) -- give the
  // round trip a moment, then read back the resulting state, same
  // as the Flutter app polling /api/state after an action.
  await sleep(900);
  const state = await bapFetch('/api/state', { token });
  return state.catalog || [];
}

async function enrollInCourse(token, courseId) {
  await bapFetch('/api/trigger/select', { method: 'POST', token, body: { courseId } });
  await sleep(600);
  await bapFetch('/api/trigger/init', { method: 'POST', token, body: { courseId } });
}

async function markComplete(token, courseId) {
  await bapFetch('/api/trigger/confirm', { method: 'POST', token, body: { courseId } });
}

async function fetchState(token) {
  return bapFetch('/api/state', { token });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- sending WhatsApp replies via Meta's Graph API ----

async function sendWhatsAppMessage(to, text) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.warn('[wa-bot] WA_TOKEN/WA_PHONE_NUMBER_ID not set -- skipping real send. Would have sent:', text);
    return;
  }
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[wa-bot] failed to send WhatsApp message:', resp.status, errText);
  }
}

// ---- the actual conversation logic ----

const MENU_TEXT =
  'Welcome to Bana Pele Enrollment 👋\n\n' +
  '1️⃣ See available training programs\n' +
  '2️⃣ Check my enrollment status\n\n' +
  'Reply with 1 or 2, or type "menu" anytime to see this again.';

async function handleIncomingMessage(from, text) {
  const trimmed = (text || '').trim();
  const lower = trimmed.toLowerCase();
  const session = await ensureLoggedIn(from);

  // "complete 2" -> mark the 2nd listed course as complete
  const completeMatch = lower.match(/^complete\s+(\d+)$/);
  if (completeMatch) {
    const idx = parseInt(completeMatch[1], 10) - 1;
    const course = session.lastCourses[idx];
    if (!course) return sendWhatsAppMessage(from, "I don't recognize that number. Type 2 to see your current courses first.");
    await markComplete(session.token, course.id);
    return sendWhatsAppMessage(from, `Marked "${course.name}" as complete ✅ — sent to the training authority for approval.`);
  }

  // A bare number reply -> enroll in that course from the last list shown
  if (/^\d+$/.test(trimmed) && session.lastCourses.length > 0 && !['1', '2'].includes(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    const course = session.lastCourses[idx];
    if (!course) return sendWhatsAppMessage(from, "I don't recognize that number. Type 1 to see the course list again.");
    await enrollInCourse(session.token, course.id);
    return sendWhatsAppMessage(
      from,
      `Enrollment request sent for "${course.name}" ⏳ — awaiting approval from the training authority. Type 2 anytime to check status.`
    );
  }

  if (trimmed === '1') {
    const courses = await discoverCourses(session.token);
    session.lastCourses = courses.map((c) => ({ id: c.id, name: c.name }));
    if (courses.length === 0) return sendWhatsAppMessage(from, 'No training programs are available right now.');
    const lines = courses.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    return sendWhatsAppMessage(from, `Available training programs:\n\n${lines}\n\nReply with a number to enroll.`);
  }

  if (trimmed === '2' || lower === 'status') {
    const state = await fetchState(session.token);
    const entries = Object.entries(state.courseProgress || {});
    if (entries.length === 0) return sendWhatsAppMessage(from, "You haven't enrolled in anything yet. Type 1 to see available programs.");
    const lines = entries.map(([courseId, progress]) => {
      const name = (session.lastCourses.find((c) => c.id === courseId) || {}).name || courseId;
      return `• ${name}: ${progress.status}`;
    }).join('\n');
    return sendWhatsAppMessage(from, `Your training status (tier: ${state.tier}):\n\n${lines}`);
  }

  if (['hi', 'hello', 'menu', 'hey', 'start'].includes(lower)) {
    return sendWhatsAppMessage(from, MENU_TEXT);
  }

  return sendWhatsAppMessage(from, `Sorry, I didn't understand that.\n\n${MENU_TEXT}`);
}

// ---- plain http server: webhook verification (GET) + incoming messages (POST) ----

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      res.writeHead(403);
      res.end('Verification failed');
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'received' })); // ack immediately, Meta requires a fast 200

      try {
        const payload = JSON.parse(body);
        const entry = payload.entry && payload.entry[0];
        const change = entry && entry.changes && entry.changes[0];
        const value = change && change.value;
        const message = value && value.messages && value.messages[0];
        if (message && message.type === 'text') {
          const from = message.from; // learner's WhatsApp number, no "+" prefix
          const text = message.text.body;
          console.log(`[wa-bot] incoming from ${from}: ${text}`);
          handleIncomingMessage(from, text).catch((err) => {
            console.error('[wa-bot] error handling message:', err.message);
            sendWhatsAppMessage(from, 'Sorry, something went wrong on our end. Please try again in a moment.');
          });
        }
      } catch (err) {
        console.error('[wa-bot] failed to parse webhook payload:', err.message);
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bapBaseUrl: BAP_BASE_URL }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[wa-bot] listening on port ${PORT}, forwarding to ${BAP_BASE_URL}`);
});
