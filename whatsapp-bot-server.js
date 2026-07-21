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
//   7. "3" -> start a "help me set up a learning centre" request. This
//      is NOT a Beckn/course thing at all -- it's a separate, simple
//      matching system that lives entirely in THIS file's memory:
//        - learner describes what help they need -> request created,
//          notified to ADMIN_PHONE only (not broadcast to everyone)
//        - admin replies "assign me <id>" to take it themself, or
//          "forward <id>" to broadcast it out to registered experts
//        - whichever expert (or the admin) is matched, the bot then
//          relays raw text messages both ways between that phone and
//          the learner's phone until either side types "end chat"
//      Admin-only commands (only work from ADMIN_PHONE):
//        "assign me <id>", "forward <id>", "register expert <phone> <name>",
//        "list experts", "list requests"
//      Expert-only command: "accept <id>" (first to accept gets it)
//
// Env vars required (set these in Render, never hardcode them):
//   WA_TOKEN              - Meta temporary/permanent access token
//   WA_PHONE_NUMBER_ID    - Meta's Phone Number ID for THIS app
//   WA_VERIFY_TOKEN       - any string you invent, must match what you
//                           type into Meta's webhook setup screen
//   BAP_BASE_URL           - where demo-bap-server.js is reachable, e.g.
//                           https://your-bap-server.onrender.com
//   ADMIN_PHONE            - YOUR WhatsApp number (digits only, no "+"),
//                           e.g. 15551234567 -- gets notified of new
//                           centre-setup requests and can use admin commands
//   PORT                  - Render sets this automatically

const http = require('http');

const WA_TOKEN = process.env.WA_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'bana-enroll-verify-2026';
const BAP_BASE_URL = process.env.BAP_BASE_URL || 'http://localhost:3001';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const PORT = process.env.PORT || 4000;
const GRAPH_VERSION = 'v20.0';
const DEMO_OTP = '123456'; // matches demo-bap-server.js's fixed demo code

// ---- per-phone-number session state (in memory, same "prototype,
// wiped on restart" tradeoff as the rest of the backend right now) ----
const sessions = new Map(); // phone -> { token, name, lastCourses: [{id,name}], awaitingCourseSelection, awaitingCentreDescription }

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      token: null,
      name: null,
      lastCourses: [],
      awaitingCourseSelection: false,
      awaitingCentreDescription: false,
    });
  }
  return sessions.get(phone);
}

// ---- "help me set up a learning centre" matching system ----
// Entirely separate from the Beckn/course flow above -- lives only in
// this bot's memory, wiped on restart, same prototype tradeoff as
// everything else right now.

const experts = new Map(); // phone -> { phone, name }
const centreRequests = []; // { id, learnerPhone, learnerName, description, status: 'new'|'assigned'|'closed', assignedPhone, assignedName }
const chatPartners = new Map(); // phone -> the other phone they're currently relayed to
const displayNames = new Map(); // phone -> human-readable name, used when relaying/notifying
let centreRequestCounter = 0;

function nextCentreRequestId() {
  centreRequestCounter += 1;
  return `CR${centreRequestCounter}`;
}

function displayName(phone) {
  return displayNames.get(phone) || phone;
}

function isAdmin(phone) {
  return !!ADMIN_PHONE && phone === ADMIN_PHONE;
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

// Matches a centre-setup request to whoever is accepting it (admin
// self-assigning, or an expert accepting a forwarded request), starts
// the two-way chat relay, and notifies both sides.
async function handleAssign(reqId, assigneePhone, assigneeName) {
  const req = centreRequests.find((r) => r.id === reqId);
  if (!req) return sendWhatsAppMessage(assigneePhone, `I don't recognize request ${reqId}.`);
  if (req.status !== 'new') {
    return sendWhatsAppMessage(assigneePhone, `Request ${reqId} has already been ${req.status === 'closed' ? 'closed' : 'assigned'}.`);
  }
  req.status = 'assigned';
  req.assignedPhone = assigneePhone;
  req.assignedName = assigneeName;
  chatPartners.set(req.learnerPhone, assigneePhone);
  chatPartners.set(assigneePhone, req.learnerPhone);
  displayNames.set(assigneePhone, assigneeName);

  await sendWhatsAppMessage(
    req.learnerPhone,
    `Good news — ${assigneeName} is going to help you with "${req.description}". You can chat with them right here now. Type "end chat" anytime to stop.`
  );
  return sendWhatsAppMessage(
    assigneePhone,
    `You're now connected with ${req.learnerName} about: "${req.description}". Anything you type here goes straight to them. Type "end chat" anytime to stop.`
  );
}

// Broadcasts an open request out to every registered expert so any of
// them can reply "accept <id>" -- first one to accept gets matched.
async function handleForward(reqId) {
  const req = centreRequests.find((r) => r.id === reqId);
  if (!req) return sendWhatsAppMessage(ADMIN_PHONE, `I don't recognize request ${reqId}.`);
  if (req.status !== 'new') {
    return sendWhatsAppMessage(ADMIN_PHONE, `Request ${reqId} has already been ${req.status === 'closed' ? 'closed' : 'assigned'}, nothing to forward.`);
  }
  if (experts.size === 0) {
    return sendWhatsAppMessage(ADMIN_PHONE, 'No experts registered yet -- use "register expert <phone> <name>" first.');
  }
  for (const expert of experts.values()) {
    await sendWhatsAppMessage(
      expert.phone,
      `📋 Centre-setup request ${reqId} from ${req.learnerName}:\n"${req.description}"\n\nReply "accept ${reqId}" if you can help.`
    );
  }
  return sendWhatsAppMessage(ADMIN_PHONE, `Forwarded ${reqId} to ${experts.size} registered expert(s).`);
}

// ---- the actual conversation logic ----

const MENU_TEXT =
  'Welcome to Bana Pele Enrollment 👋\n\n' +
  '1️⃣ See available training programs\n' +
  '2️⃣ Check my enrollment status\n' +
  '3️⃣ Get help setting up a learning centre\n\n' +
  'Reply with 1, 2, or 3, or type "menu" anytime to see this again.';

async function handleIncomingMessage(from, text) {
  const trimmed = (text || '').trim();
  const lower = trimmed.toLowerCase();

  // ---- Active chat relay takes priority over EVERYTHING else, including
  // login. Once two phones are matched up, every message either side
  // sends just gets forwarded as-is to the other side, until one types
  // "end chat". No menu commands work while a chat is active by design --
  // if the learner or expert wants the menu back, they end the chat first.
  if (chatPartners.has(from)) {
    const partner = chatPartners.get(from);
    if (lower === 'end chat') {
      chatPartners.delete(from);
      chatPartners.delete(partner);
      const req = centreRequests.find(
        (r) => r.status === 'assigned' && (r.learnerPhone === from || r.assignedPhone === from)
      );
      if (req) req.status = 'closed';
      await sendWhatsAppMessage(from, 'Chat ended. Type "menu" to go back to the main menu.');
      await sendWhatsAppMessage(partner, 'The other person ended the chat. Type "menu" to go back to the main menu.');
      return;
    }
    return sendWhatsAppMessage(partner, `💬 ${displayName(from)}: ${trimmed}`);
  }

  // ---- Admin-only commands (only work from ADMIN_PHONE) ----
  if (isAdmin(from)) {
    const assignMeMatch = trimmed.match(/^assign me\s+(\S+)$/i);
    if (assignMeMatch) {
      return handleAssign(assignMeMatch[1], from, 'Admin');
    }
    const forwardMatch = trimmed.match(/^forward\s+(\S+)$/i);
    if (forwardMatch) {
      return handleForward(forwardMatch[1]);
    }
    const registerMatch = trimmed.match(/^register expert\s+(\d+)\s+(.+)$/i);
    if (registerMatch) {
      const [, expertPhone, expertName] = registerMatch;
      experts.set(expertPhone, { phone: expertPhone, name: expertName.trim() });
      displayNames.set(expertPhone, expertName.trim());
      return sendWhatsAppMessage(from, `Registered expert "${expertName.trim()}" (${expertPhone}). They can now reply "accept <id>" to take a forwarded request.`);
    }
    if (lower === 'list experts') {
      if (experts.size === 0) return sendWhatsAppMessage(from, 'No experts registered yet. Use "register expert <phone> <name>".');
      const lines = Array.from(experts.values()).map((e) => `• ${e.name} (${e.phone})`).join('\n');
      return sendWhatsAppMessage(from, `Registered experts:\n\n${lines}`);
    }
    if (lower === 'list requests') {
      const open = centreRequests.filter((r) => r.status !== 'closed');
      if (open.length === 0) return sendWhatsAppMessage(from, 'No open centre-setup requests right now.');
      const lines = open.map((r) => `• ${r.id} [${r.status}] ${r.learnerName}: ${r.description}`).join('\n');
      return sendWhatsAppMessage(from, `Open centre-setup requests:\n\n${lines}`);
    }
  }

  // ---- Expert command: "accept <id>" -- first registered expert to
  // accept a forwarded request gets matched with the learner. ----
  const acceptMatch = trimmed.match(/^accept\s+(\S+)$/i);
  if (acceptMatch && experts.has(from)) {
    return handleAssign(acceptMatch[1], from, experts.get(from).name);
  }

  const session = await ensureLoggedIn(from);
  displayNames.set(from, session.name || from);

  // A learner just replied with their centre-help description (free text,
  // right after choosing option 3). Checked before any digit/menu logic
  // since the description itself might just be a number or short word.
  if (session.awaitingCentreDescription) {
    session.awaitingCentreDescription = false;
    const reqId = nextCentreRequestId();
    centreRequests.push({
      id: reqId,
      learnerPhone: from,
      learnerName: session.name || from,
      description: trimmed,
      status: 'new',
      assignedPhone: null,
      assignedName: null,
    });
    if (ADMIN_PHONE) {
      await sendWhatsAppMessage(
        ADMIN_PHONE,
        `📋 New centre-setup request ${reqId} from ${session.name || from}:\n"${trimmed}"\n\n` +
          `Reply "assign me ${reqId}" to take it yourself, or "forward ${reqId}" to send it to registered experts.`
      );
    } else {
      console.warn('[wa-bot] ADMIN_PHONE not set -- new centre request created but nobody was notified:', reqId);
    }
    return sendWhatsAppMessage(from, "Thanks! We've noted what you need help with, and someone from our team will reach out here soon.");
  }

  // "complete 2" -> mark the 2nd listed course as complete
  const completeMatch = lower.match(/^complete\s+(\d+)$/);
  if (completeMatch) {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    const idx = parseInt(completeMatch[1], 10) - 1;
    const course = session.lastCourses[idx];
    if (!course) return sendWhatsAppMessage(from, "I don't recognize that number. Type 2 to see your current courses first.");
    await markComplete(session.token, course.id);
    return sendWhatsAppMessage(from, `Marked "${course.name}" as complete ✅ — sent to the training authority for approval.`);
  }

  // A bare number reply, right after a course list was shown -> enroll in
  // that course. This takes priority over the "1"/"2" menu shortcuts below,
  // since the same digit means something different depending on whether
  // a course list is currently on screen. Cleared once acted on (or once
  // the user goes and does something else), so "1"/"2" go back to being
  // the main-menu shortcuts afterwards.
  if (session.awaitingCourseSelection && /^\d+$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    const course = session.lastCourses[idx];
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
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
    session.awaitingCentreDescription = false;
    if (courses.length === 0) {
      session.awaitingCourseSelection = false;
      return sendWhatsAppMessage(from, 'No training programs are available right now.');
    }
    session.awaitingCourseSelection = true;
    const lines = courses.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    return sendWhatsAppMessage(from, `Available training programs:\n\n${lines}\n\nReply with a number to enroll.`);
  }

  if (trimmed === '2' || lower === 'status') {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    const state = await fetchState(session.token);
    const entries = Object.entries(state.courseProgress || {});
    if (entries.length === 0) return sendWhatsAppMessage(from, "You haven't enrolled in anything yet. Type 1 to see available programs.");
    const lines = entries.map(([courseId, progress]) => {
      const name = (session.lastCourses.find((c) => c.id === courseId) || {}).name || courseId;
      return `• ${name}: ${progress.status}`;
    }).join('\n');
    return sendWhatsAppMessage(from, `Your training status (tier: ${state.tier}):\n\n${lines}`);
  }

  if (trimmed === '3') {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = true;
    return sendWhatsAppMessage(
      from,
      'Tell me a bit about what help you need setting up your learning centre (e.g. funding, finding a location, curriculum, staffing) — just describe it in your own words.'
    );
  }

  if (['hi', 'hello', 'menu', 'hey', 'start'].includes(lower)) {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    return sendWhatsAppMessage(from, MENU_TEXT);
  }

  session.awaitingCourseSelection = false;
  session.awaitingCentreDescription = false;
  return sendWhatsAppMessage(from, `Sorry, I didn't understand that.\n\n${MENU_TEXT}`);
}

// ---- plain http server: webhook verification (GET) + incoming messages (POST) ----

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Open up CORS on every response, since the provider dashboard (a
  // static site on its own Render origin) needs to call this API
  // directly from the browser, same reasoning as course-bpp-server.js.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    console.log(`[wa-bot] webhook verification attempt: mode=${mode} token=${token} expectedToken=${WA_VERIFY_TOKEN}`);
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

  // Lets the provider dashboard (a completely different app/origin) show
  // open centre-setup requests, same data an admin would otherwise only
  // see via a WhatsApp notification.
  if (req.method === 'GET' && url.pathname === '/api/centre-requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        requests: centreRequests.map((r) => ({
          id: r.id,
          learnerName: r.learnerName,
          description: r.description,
          status: r.status,
          assignedName: r.assignedName,
        })),
      })
    );
    return;
  }

  // Lets the admin click "Assign to me" in the provider dashboard instead
  // of typing "assign me <id>" over WhatsApp -- same underlying action.
  const dashboardAssignMatch = url.pathname.match(/^\/api\/centre-requests\/([a-zA-Z0-9-]+)\/assign-admin$/);
  if (req.method === 'POST' && dashboardAssignMatch) {
    if (!ADMIN_PHONE) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ADMIN_PHONE is not configured on this server yet.' }));
      return;
    }
    handleAssign(dashboardAssignMatch[1], ADMIN_PHONE, 'Admin')
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'assigned' }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
