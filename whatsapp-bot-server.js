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
//   ANTHROPIC_API_KEY      - enables natural-language answers for free-text
//                           questions (e.g. "what type of centre should I
//                           set up") instead of always escalating to a
//                           human. Optional -- bot still works without it,
//                           just falls back to escalating everything.
//   SUPABASE_URL           - your Supabase project's API URL, e.g.
//                           https://xxxxx.supabase.co -- enables logging
//                           every real Q&A answer to the qa_logs table
//   SUPABASE_SERVICE_KEY   - Supabase's secret/service_role key (NOT the
//                           anon/publishable one) -- needed alongside
//                           SUPABASE_URL for Q&A logging. Both optional --
//                           bot works fine without them, just doesn't log.
//   PORT                  - Render sets this automatically

const http = require('http');

const WA_TOKEN = process.env.WA_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'bana-enroll-verify-2026';
const BAP_BASE_URL = process.env.BAP_BASE_URL || 'http://localhost:3001';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
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

// ---- Q&A logging, using Supabase (optional) ----
// Saves every real question+answer pair from the natural-language layer
// (not escalations) so someone can review what people are asking. If
// SUPABASE_URL/SUPABASE_SERVICE_KEY aren't set, or the request fails for
// any reason, this fails silently -- logging should never break the
// actual reply the learner receives.

async function logQA(phone, question, answer) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ phone, question, answer }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('[wa-bot] failed to log Q&A:', resp.status, text);
    }
  } catch (err) {
    console.error('[wa-bot] failed to log Q&A:', err.message);
  }
}

// ---- Natural-language answers, using Claude ----
// Optional layer on top of everything else in this file. If
// ANTHROPIC_API_KEY isn't set, every code path below that calls this
// just skips it and falls back to the old escalate-everything behaviour,
// so the bot degrades gracefully rather than breaking.

async function callClaude(systemPrompt, userMessage, { maxTokens = 500, useWebSearch = false } = {}) {
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || `Claude API error (${resp.status})`);
  // With web search enabled, the response can contain several content
  // blocks (search queries, search results, then the final answer) --
  // join every text block together to get the complete reply.
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text;
}

// Condensed from Bana-PeleBlueprint-for-2030-4_2_26.pdf (Feb 2026) --
// only the parts relevant to someone asking practical questions about
// setting up or running a learning centre. Not the full document; kept
// short deliberately since this gets sent on every relevant API call.
const BANA_PELE_KNOWLEDGE = `Key facts from the Bana Pele Shared Blueprint (Feb 2026), South Africa's national early learning strategy:

TYPES OF EARLY LEARNING PROGRAMMES (ELPs) -- the "mixed-modality model":
- Centre-based: a dedicated space (a room, hall, or building) where children come daily
- Home-based: run out of a practitioner's own home, smaller scale
- Mobile: services that travel to reach children in remote areas
- Community-based: playgroups, toy libraries, run in shared community spaces
There is no single "right" type -- the choice depends on the space, funding and community available.

REGISTRATION TIERS: Bronze -> Silver -> Gold, each with increasing health/safety
standards. Registration is done through the DBE (Department of Basic Education),
supported by the Bana Pele Mass Registration Drive and the ECD Red Tape Reduction
Toolkit to simplify the process.

FUNDING SOURCES:
- ECD Subsidy -- ongoing government funding per child, tied to registration tier
- ECCE Livelihoods Fund -- start-up capital for new practitioners
- ECD Maintenance Grant -- for facility repairs/upgrades
- Bana Pele Accelerator Fund -- for scaling existing quality access

TYPICAL JOURNEY (like "Naledi's Journey" in the Blueprint):
1. Contact the Bana Pele Engagement Platform to get connected
2. Complete free basic training modules (low-data, phone-friendly)
3. Identify a safe space and apply for ECCE Livelihoods Fund start-up capital
4. Register for Bronze tier through eCares (the digital registration system)
5. Progress to Silver (unlocks the ECD Subsidy) once basic standards are met
6. Continue improving toward Gold over time, with coaching support

This is general national policy guidance, not a personalised checklist -- exact
requirements can vary by province/municipality, so always suggest confirming
specifics with the local Provincial Education Department or municipality.`;

// Used right after a learner picks option 3 and replies with free text.
// Distinguishes "please explain something to me" from "please connect me
// with a real person" -- only the second case should create a
// centre-request and notify the admin.
const CENTRE_HELP_SYSTEM_PROMPT = `You are a helpful assistant for Bana Pele, South Africa's national early learning initiative, helping people who want to set up or improve an early learning centre.

You are given ONE message from a learner. Decide:
- If it is a QUESTION seeking information or advice (e.g. "what type of centre should I set up", "how do I get funding", "what are the requirements"), answer it directly and helpfully using the reference knowledge below, your own general knowledge, and web search when it would give more current or specific detail (e.g. exact subsidy amounts, current program pages, specific eligibility rules). Keep the tone warm and plain-language for a first-time practitioner in South Africa.
- If it is NOT a question but instead a description of what kind of help they personally need (e.g. "I need help finding a location and funding", "I want to open a centre in my village but don't know where to start"), reply with EXACTLY the single word: ESCALATE
- If genuinely ambiguous, prefer answering as a question rather than escalating.

FORMATTING (this reply goes straight into a WhatsApp text message, so no markdown):
- Write in short sentences.
- If the answer has multiple conditions, steps, requirements or options, list them one per line starting with "- ", instead of packing them into one long sentence.
- Keep the whole reply under about 6 short lines total.
- If you used web search and found a specific source worth mentioning, name it in plain text (e.g. "According to the Department of Basic Education website...") -- don't include raw URLs or markdown links.

Reference knowledge:
${BANA_PELE_KNOWLEDGE}`;

// Used as a last resort, when a message doesn't match ANY known command
// (menu numbers, "status", "complete N", etc). Tries to actually help
// with a real answer instead of just showing the menu again.
const GENERAL_SYSTEM_PROMPT = `You are a helpful WhatsApp assistant for Bana Pele, South Africa's national early learning initiative. You help early learning practitioners and parents with plain-language questions about early childhood development, setting up learning centres, funding, and related topics. Use the reference knowledge below, your own general knowledge, and web search when it would give more current or specific detail. If the message is totally unrelated to early learning/ECD, say briefly that you can't help with that specific thing, and remind them they can type "menu" to see what you can do.

FORMATTING (this reply goes straight into a WhatsApp text message, so no markdown):
- Write in short sentences.
- If the answer has multiple conditions, steps, requirements or options, list them one per line starting with "- ", instead of packing them into one long sentence.
- Keep the whole reply under about 6 short lines total.
- If you used web search and found a specific source worth mentioning, name it in plain text (e.g. "According to the Department of Basic Education website...") -- don't include raw URLs or markdown links.

Reference knowledge:
${BANA_PELE_KNOWLEDGE}`;

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

    if (ANTHROPIC_API_KEY) {
      try {
        const reply = await callClaude(CENTRE_HELP_SYSTEM_PROMPT, trimmed, { useWebSearch: true });
        if (reply !== 'ESCALATE') {
          logQA(from, trimmed, reply); // fire-and-forget, never blocks the reply
          return sendWhatsAppMessage(
            from,
            `${reply}\n\nIf you'd also like hands-on help from a real person on our team, just type 3 again and describe what you personally need.`
          );
        }
        // else: Claude decided this is a genuine help request, not a
        // question -- fall through to the existing escalation logic below.
      } catch (err) {
        console.error('[wa-bot] Claude call failed, falling back to escalation:', err.message);
        // fall through to escalation so a failed API call doesn't leave
        // the learner stuck with no response at all
      }
    }

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

  if (ANTHROPIC_API_KEY) {
    try {
      const reply = await callClaude(GENERAL_SYSTEM_PROMPT, trimmed, { useWebSearch: true });
      logQA(from, trimmed, reply); // fire-and-forget, never blocks the reply
      session.awaitingCourseSelection = false;
      session.awaitingCentreDescription = false;
      return sendWhatsAppMessage(from, reply);
    } catch (err) {
      console.error('[wa-bot] Claude fallback failed, using generic message:', err.message);
      // fall through to the generic message below
    }
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

  // Lets the admin click "Forward to experts" in the provider dashboard
  // instead of typing "forward <id>" over WhatsApp -- same underlying action.
  const dashboardForwardMatch = url.pathname.match(/^\/api\/centre-requests\/([a-zA-Z0-9-]+)\/forward$/);
  if (req.method === 'POST' && dashboardForwardMatch) {
    if (!ADMIN_PHONE) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ADMIN_PHONE is not configured on this server yet.' }));
      return;
    }
    handleForward(dashboardForwardMatch[1])
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'forwarded' }));
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
