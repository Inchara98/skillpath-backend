// ---- Bana Pele WhatsApp enrollment bot ----
//
// This is a SEPARATE, standalone server. It does NOT talk Beckn directly
// and does NOT duplicate any enrollment/tier logic. It's just a new
// "client" of demo-bap-server.js -- exactly like the citizen_app Flutter
// app is -- except the UI is WhatsApp text messages instead of buttons.
//
// ---- CHANGE LOG: AI-first conversation, not menu-first ----
// Every message now goes through Claude FIRST (handleConversationalFlow)
// to figure out what the person wants from natural phrasing -- "show me
// what's available", "connect me with Marizanne", "how's my status" --
// instead of requiring an exact number or keyword. The underlying work
// (discoverCourses, enrollInCourse, requestPeerConnect, etc.) is
// UNCHANGED -- only the "what should I call" decision changed. The old,
// fully menu-driven flow (handleMenuDrivenFlow) is kept intact as a
// complete fallback, used automatically if ANTHROPIC_API_KEY isn't set,
// or if the conversational router itself fails for any reason -- the
// bot should never go silent just because the AI layer had a problem.
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
//   8. "4" -> browse peers for peer support. Peer PROFILES are NOT
//      managed here at all -- they live on the provider side
//      (course-bpp's practitioners, set via a provider-only endpoint)
//      and are fetched fresh every time via the REAL Beckn discover
//      action (category: "peers"), the exact same mechanism as courses.
//      Flow: list -> pick a number -> see full profile -> reply
//      "connect" (or 0 to go back). The chosen peer gets notified and
//      can "accept <id>"/"decline <id>"; only on accept does the live
//      chat relay start (same relay mechanism as centre-setup).
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
      console.error(`[wa-bot] failed to load ${table}:`, resp.status, await resp.text());
      return [];
    }
    return resp.json();
  } catch (err) {
    console.error(`[wa-bot] failed to load ${table}:`, err.message);
    return [];
  }
}

// Fire-and-forget by design -- persistence failures get logged but
// never block or break the actual WhatsApp reply being sent.
function dbUpsert(table, row, conflictColumn) {
  if (!SUPABASE_URL) return;
  fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  })
    .then((resp) => {
      if (!resp.ok) resp.text().then((t) => console.error(`[wa-bot] failed to save to ${table}:`, resp.status, t));
    })
    .catch((err) => console.error(`[wa-bot] failed to save to ${table}:`, err.message));
}

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
      // Peer-connect browsing state -- in-memory only, same reasoning
      // as the two flags above (single-message follow-up state, not
      // durable). lastPeerList holds the actual peer objects fetched
      // live from Beckn discover, not just phone numbers, since this
      // bot doesn't store peer data of its own to look them back up in.
      awaitingPeerSelection: false,
      viewingPeer: null,
      lastPeerList: [],
      // Same idea for donors and spaces -- just conversation context so
      // the router can resolve "tell me more about X" / "connect me
      // with them" against whatever was shown most recently.
      lastDonorList: [],
      viewingDonor: null,
      lastSpaceList: [],
      viewingSpace: null,
      // Multi-step support-request conversation state -- in-memory only,
      // same reasoning as everything else above. A support request now
      // takes 2 back-and-forth turns before anything gets logged: first
      // we ask for more detail, then we ask whether they want it raised
      // as a formal request or want to be connected with a peer/volunteer
      // instead, so it feels like talking to a person rather than filling
      // in a form one message at a time.
      awaitingSupportDetail: false,
      awaitingSupportChoice: false,
      supportDraftDescription: null,
      // Donation-request conversation state (NGO flow) -- same reasoning
      // as the support-request state above, but the choice comes FIRST
      // here: donor contact info vs a real request to the region's NGO.
      awaitingDonorChoice: false,
      awaitingDonationDetail: false,
      donationDraftDescription: null,
      donationFullDescription: null,
      donationParsedDetails: null,
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

function persistSession(phone, session) {
  dbUpsert(
    'wa_sessions',
    {
      phone,
      token: session.token,
      name: session.name,
      last_courses: session.lastCourses,
      awaiting_course_selection: session.awaitingCourseSelection,
      awaiting_centre_description: session.awaitingCentreDescription,
    },
    'phone'
  );
}

function persistExpert(expert) {
  dbUpsert('wa_experts', { phone: expert.phone, name: expert.name }, 'phone');
}

function persistCentreRequest(req) {
  dbUpsert(
    'centre_requests',
    {
      id: req.id,
      learner_phone: req.learnerPhone,
      learner_name: req.learnerName,
      description: req.description,
      status: req.status,
      assigned_phone: req.assignedPhone,
      assigned_name: req.assignedName,
    },
    'id'
  );
}

function displayName(phone) {
  return displayNames.get(phone) || phone;
}

function isAdmin(phone) {
  return !!ADMIN_PHONE && phone === ADMIN_PHONE;
}

// ---- "connect with a peer for support" system ----
// Peer PROFILES live entirely on the provider side (course-bpp), fetched
// fresh via the real Beckn discover action every time a learner types
// "4" -- this bot never stores or edits peer info itself. What DOES
// live here, bot-side, is the lightweight "please connect me with THIS
// specific peer" handshake (request -> accept/decline -> chat), since
// that's inherently a WhatsApp-side interaction, not a Beckn transaction.
const peerConnectRequests = []; // { id, learnerPhone, learnerName, peerPhone, peerName, status: 'pending'|'accepted'|'declined'|'closed' }
let peerConnectCounter = 0;

function nextPeerConnectId() {
  peerConnectCounter += 1;
  return `PC${peerConnectCounter}`;
}

function persistPeerConnectRequest(req) {
  dbUpsert(
    'peer_connect_requests',
    {
      id: req.id,
      learner_phone: req.learnerPhone,
      learner_name: req.learnerName,
      peer_phone: req.peerPhone,
      peer_name: req.peerName,
      status: req.status,
    },
    'id'
  );
}

function formatPeerListLine(index, peer) {
  const tier = peer.tier ? `${peer.tier} Tier` : 'Tier not set';
  const area = peer.area ? ` — ${peer.area}` : '';
  return `${index + 1}. ${peer.name} — ${tier}${area}`;
}

function formatPeerProfile(peer) {
  const lines = [`${peer.name} — ${peer.tier ? peer.tier + ' Tier ' : ''}ELP Practitioner`];
  if (peer.area) lines.push(`Area: ${peer.area}`);
  if (peer.yearsExperience != null) lines.push(`Years of Experience: ${peer.yearsExperience} years`);
  if (peer.elpType) lines.push(`ELP Type: ${peer.elpType}`);
  if (peer.hubs && peer.hubs.length > 0) lines.push(`Associated Community/Hubs: ${peer.hubs.join(', ')}`);
  if (peer.certifications && peer.certifications.length > 0) lines.push(`Certifications: ${peer.certifications.join(', ')}`);
  lines.push('');
  lines.push('Reply "connect" to request to connect with them, or 0 to go back to the peer list.');
  return lines.join('\n');
}

// Learner requested to connect with a specific peer. Notifies the peer
// with accept/decline instructions -- does NOT start the chat relay yet,
// that only happens once the peer actually accepts.
async function requestPeerConnect(learnerPhone, learnerName, peer) {
  if (!peer.phone) {
    return sendWhatsAppMessage(learnerPhone, "Sorry, we don't have a way to reach that peer directly yet. Type 4 to see other peers.");
  }
  const reqId = nextPeerConnectId();
  const newRequest = {
    id: reqId,
    learnerPhone,
    learnerName,
    peerPhone: peer.phone,
    peerName: peer.name,
    status: 'pending',
  };
  peerConnectRequests.push(newRequest);
  persistPeerConnectRequest(newRequest);
  await sendWhatsAppMessage(
    peer.phone,
    `👋 ${learnerName} would like to connect with you for peer support.\n\nReply "accept ${reqId}" to connect, or "decline ${reqId}" to pass.`
  );
  return sendWhatsAppMessage(learnerPhone, `Request sent to ${peer.name} — we'll let you know as soon as they respond.`);
}

async function handlePeerAccept(reqId, peerPhone) {
  const req = peerConnectRequests.find((r) => r.id === reqId);
  if (!req) return sendWhatsAppMessage(peerPhone, `I don't recognize request ${reqId}.`);
  if (req.peerPhone !== peerPhone) return sendWhatsAppMessage(peerPhone, `Request ${reqId} isn't addressed to you.`);
  if (req.status !== 'pending') return sendWhatsAppMessage(peerPhone, `Request ${reqId} has already been ${req.status}.`);
  req.status = 'accepted';
  persistPeerConnectRequest(req);
  chatPartners.set(req.learnerPhone, peerPhone);
  chatPartners.set(peerPhone, req.learnerPhone);
  await sendWhatsAppMessage(
    req.learnerPhone,
    `Good news — ${req.peerName} accepted your request! You can chat with them right here now. Type "end chat" anytime to stop.`
  );
  return sendWhatsAppMessage(
    peerPhone,
    `You're now connected with ${req.learnerName}. Anything you type here goes straight to them. Type "end chat" anytime to stop.`
  );
}

async function handlePeerDecline(reqId, peerPhone) {
  const req = peerConnectRequests.find((r) => r.id === reqId);
  if (!req) return sendWhatsAppMessage(peerPhone, `I don't recognize request ${reqId}.`);
  if (req.peerPhone !== peerPhone) return sendWhatsAppMessage(peerPhone, `Request ${reqId} isn't addressed to you.`);
  if (req.status !== 'pending') return sendWhatsAppMessage(peerPhone, `Request ${reqId} has already been ${req.status}.`);
  req.status = 'declined';
  persistPeerConnectRequest(req);
  await sendWhatsAppMessage(req.learnerPhone, `${req.peerName} isn't available to connect right now. Type 4 to see other peers.`);
  return sendWhatsAppMessage(peerPhone, 'Declined. Thanks for letting us know.');
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

IMPORTANT: You do NOT have access to this specific bot's live, current course catalog or the learner's actual enrollment/status records -- do not invent, guess, or list specific course names or enrollment details. If someone asks what courses/programs are available, or to check their own enrollment/status, tell them to type 1 (to see the real course list) or 2 (to check their real status) instead of answering that part yourself.

FORMATTING (this reply goes straight into a WhatsApp text message, so no markdown):
- Write in short sentences.
- If the answer has multiple conditions, steps, requirements or options, list them one per line starting with "- ", instead of packing them into one long sentence.
- Keep the whole reply under about 6 short lines total.
- If you used web search and found a specific source worth mentioning, name it in plain text (e.g. "According to the Department of Basic Education website...") -- don't include raw URLs or markdown links.

Reference knowledge:
${BANA_PELE_KNOWLEDGE}`;

// ---- AI-first conversational router ----
// Every message (once past chat-relay/admin/accept-decline) goes through
// THIS first, instead of requiring an exact number or keyword. Claude
// decides what the person wants (and, if relevant, WHICH course/peer
// they mean) from natural phrasing; the actual work is still done by
// the exact same functions as the old menu flow (discoverCourses,
// enrollInCourse, requestPeerConnect, etc.) -- only the "what should I
// call" decision changed, not the underlying logic.

async function classifyConversation(message, context) {
  const coursesList = context.courses.length ? context.courses.map((c) => `- ${c.name}`).join('\n') : '(none shown yet)';
  const peersList = context.peers.length
    ? context.peers.map((p) => `- ${p.name} (${p.tier || 'tier unknown'}${p.area ? ', ' + p.area : ''})`).join('\n')
    : '(none shown yet)';
  const donorsList = context.donors.length
    ? context.donors.map((d) => `- ${d.name} (${d.supportType || 'support type unknown'})`).join('\n')
    : '(none shown yet)';
  const spacesList = context.spaces.length
    ? context.spaces.map((s) => `- ${s.name} (${s.spaceType || 'type unknown'}${s.area ? ', ' + s.area : ''})`).join('\n')
    : '(none shown yet)';
  const viewing = context.viewingPeer ? context.viewingPeer.name : 'none';
  const viewingDonor = context.viewingDonor ? context.viewingDonor.name : 'none';
  const viewingSpace = context.viewingSpace ? context.viewingSpace.name : 'none';

  const routerPrompt = `You are the conversation router for a WhatsApp bot helping early learning practitioners and parents in South Africa (the Bana Pele program) access training, funding/donor support, community spaces, and peer support.

Output ONLY a single JSON object, nothing else -- no code fences, no extra text. Shape:
{"intent": "...", "reference": "..." or null, "freeText": "..." or null}

Valid intents:
- "greeting" -- a hello/hi/starting the conversation, with no other specific request
- "program_question" -- a general question about the Bana Pele program itself, registration steps, eCares, or how the program works for them (not about a specific course, peer, donor, or space). Put their exact message in "freeText".
- "show_courses" -- wants to see available training programs
- "enroll_course" -- wants to enroll/join/sign up for a specific course. Put the course name or reference (e.g. "the first one", "child safety") in "reference".
- "check_status" -- wants to know their own enrollment/progress/tier
- "mark_complete" -- says they finished/completed a course. Put the course reference in "reference".
- "donor_list" -- looking for monetary/donation/funding/nutrition/food support, or an agency/donor that could help their centre or a child in their care
- "view_donor" -- asking about ONE SPECIFIC donor/agency (by name or reference). Put the reference in "reference".
- "connect_donor" -- wants contact info / to connect with a specific donor. Put the reference in "reference" (null if clearly referring to whoever they're currently viewing).
- "space_list" -- looking for a place/venue/space to host an event, meeting, or activity (e.g. churches, halls, community spaces)
- "view_space" -- asking about ONE SPECIFIC space/venue (by name or reference). Put the reference in "reference".
- "connect_space" -- wants contact info / to connect with whoever manages a specific space. Put the reference in "reference" (null if clearly referring to whoever they're currently viewing).
- "peer_list" -- wants to see/browse peers or practitioners who could support them
- "view_peer" -- asking about ONE SPECIFIC peer (by name, tier, or reference like "the second one"). Put the reference in "reference".
- "connect_peer" -- wants to connect/talk/reach out to a specific peer, or is confirming they want to connect with whoever they were just told about. Put the reference in "reference" (null if clearly referring to whoever they're currently viewing).
- "support_request" -- describing ANY OTHER personal need for support at their centre that doesn't clearly fit the categories above (e.g. "I want to make my play area safer", staffing help, general operational problems). Put their exact message in "freeText".
- "general_question" -- a genuine informational question not covered by the above and not about their own account. Put their exact message in "freeText".
- "unclear" -- genuinely can't tell what they want from this message

Current context for this person:
Courses recently shown to them:
${coursesList}

Peers recently shown to them:
${peersList}
Currently looking at this peer's profile: ${viewing}

Donors/agencies recently shown to them:
${donorsList}
Currently looking at this donor's profile: ${viewingDonor}

Community spaces recently shown to them:
${spacesList}
Currently looking at this space's profile: ${viewingSpace}`;

  const raw = await callClaude(routerPrompt, message, { maxTokens: 300 });
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Failed to parse routing decision: ' + raw);
  }
}

// Matches a natural reference ("the gold tier one", "marizanne", "2")
// against a list of courses/peers shown earlier in the conversation.
// Returns null (rather than guessing) if it can't find a confident,
// unambiguous match -- callers handle that by asking for clarification.
function resolveReference(reference, list, nameOf) {
  if (!reference || !list || list.length === 0) return null;
  const ref = String(reference).trim().toLowerCase();

  if (/^\d+$/.test(ref)) return list[parseInt(ref, 10) - 1] || null;
  const ordinals = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4 };
  if (ordinals[ref] != null) return list[ordinals[ref]] || null;

  const matches = list.filter((item) => {
    const name = nameOf(item).toLowerCase();
    return name.includes(ref) || ref.includes(name);
  });
  return matches.length === 1 ? matches[0] : null;
}

async function handleConversationalFlow(from, trimmed, session) {
  // ---- Mid-flow support-request follow-ups take priority over normal
  // intent classification -- we're already in a specific conversation,
  // so we handle the reply deterministically rather than re-routing it
  // through the general classifier (which has no reliable way to know
  // "yes, log it" or "connect me with someone" means in this context).
  if (session.awaitingSupportDetail) {
    return respondSupportDetail(from, session, trimmed);
  }
  if (session.awaitingSupportChoice) {
    return respondSupportChoice(from, session, trimmed);
  }
  if (session.awaitingDonorChoice) {
    return respondDonorChoice(from, session, trimmed);
  }
  if (session.awaitingDonationDetail) {
    return respondDonationDetail(from, session, trimmed);
  }

  const context = {
    courses: session.lastCourses || [],
    peers: session.lastPeerList || [],
    viewingPeer: session.viewingPeer || null,
    donors: session.lastDonorList || [],
    viewingDonor: session.viewingDonor || null,
    spaces: session.lastSpaceList || [],
    viewingSpace: session.viewingSpace || null,
  };
  const decision = await classifyConversation(trimmed, context);

  switch (decision.intent) {
    case 'greeting':
      return sendWhatsAppMessage(
        from,
        "Hi there! 😊 I'm here to help with training programs, funding/donor connections, community spaces, peer support, and general Bana Pele questions. What can I help you with today?"
      );
    case 'program_question':
      return respondGeneralQuestion(from, decision.freeText || trimmed);
    case 'show_courses':
      return respondShowCourses(from, session);
    case 'enroll_course':
      return respondEnrollCourse(from, session, decision.reference);
    case 'check_status':
      return respondCheckStatus(from, session);
    case 'mark_complete':
      return respondMarkComplete(from, session, decision.reference);
    case 'donor_list':
      return respondDonorNeedStart(from, session, decision.freeText || trimmed);
    case 'view_donor':
      return respondViewDonor(from, session, decision.reference);
    case 'connect_donor':
      return respondConnectContact(from, session, decision.reference, 'donor');
    case 'space_list':
      return respondSpaceList(from, session);
    case 'view_space':
      return respondViewSpace(from, session, decision.reference);
    case 'connect_space':
      return respondConnectContact(from, session, decision.reference, 'space');
    case 'peer_list':
      return respondPeerList(from, session);
    case 'view_peer':
      return respondViewPeer(from, session, decision.reference);
    case 'connect_peer':
      return respondConnectPeer(from, session, decision.reference);
    case 'support_request':
      return respondSupportRequestStart(from, session, decision.freeText || trimmed);
    case 'general_question':
      return respondGeneralQuestion(from, decision.freeText || trimmed);
    case 'unclear':
    default:
      return sendWhatsAppMessage(
        from,
        "I want to make sure I help with the right thing -- are you looking for training programs, funding/donor support, a community space, connecting with a peer, or something else?"
      );
  }
}

async function respondShowCourses(from, session) {
  const courses = await discoverCourses(session.token);
  session.lastCourses = courses.map((c) => ({ id: c.id, name: c.name }));
  if (courses.length === 0) return sendWhatsAppMessage(from, "There aren't any training programs available right now -- check back soon!");
  const lines = courses.map((c) => `- ${c.name}`).join('\n');
  return sendWhatsAppMessage(from, `Here's what's currently available:\n\n${lines}\n\nJust tell me which one you'd like to enroll in, or ask me anything about them!`);
}

async function respondEnrollCourse(from, session, reference) {
  let course = resolveReference(reference, session.lastCourses, (c) => c.name);
  if (!course && (!session.lastCourses || session.lastCourses.length === 0)) {
    const courses = await discoverCourses(session.token);
    session.lastCourses = courses.map((c) => ({ id: c.id, name: c.name }));
    course = resolveReference(reference, session.lastCourses, (c) => c.name);
  }
  if (!course && session.lastCourses.length === 1) course = session.lastCourses[0];
  if (!course) {
    const lines = session.lastCourses.map((c) => `- ${c.name}`).join('\n') || '(none shown yet -- want me to show you what\'s available?)';
    return sendWhatsAppMessage(from, `I'm not totally sure which course you mean. Here's what's available:\n\n${lines}\n\nWhich one would you like to enroll in?`);
  }
  await enrollInCourse(session.token, course.id);
  return sendWhatsAppMessage(from, `Enrollment request sent for "${course.name}" ⏳ — awaiting approval from the training authority. Just ask me anytime to check your status.`);
}

async function respondCheckStatus(from, session) {
  const state = await fetchState(session.token);
  const entries = Object.entries(state.courseProgress || {});
  if (entries.length === 0) return sendWhatsAppMessage(from, "You haven't enrolled in anything yet -- want me to show you what's available?");
  const lines = entries.map(([courseId, progress]) => {
    const name = (session.lastCourses.find((c) => c.id === courseId) || {}).name || courseId;
    return `- ${name}: ${progress.status}`;
  }).join('\n');
  return sendWhatsAppMessage(from, `Here's where things stand for you (currently ${state.tier} tier):\n\n${lines}`);
}

async function respondMarkComplete(from, session, reference) {
  let course = resolveReference(reference, session.lastCourses, (c) => c.name);
  if (!course) {
    const state = await fetchState(session.token);
    const entries = Object.entries(state.courseProgress || {});
    if (entries.length === 1) {
      const [courseId] = entries[0];
      course = (session.lastCourses || []).find((c) => c.id === courseId) || { id: courseId, name: courseId };
    }
  }
  if (!course) return sendWhatsAppMessage(from, "I'm not sure which course you mean -- could you tell me its name, or ask me to check your status first?");
  await markComplete(session.token, course.id);
  return sendWhatsAppMessage(from, `Marked "${course.name}" as complete ✅ — sent to the training authority for approval.`);
}

// Step 1 of the support-request conversation: someone's just described a
// need in passing. Instead of logging it immediately off one message, ask
// them to actually explain the situation, like a person would.
async function respondSupportRequestStart(from, session, initialDescription) {
  session.supportDraftDescription = initialDescription;
  session.awaitingSupportDetail = true;
  return sendWhatsAppMessage(
    from,
    "I'm sorry you're dealing with that. Can you tell me a bit more -- what's actually going on, how long has it been an issue, and what kind of help would make the biggest difference right now?"
  );
}

// Step 2: they've now explained the situation in more detail. Rather than
// silently filing it, ask them directly whether they want it raised as a
// formal request for the team, or would rather be connected with a peer/
// volunteer who might be able to help them right away.
async function respondSupportDetail(from, session, detailText) {
  session.awaitingSupportDetail = false;
  const combined = `${session.supportDraftDescription}\n\nMore detail: ${detailText}`;
  session.supportDraftDescription = combined;
  session.awaitingSupportChoice = true;
  return sendWhatsAppMessage(
    from,
    "Thanks for explaining that. Would you like me to log this as a formal request so our team can follow up, or would you rather I connect you directly with a peer or volunteer who might be able to help right away?"
  );
}

// Classifies a free-form reply to the question above. Kept as a tiny,
// separate Claude call (not folded into the main router) since this is a
// narrow yes/no-ish decision with only 2 real outcomes, and a wrong guess
// here either silently drops a described problem or sends someone into
// the wrong flow -- worth being deliberate and cheap to check.
async function classifySupportChoice(message) {
  const prompt = `The person was just asked: "Would you like me to log this as a formal request, or would you rather I connect you with a peer/volunteer instead?"
Classify their reply as exactly one of these words, nothing else: log_request, connect_volunteer, unclear`;
  try {
    const raw = await callClaude(prompt, message, { maxTokens: 10 });
    const cleaned = raw.trim().toLowerCase();
    if (cleaned.includes('connect')) return 'connect_volunteer';
    if (cleaned.includes('log')) return 'log_request';
    return 'unclear';
  } catch (err) {
    console.error('[wa-bot] support-choice classification failed, defaulting to logging the request:', err.message);
    return 'log_request'; // safest fallback -- never silently lose a described problem
  }
}

// Step 3: acts on their choice. "Connect with a volunteer" reuses the
// existing, already-working peer-connect flow -- a volunteer/peer is the
// same underlying concept in this system, so there's no need for a
// separate mechanism.
async function respondSupportChoice(from, session, replyText) {
  session.awaitingSupportChoice = false;
  const description = session.supportDraftDescription || replyText;
  session.supportDraftDescription = null;

  const choice = await classifySupportChoice(replyText);

  if (choice === 'connect_volunteer') {
    return respondPeerList(from, session);
  }
  if (choice === 'log_request') {
    return respondSupportRequest(from, session, description);
  }

  // Genuinely unclear -- ask again rather than guess, keeping the
  // description around so nothing they already told us gets lost.
  session.supportDraftDescription = description;
  session.awaitingSupportChoice = true;
  return sendWhatsAppMessage(
    from,
    'Sorry, just to make sure I do the right thing -- would you like me to (1) log this as a request for our team, or (2) connect you with a peer/volunteer? Just let me know which one.'
  );
}

async function respondSupportRequest(from, session, description) {
  const reqId = nextCentreRequestId();
  const newRequest = {
    id: reqId,
    learnerPhone: from,
    learnerName: session.name || from,
    description,
    status: 'new',
    assignedPhone: null,
    assignedName: null,
  };
  centreRequests.push(newRequest);
  persistCentreRequest(newRequest);
  if (ADMIN_PHONE) {
    await sendWhatsAppMessage(
      ADMIN_PHONE,
      `📋 New support request ${reqId} from ${session.name || from}:\n"${description}"\n\n` +
        `Reply "assign me ${reqId}" to take it yourself, or "forward ${reqId}" to send it to registered experts.`
    );
  } else {
    console.warn('[wa-bot] ADMIN_PHONE not set -- new centre request created but nobody was notified:', reqId);
  }
  return sendWhatsAppMessage(from, "Thanks! We've noted what you need help with, and someone from our team will reach out here soon.");
}

// Step 1: someone's just described a donation need. Ask for the actual
// detail first -- what's needed and by when -- same order as the
// general support-request flow, so the choice question that follows
// actually has something concrete to be a choice ABOUT.
async function respondDonorNeedStart(from, session, initialDescription) {
  session.donationDraftDescription = initialDescription;
  session.awaitingDonationDetail = true;
  return sendWhatsAppMessage(
    from,
    "I can help with that. Could you tell me exactly what's needed and by when? For example: \"shoes and bags for 15 students, needed by 15 August\" or \"donation of ₹5000 by 10 August\"."
  );
}

// Pulls a rough amount/deadline/region out of the person's free-form
// detail message, for display in the NGO's own dashboard. Best-effort --
// if extraction fails for any reason, the full raw text is still sent
// through as the request description, so nothing gets lost either way.
async function extractDonationDetails(text) {
  const prompt = `Extract structured details from this donation request. Respond with ONLY a JSON object, nothing else, in exactly this shape:
{"amount": "...", "deadline": "...", "region": "..."}
Use an empty string for anything not mentioned. Do not include any other text, explanation, or markdown formatting.`;
  try {
    const raw = await callClaude(prompt, text, { maxTokens: 150 });
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      amount: parsed.amount || '',
      deadline: parsed.deadline || '',
      region: parsed.region || '',
    };
  } catch (err) {
    console.error('[wa-bot] failed to extract donation details, sending raw text only:', err.message);
    return { amount: '', deadline: '', region: '' };
  }
}

// Decides whether the detail given so far is actually specific enough
// to act on (some concrete idea of what's needed, plus a rough
// timeframe) -- rather than just accepting whatever comes back. If not,
// it also writes the natural follow-up question itself, so the
// conversation stays adaptive instead of repeating a canned prompt.
async function assessDonationDetailSufficiency(text) {
  const prompt = `A learner is raising a donation request and was asked what's needed and by when. Here is everything they've said so far, combined:
"""
${text}
"""
Decide if this gives enough concrete detail to actually act on -- ideally SOME specific idea of what's needed (an item, quantity, or amount) AND a rough timeframe/deadline (even an approximate one like "soon" or "this month" counts).
Respond with ONLY a JSON object, nothing else, in exactly this shape:
{"sufficient": true or false, "followUp": "a short, natural, friendly follow-up question asking specifically for whatever is missing -- empty string if sufficient"}`;
  try {
    const raw = await callClaude(prompt, text, { maxTokens: 200 });
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { sufficient: !!parsed.sufficient, followUp: parsed.followUp || '' };
  } catch (err) {
    console.error('[wa-bot] failed to assess donation detail sufficiency, proceeding anyway:', err.message);
    return { sufficient: true, followUp: '' }; // fail open -- a classification hiccup shouldn't trap someone in a loop
  }
}

// Step 2: they've now given some detail. If it's still too vague (e.g.
// just repeating the original need with no item, amount, or timeframe),
// ask a natural follow-up and stay in this same step rather than moving
// on -- otherwise ask the choice: donor contact info, or a formal
// request that also reaches the region's NGO directly.
async function respondDonationDetail(from, session, detailText) {
  const combined = `${session.donationDraftDescription || ''}\n${detailText}`.trim();

  const assessment = await assessDonationDetailSufficiency(combined);
  if (!assessment.sufficient) {
    session.donationDraftDescription = combined;
    return sendWhatsAppMessage(
      from,
      assessment.followUp || "Could you share a bit more detail -- specifically what's needed and roughly by when?"
    );
  }

  session.awaitingDonationDetail = false;
  session.donationDraftDescription = null;
  session.donationFullDescription = combined;
  session.donationParsedDetails = await extractDonationDetails(combined);
  session.awaitingDonorChoice = true;
  return sendWhatsAppMessage(
    from,
    "Thanks. Would you like me to share contact info for donors/agencies so you can reach out yourself, or would you rather I raise a formal request that goes straight to your region's NGO and our team?"
  );
}

// Narrow, deliberate classification for this specific yes/no-ish
// question -- same reasoning as classifySupportChoice: a wrong guess
// here either drops a described need or sends someone down the wrong
// path, so it's worth a small dedicated check rather than folding it
// into the general router.
async function classifyDonorChoice(message) {
  const prompt = `The person was just asked: "Would you like donor contact info, or would you rather I raise a formal donation request to the NGO and our team?"
Classify their reply as exactly one of these words, nothing else: show_donors, raise_request, unclear`;
  try {
    const raw = await callClaude(prompt, message, { maxTokens: 10 });
    const cleaned = raw.trim().toLowerCase();
    if (cleaned.includes('raise') || cleaned.includes('request')) return 'raise_request';
    if (cleaned.includes('donor') || cleaned.includes('contact') || cleaned.includes('show')) return 'show_donors';
    return 'unclear';
  } catch (err) {
    console.error('[wa-bot] donor-choice classification failed, defaulting to showing the donor list:', err.message);
    return 'show_donors'; // safest fallback -- the least disruptive path
  }
}

// Step 3: acts on their choice. "Raise a request" is the one that
// actually reaches the NGO -- notifies our own team exactly like
// before, AND starts a real Beckn transaction (init -> confirm) with
// the NGO's own BPP via demo-bap. The NGO accepting or paying comes
// back later as a separate WhatsApp message, relayed through demo-bap's
// on_update handling -- not synchronously from this reply.
async function respondDonorChoice(from, session, replyText) {
  session.awaitingDonorChoice = false;
  const fullDescription = session.donationFullDescription || replyText;
  const parsed = session.donationParsedDetails || { amount: '', deadline: '', region: '' };
  session.donationFullDescription = null;
  session.donationParsedDetails = null;

  const choice = await classifyDonorChoice(replyText);

  if (choice === 'show_donors') {
    return respondDonorList(from, session);
  }

  if (choice === 'raise_request') {
    // Shows up in the same Provider App dashboard as any other request --
    // this is the actual "goes to the provider app" mechanism (a
    // persisted record the dashboard reads), separate from and not
    // requiring any WhatsApp message to ADMIN_PHONE.
    const reqId = nextCentreRequestId();
    const newRequest = {
      id: reqId,
      learnerPhone: from,
      learnerName: session.name || from,
      description: `[Donation request] ${fullDescription}`,
      status: 'new',
      assignedPhone: null,
      assignedName: null,
    };
    centreRequests.push(newRequest);
    persistCentreRequest(newRequest);

    try {
      await bapFetch('/api/trigger/donation-request', {
        method: 'POST',
        token: session.token,
        body: {
          description: fullDescription,
          amount: parsed.amount,
          deadline: parsed.deadline,
          region: parsed.region,
          crId: reqId,
        },
      });
      return sendWhatsAppMessage(
        from,
        `Thanks! Your request (${reqId}) has been sent to our team and to the NGO covering your region. I'll message you here as soon as they respond or complete the donation. You can mention ${reqId} if you ever need to follow up on it.`
      );
    } catch (err) {
      console.error('[wa-bot] failed to trigger NGO donation request:', err.message);
      return sendWhatsAppMessage(
        from,
        `I've noted your request (${reqId}) for our team, but I had trouble reaching the NGO system just now -- I'll keep trying and let you know here.`
      );
    }
  }

  // Genuinely unclear -- ask again rather than guess, keeping
  // everything gathered so far so nothing gets lost.
  session.donationFullDescription = fullDescription;
  session.donationParsedDetails = parsed;
  session.awaitingDonorChoice = true;
  return sendWhatsAppMessage(
    from,
    'Sorry, just to make sure I do the right thing -- would you like (1) donor contact info, or (2) a formal request raised with the NGO and our team? Let me know which.'
  );
}

async function respondDonorList(from, session) {
  const donorList = await discoverDonors(session.token);
  session.lastDonorList = donorList;
  session.viewingDonor = null;
  if (donorList.length === 0) return sendWhatsAppMessage(from, "There aren't any donors or support agencies listed yet -- check back soon!");
  const lines = donorList.map((d) => `- ${d.name} (${d.supportType || 'support type not specified'})`).join('\n');
  return sendWhatsAppMessage(from, `Here are some donors/agencies that may be able to help:\n\n${lines}\n\nJust tell me who you'd like to know more about, or ask me to connect you with one of them!`);
}

async function respondViewDonor(from, session, reference) {
  let donor = resolveReference(reference, session.lastDonorList, (d) => d.name);
  if (!donor) {
    const donorList = await discoverDonors(session.token);
    session.lastDonorList = donorList;
    donor = resolveReference(reference, donorList, (d) => d.name);
  }
  if (!donor) return sendWhatsAppMessage(from, "I'm not sure which donor/agency you mean -- want me to show you the list again?");
  session.viewingDonor = donor;
  const lines = [`${donor.name}`];
  if (donor.supportType) lines.push(`Support type: ${donor.supportType}`);
  if (donor.area) lines.push(`Area: ${donor.area}`);
  if (donor.description) lines.push(donor.description);
  lines.push('', "Just let me know if you'd like their contact details, or ask me about someone else!");
  return sendWhatsAppMessage(from, lines.join('\n'));
}

async function respondSpaceList(from, session) {
  const spaceList = await discoverSpaces(session.token);
  session.lastSpaceList = spaceList;
  session.viewingSpace = null;
  if (spaceList.length === 0) return sendWhatsAppMessage(from, "There aren't any community spaces listed yet -- check back soon!");
  const lines = spaceList.map((s) => `- ${s.name} (${s.spaceType || 'type not specified'}${s.area ? ', ' + s.area : ''})`).join('\n');
  return sendWhatsAppMessage(from, `Here are some spaces you could use:\n\n${lines}\n\nJust tell me which one you'd like to know more about, or ask me to connect you with them!`);
}

async function respondViewSpace(from, session, reference) {
  let space = resolveReference(reference, session.lastSpaceList, (s) => s.name);
  if (!space) {
    const spaceList = await discoverSpaces(session.token);
    session.lastSpaceList = spaceList;
    space = resolveReference(reference, spaceList, (s) => s.name);
  }
  if (!space) return sendWhatsAppMessage(from, "I'm not sure which space you mean -- want me to show you the list again?");
  session.viewingSpace = space;
  const lines = [`${space.name}`];
  if (space.spaceType) lines.push(`Type: ${space.spaceType}`);
  if (space.area) lines.push(`Area: ${space.area}`);
  if (space.address) lines.push(`Address: ${space.address}`);
  if (space.capacity) lines.push(`Capacity: ${space.capacity}`);
  if (space.availability) lines.push(`Availability: ${space.availability}`);
  lines.push('', "Just let me know if you'd like their contact details, or ask me about somewhere else!");
  return sendWhatsAppMessage(from, lines.join('\n'));
}

// Donors and spaces aren't WhatsApp bot users like peers are -- they're
// provider-entered directory listings with their own contact details
// already attached. "Connecting" just means handing those details over
// directly, not starting a live in-bot chat.
async function respondConnectContact(from, session, reference, kind) {
  const isDonor = kind === 'donor';
  const list = isDonor ? session.lastDonorList : session.lastSpaceList;
  const viewing = isDonor ? session.viewingDonor : session.viewingSpace;
  let entry = resolveReference(reference, list, (x) => x.name);
  if (!entry && viewing) entry = viewing;
  if (!entry) {
    const fresh = isDonor ? await discoverDonors(session.token) : await discoverSpaces(session.token);
    if (isDonor) session.lastDonorList = fresh;
    else session.lastSpaceList = fresh;
    entry = resolveReference(reference, fresh, (x) => x.name);
  }
  if (!entry) {
    return sendWhatsAppMessage(from, `I'm not sure which ${isDonor ? 'donor' : 'space'} you mean -- want me to show you the list again?`);
  }
  const contactLines = [`Here's how to reach ${entry.name}:`];
  if (isDonor) {
    if (entry.contactPhone) contactLines.push(`📞 ${entry.contactPhone}`);
    if (entry.contactEmail) contactLines.push(`✉️ ${entry.contactEmail}`);
  } else {
    if (entry.contactName) contactLines.push(`Contact: ${entry.contactName}`);
    if (entry.contactPhone) contactLines.push(`📞 ${entry.contactPhone}`);
  }
  if (contactLines.length === 1) contactLines.push("We don't have direct contact details on file yet -- our team can help facilitate an introduction instead.");
  return sendWhatsAppMessage(from, contactLines.join('\n'));
}

async function respondPeerList(from, session) {
  const peers = await discoverPeers(session.token);
  session.lastPeerList = peers;
  session.viewingPeer = null;
  if (peers.length === 0) return sendWhatsAppMessage(from, "There aren't any peers available yet -- check back soon!");
  const lines = peers
    .map((p) => {
      const tier = p.tier ? `${p.tier} tier` : '';
      const area = p.area ? `, ${p.area}` : '';
      return `- ${p.name} (${tier}${area})`;
    })
    .join('\n');
  return sendWhatsAppMessage(from, `Here are some people you could connect with for support:\n\n${lines}\n\nJust tell me who you'd like to know more about, or say you'd like to connect with one of them!`);
}

async function respondViewPeer(from, session, reference) {
  let peer = resolveReference(reference, session.lastPeerList, (p) => p.name);
  if (!peer) {
    const peers = await discoverPeers(session.token);
    session.lastPeerList = peers;
    peer = resolveReference(reference, peers, (p) => p.name);
  }
  if (!peer) return sendWhatsAppMessage(from, "I'm not sure who you mean -- want me to show you the list of peers again?");
  session.viewingPeer = peer;
  const profile = formatPeerProfile(peer).replace(
    'Reply "connect" to request to connect with them, or 0 to go back to the peer list.',
    "Just let me know if you'd like to connect with them, or ask me about someone else!"
  );
  return sendWhatsAppMessage(from, profile);
}

async function respondConnectPeer(from, session, reference) {
  let peer = resolveReference(reference, session.lastPeerList, (p) => p.name);
  if (!peer && session.viewingPeer) peer = session.viewingPeer;
  if (!peer) {
    const peers = await discoverPeers(session.token);
    session.lastPeerList = peers;
    peer = resolveReference(reference, peers, (p) => p.name);
  }
  if (!peer) return sendWhatsAppMessage(from, "I'm not sure who you'd like to connect with -- want me to show you the list of peers?");
  session.viewingPeer = null;
  return requestPeerConnect(from, session.name || from, peer);
}

async function respondGeneralQuestion(from, question) {
  try {
    const reply = await callClaude(GENERAL_SYSTEM_PROMPT, question, { useWebSearch: true });
    logQA(from, question, reply); // fire-and-forget, never blocks the reply
    return sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error('[wa-bot] general question failed:', err.message);
    return sendWhatsAppMessage(from, "Sorry, I'm having trouble answering that right now -- could you try again in a moment?");
  }
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

// Same real Beckn discover action as courses, just asking for a
// different category. course-bpp responds with a directory of
// practitioners the PROVIDER has set a peer-support profile for --
// this bot never stores or manages peer data itself.
async function discoverPeers(token) {
  await bapFetch('/api/trigger/discover', { method: 'POST', token, body: { category: 'peers' } });
  await sleep(900);
  const state = await bapFetch('/api/state', { token });
  return state.peerCatalog || [];
}

// Same idea again, for donors and community spaces -- both are
// provider-managed directories course-bpp exposes via the same real
// Beckn discover action, just a different category each time.
async function discoverDonors(token) {
  await bapFetch('/api/trigger/discover', { method: 'POST', token, body: { category: 'donors' } });
  await sleep(900);
  const state = await bapFetch('/api/state', { token });
  return state.donorCatalog || [];
}

async function discoverSpaces(token) {
  await bapFetch('/api/trigger/discover', { method: 'POST', token, body: { category: 'spaces' } });
  await sleep(900);
  const state = await bapFetch('/api/state', { token });
  return state.spaceCatalog || [];
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
  persistCentreRequest(req);

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
  '3️⃣ Get help setting up a learning centre\n' +
  '4️⃣ Connect with a peer for support\n\n' +
  'Reply with 1, 2, 3, or 4, or type "menu" anytime to see this again.';

// Wraps the real handler so the session gets saved to the database
// exactly once per incoming message, no matter which branch below
// actually handled it (there are many early "return"s inside).
async function handleIncomingMessage(from, text) {
  try {
    return await handleIncomingMessageInner(from, text);
  } finally {
    const session = sessions.get(from);
    if (session) persistSession(from, session);
  }
}

async function handleIncomingMessageInner(from, text) {
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
      if (req) {
        req.status = 'closed';
        persistCentreRequest(req);
      }
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
      const expert = { phone: expertPhone, name: expertName.trim() };
      experts.set(expertPhone, expert);
      displayNames.set(expertPhone, expertName.trim());
      persistExpert(expert);
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

  // ---- Peer-connect responses: "accept <id>" / "decline <id>" -- a
  // peer is just a real practitioner (not necessarily a registered
  // centre-setup expert), so these are checked independently of the
  // `experts` list below. ----
  const acceptMatch = trimmed.match(/^accept\s+(\S+)$/i);
  if (acceptMatch) {
    const id = acceptMatch[1];
    if (peerConnectRequests.some((r) => r.id === id && r.peerPhone === from)) {
      return handlePeerAccept(id, from);
    }
    // Fall through to the centre-setup "expert accepts a forwarded
    // request" meaning, which DOES require being a registered expert.
    if (experts.has(from)) {
      return handleAssign(id, from, experts.get(from).name);
    }
  }
  const declineMatch = trimmed.match(/^decline\s+(\S+)$/i);
  if (declineMatch && peerConnectRequests.some((r) => r.id === declineMatch[1] && r.peerPhone === from)) {
    return handlePeerDecline(declineMatch[1], from);
  }

  const session = await ensureLoggedIn(from);
  displayNames.set(from, session.name || from);

  if (ANTHROPIC_API_KEY) {
    try {
      return await handleConversationalFlow(from, trimmed, session);
    } catch (err) {
      console.error('[wa-bot] conversational flow failed, falling back to menu flow:', err.message);
      // fall through to the old, fully deterministic menu flow below so
      // a routing failure never leaves the learner with no response
    }
  }

  return handleMenuDrivenFlow(from, trimmed, lower, session);
}

// ---- Old, fully menu-driven flow (numbers, exact keywords). Kept as a
// complete, working fallback for when ANTHROPIC_API_KEY isn't set, or if
// the conversational router itself fails for some reason -- the bot
// should never go silent just because the AI layer had a problem. ----
async function handleMenuDrivenFlow(from, trimmed, lower, session) {
  // A learner just replied with their centre-help description (free text,
  // right after choosing option 3). Checked before any digit/menu logic
  // since the description itself might just be a number or short word.
  if (session.awaitingCentreDescription) {
    session.awaitingCentreDescription = false;

    // If the very next message is clearly someone backing out ("menu",
    // "hi", "cancel", etc.) rather than actually describing what help
    // they need, just show the menu instead of treating those words as
    // their centre-help description.
    const cancelWords = ['menu', 'hi', 'hello', 'hey', 'start', 'cancel', 'no', 'nevermind', 'never mind'];
    if (cancelWords.includes(lower)) {
      session.awaitingPeerSelection = false;
      session.viewingPeer = null;
      return sendWhatsAppMessage(from, MENU_TEXT);
    }

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
    const newRequest = {
      id: reqId,
      learnerPhone: from,
      learnerName: session.name || from,
      description: trimmed,
      status: 'new',
      assignedPhone: null,
      assignedName: null,
    };
    centreRequests.push(newRequest);
    persistCentreRequest(newRequest);
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

  // A learner is currently looking at one specific peer's profile
  // (just picked a number from a freshly-fetched peer list) -- expects
  // either "connect" or "0" to go back.
  if (session.viewingPeer) {
    const peer = session.viewingPeer;
    if (lower === 'connect') {
      session.viewingPeer = null;
      await requestPeerConnect(from, session.name || from, peer);
      return;
    }
    if (trimmed === '0') {
      session.viewingPeer = null;
      session.awaitingPeerSelection = true;
      const lines = session.lastPeerList.map((p, i) => formatPeerListLine(i, p)).join('\n');
      return sendWhatsAppMessage(from, `Available peers:\n\n${lines}\n\nReply with a number to see their profile, or 0 to go back to the menu.`);
    }
    return sendWhatsAppMessage(from, 'Reply "connect" to request to connect with them, or 0 to go back to the peer list.');
  }

  // A learner just saw the peer list and is picking a number (or 0 to
  // cancel back to the main menu).
  if (session.awaitingPeerSelection && /^\d+$/.test(trimmed)) {
    session.awaitingPeerSelection = false;
    if (trimmed === '0') return sendWhatsAppMessage(from, MENU_TEXT);
    const idx = parseInt(trimmed, 10) - 1;
    const peer = session.lastPeerList[idx];
    if (!peer) return sendWhatsAppMessage(from, "I don't recognize that number. Type 4 to see the peer list again.");
    session.viewingPeer = peer;
    return sendWhatsAppMessage(from, formatPeerProfile(peer));
  }

  // "complete 2" -> mark the 2nd listed course as complete
  const completeMatch = lower.match(/^complete\s+(\d+)$/);
  if (completeMatch) {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    session.awaitingPeerSelection = false;
    session.viewingPeer = null;
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
    session.awaitingPeerSelection = false;
    session.viewingPeer = null;
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
    session.awaitingPeerSelection = false;
    session.viewingPeer = null;
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
    session.awaitingPeerSelection = false;
    session.viewingPeer = null;
    session.awaitingCentreDescription = true;
    return sendWhatsAppMessage(
      from,
      'Tell me a bit about what help you need setting up your learning centre (e.g. funding, finding a location, curriculum, staffing) — just describe it in your own words.'
    );
  }

  if (trimmed === '4') {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    session.viewingPeer = null;
    const peers = await discoverPeers(session.token);
    if (peers.length === 0) {
      session.awaitingPeerSelection = false;
      return sendWhatsAppMessage(from, 'No peers are available yet -- check back soon!');
    }
    session.lastPeerList = peers;
    session.awaitingPeerSelection = true;
    const lines = peers.map((p, i) => formatPeerListLine(i, p)).join('\n');
    return sendWhatsAppMessage(from, `Available peers:\n\n${lines}\n\nReply with a number to see their profile, or 0 to go back to the menu.`);
  }

  if (['hi', 'hello', 'menu', 'hey', 'start'].includes(lower)) {
    session.awaitingCourseSelection = false;
    session.awaitingCentreDescription = false;
    session.awaitingPeerSelection = false;
    session.viewingPeer = null;
    return sendWhatsAppMessage(from, MENU_TEXT);
  }

  if (ANTHROPIC_API_KEY) {
    try {
      const reply = await callClaude(GENERAL_SYSTEM_PROMPT, trimmed, { useWebSearch: true });
      logQA(from, trimmed, reply); // fire-and-forget, never blocks the reply
      session.awaitingCourseSelection = false;
      session.awaitingCentreDescription = false;
      session.awaitingPeerSelection = false;
      session.viewingPeer = null;
      return sendWhatsAppMessage(from, reply);
    } catch (err) {
      console.error('[wa-bot] Claude fallback failed, using generic message:', err.message);
      // fall through to the generic message below
    }
  }

  session.awaitingCourseSelection = false;
  session.awaitingCentreDescription = false;
  session.awaitingPeerSelection = false;
  session.viewingPeer = null;
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

  // demo-bap calls this when the NGO accepts/pays a donation request, so
  // the SAME dashboard entry gets updated instead of sitting as "new"
  // forever even after the NGO has already acted on it. Matched by the
  // CR tracking id generated when the request was first raised.
  if (req.method === 'POST' && url.pathname === '/api/internal/update-request-status') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      const { id, label } = parsed;
      const request = centreRequests.find((r) => r.id === id);
      if (!request) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request not found' }));
        return;
      }
      // Prefixing the description guarantees this is visible in the
      // dashboard regardless of whether its UI has any special handling
      // for a status value it doesn't already recognize.
      if (!request.description.startsWith(`[${label}]`)) {
        request.description = `[${label}] ${request.description}`;
      }
      if (label === 'NGO paid') request.status = 'closed';
      persistCentreRequest(request);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'updated', request }));
    });
    return;
  }

  // demo-bap calls this to relay an on_update push (NGO accepted/paid)
  // into an actual WhatsApp message -- this bot owns the only real
  // connection to the Meta API, so demo-bap can't send messages itself.
  // Not authenticated -- this is server-to-server on a private network
  // (Render's internal routing / same trust boundary as the rest of
  // this demo); revisit if this ever needs to be exposed more broadly.
  if (req.method === 'POST' && url.pathname === '/api/internal/notify') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      const { phone, message } = parsed;
      if (!phone || !message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'phone and message are both required' }));
        return;
      }
      sendWhatsAppMessage(phone, message)
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent' }));
        })
        .catch((err) => {
          console.error('[wa-bot] failed to relay internal notify:', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ---- Load everything from the database at startup ----
async function loadStateFromDb() {
  if (!SUPABASE_URL) {
    console.log('[wa-bot] SUPABASE_URL not set -- running in-memory only, data will not persist across restarts');
    return;
  }

  const dbSessions = await dbSelect('wa_sessions');
  dbSessions.forEach((row) => {
    sessions.set(row.phone, {
      token: row.token,
      name: row.name,
      lastCourses: row.last_courses || [],
      // Deliberately NOT restored from the database -- these represent
      // "I just asked a single-message follow-up question" state, not
      // durable identity/history. Restoring them after a restart caused
      // a real bug: a stale "waiting for centre description" flag made
      // an unrelated later message (e.g. "Hi") get misread as the
      // answer to a question from days earlier.
      awaitingCourseSelection: false,
      awaitingCentreDescription: false,
    });
  });

  const dbExperts = await dbSelect('wa_experts');
  dbExperts.forEach((row) => {
    experts.set(row.phone, { phone: row.phone, name: row.name });
    displayNames.set(row.phone, row.name);
  });

  const dbCentreRequests = await dbSelect('centre_requests');
  dbCentreRequests.forEach((row) => {
    centreRequests.push({
      id: row.id,
      learnerPhone: row.learner_phone,
      learnerName: row.learner_name,
      description: row.description,
      status: row.status,
      assignedPhone: row.assigned_phone,
      assignedName: row.assigned_name,
    });
    // Rebuild the live chat-relay routing table for any request that
    // was still actively "assigned" (mid-chat) when the server last
    // stopped, so an in-progress conversation can pick back up.
    if (row.status === 'assigned' && row.learner_phone && row.assigned_phone) {
      chatPartners.set(row.learner_phone, row.assigned_phone);
      chatPartners.set(row.assigned_phone, row.learner_phone);
    }
    // Keep new request IDs (CR1, CR2, ...) counting up from the
    // highest one already saved, so restarts never reuse an old id.
    const match = /^CR(\d+)$/.exec(row.id);
    if (match) centreRequestCounter = Math.max(centreRequestCounter, parseInt(match[1], 10));
  });

  const dbPeerConnectRequests = await dbSelect('peer_connect_requests');
  dbPeerConnectRequests.forEach((row) => {
    peerConnectRequests.push({
      id: row.id,
      learnerPhone: row.learner_phone,
      learnerName: row.learner_name,
      peerPhone: row.peer_phone,
      peerName: row.peer_name,
      status: row.status,
    });
    if (row.status === 'accepted' && row.learner_phone && row.peer_phone) {
      chatPartners.set(row.learner_phone, row.peer_phone);
      chatPartners.set(row.peer_phone, row.learner_phone);
    }
    const peerMatch = /^PC(\d+)$/.exec(row.id);
    if (peerMatch) peerConnectCounter = Math.max(peerConnectCounter, parseInt(peerMatch[1], 10));
  });

  console.log(
    `[wa-bot] loaded from database: ${sessions.size} session(s), ${experts.size} expert(s), ${centreRequests.length} centre request(s), ${peerConnectRequests.length} peer-connect request(s)`
  );
}

loadStateFromDb().then(() => {
  server.listen(PORT, () => {
    console.log(`[wa-bot] listening on port ${PORT}, forwarding to ${BAP_BASE_URL}`);
  });
});
