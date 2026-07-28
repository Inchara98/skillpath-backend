// All data on this page is mock/hardcoded -- there is no backend for ELPs,
// support requests, or notifications anywhere in this project yet. This
// mirrors the reference design's data exactly so the UI can be built and
// verified before any real API exists.

export type ElpTier = 'Pre-Bronze' | 'Bronze' | 'Silver' | 'Gold'
export type ElpSupportStatus = 'active' | 'none' | 'followup'
export type ElpType = 'Centre-Based' | 'Non-Centre-Based'

export interface Elp {
  id: string
  name: string
  location: string
  tier: ElpTier
  type: ElpType
  // Whether this ELP is in the signed-in org's own portfolio ("My ELPs")
  // vs. only discoverable ("Search ELPs").
  myElp: boolean
  supportStatus?: ElpSupportStatus
  stats?: { requests: number; done: number; active: number; pending: number }
  lastEngagement?: string
}

export const elps: Elp[] = [
  {
    id: 'ELP-SOW-0042',
    name: 'Sunshine ELP',
    location: 'Soweto, Gauteng',
    tier: 'Bronze',
    type: 'Centre-Based',
    myElp: true,
    supportStatus: 'active',
    stats: { requests: 6, done: 3, active: 2, pending: 1 },
    lastEngagement: '2 days ago',
  },
  {
    id: 'ELP-ALE-0018',
    name: 'Little Stars ELP',
    location: 'Alexandra, Gauteng',
    tier: 'Silver',
    type: 'Centre-Based',
    myElp: true,
    supportStatus: 'none',
    stats: { requests: 4, done: 4, active: 0, pending: 0 },
    lastEngagement: '2 weeks ago',
  },
  {
    id: 'ELP-RAN-0033',
    name: 'Happy Kids Centre',
    location: 'Randburg, Gauteng',
    tier: 'Bronze',
    type: 'Centre-Based',
    myElp: true,
    supportStatus: 'active',
    stats: { requests: 3, done: 1, active: 2, pending: 0 },
    lastEngagement: 'Today',
  },
  {
    id: 'ELP-SOW-0055',
    name: 'Bright Beginnings',
    location: 'Soweto, Gauteng',
    tier: 'Bronze',
    type: 'Non-Centre-Based',
    myElp: true,
    supportStatus: 'followup',
    stats: { requests: 2, done: 1, active: 0, pending: 1 },
    lastEngagement: '5 days ago',
  },
  {
    id: 'ELP-TEM-0021',
    name: "Thandi's Playgroup",
    location: 'Tembisa, Gauteng',
    tier: 'Bronze',
    type: 'Non-Centre-Based',
    myElp: true,
    supportStatus: 'none',
    stats: { requests: 1, done: 0, active: 0, pending: 1 },
    lastEngagement: '1 week ago',
  },
  {
    id: 'ELP-LIM-0009',
    name: 'Siyakhula Early Learning',
    location: 'Polokwane, Limpopo',
    tier: 'Bronze',
    type: 'Centre-Based',
    myElp: true,
    supportStatus: 'followup',
    stats: { requests: 3, done: 2, active: 0, pending: 1 },
    lastEngagement: '4 days ago',
  },
  { id: 'ELP-DBN-0062', name: 'Ubuntu Early Learning', location: 'Durban, KwaZulu-Natal', tier: 'Bronze', type: 'Centre-Based', myElp: false },
  { id: 'ELP-CPT-0014', name: 'Rainbow ELP', location: 'Cape Town, Western Cape', tier: 'Silver', type: 'Centre-Based', myElp: false },
  { id: 'ELP-ECB-0031', name: 'Ukwanda ELP', location: 'Mthatha, Eastern Cape', tier: 'Pre-Bronze', type: 'Non-Centre-Based', myElp: false },
  { id: 'ELP-NWP-0007', name: 'Kganya Learning Centre', location: 'Mahikeng, North West', tier: 'Bronze', type: 'Centre-Based', myElp: false },
  { id: 'ELP-NWR-0044', name: 'Masedi Early Learning', location: 'Rustenburg, North West', tier: 'Pre-Bronze', type: 'Non-Centre-Based', myElp: false },
  { id: 'ELP-BFN-0022', name: 'Lethiwe ELP', location: 'Bloemfontein, Free State', tier: 'Bronze', type: 'Centre-Based', myElp: false },
]

export const ELP_STATUS_META: Record<ElpSupportStatus, { label: string; className: string }> = {
  active: { label: 'Active support', className: 'bg-violet-100 text-violet-700' },
  none: { label: 'No active support', className: 'bg-gray-100 text-gray-600' },
  followup: { label: 'Follow-up required', className: 'bg-amber-100 text-amber-700' },
}

export const supportTypes = [
  'Document Pack - Admin',
  'Equipment',
  'H&S pack',
  'Infrastructure - Water & Sanitation',
  'Infrastructure - Light',
  'Infrastructure - Structure',
  'Nutrition support',
  'Wages',
  'Document Pack - Programme',
  'LTSM',
  'Approved ECD Training Course',
  'Child Safety Training',
  'First Aid Training',
  'Health & Hygiene Training',
  'Implementing policies Training',
]

export type Priority = 'high' | 'medium' | 'low'

export interface ActionBadge {
  label: string
  className: string
}

export interface ActionItem {
  id: string
  org: string
  location: string
  badges: ActionBadge[]
  title: string
  category: string
  description: string
  timing: string
  buttonLabel: string
  priority: Priority
  meta?: string
  chips?: string[]
}

const badgeStyles = {
  newRequest: 'bg-violet-100 text-violet-700',
  reportsEvidence: 'bg-sky-100 text-sky-700',
  followUp: 'bg-amber-100 text-amber-700',
  verification: 'bg-teal-100 text-teal-700',
  dataUpdate: 'bg-gray-100 text-gray-700',
  batchRequest: 'bg-indigo-100 text-indigo-700',
  inProgress: 'bg-blue-100 text-blue-700',
  singleRequest: 'bg-sky-100 text-sky-700',
}

export const actionItems: ActionItem[] = [
  {
    id: 'a1',
    org: 'Sunshine ELP',
    location: 'Soweto',
    badges: [
      { label: 'New request', className: badgeStyles.newRequest },
      { label: 'Single Request', className: badgeStyles.singleRequest },
    ],
    title: 'Sunshine ELP needs infrastructure support',
    category: 'Infrastructure - Structure',
    description: 'A child-safe entrance upgrade was submitted by the ELP practitioner.',
    timing: 'Received today',
    buttonLabel: 'Review request',
    priority: 'high',
  },
  {
    id: 'a2',
    org: 'Bright Beginnings',
    location: 'Soweto',
    badges: [
      { label: 'Reports & evidence', className: badgeStyles.reportsEvidence },
      { label: 'Single Request', className: badgeStyles.singleRequest },
    ],
    title: 'Completion evidence is missing',
    category: 'Infrastructure - Structure',
    description: 'The entrance upgrade was marked complete, but no photographs or completion report were submitted.',
    timing: 'Overdue by 3 days',
    buttonLabel: 'Request evidence',
    priority: 'high',
  },
  {
    id: 'a3',
    org: 'Happy Kids Centre',
    location: 'Randburg',
    badges: [
      { label: 'Follow-up', className: badgeStyles.followUp },
      { label: 'Single Request', className: badgeStyles.singleRequest },
    ],
    title: 'Nutrition delivery requires follow-up',
    category: 'Nutrition support',
    description: 'Delivery was expected today, but the fulfilment partner has not confirmed completion.',
    timing: 'Due today',
    buttonLabel: 'Follow up',
    priority: 'medium',
  },
  {
    id: 'a4',
    org: 'Little Stars ELP',
    location: 'Alexandra',
    badges: [
      { label: 'Verification', className: badgeStyles.verification },
      { label: 'Single Request', className: badgeStyles.singleRequest },
    ],
    title: 'Safety improvement is ready to verify',
    category: 'H&S pack',
    description: '',
    timing: 'Received 2 days ago',
    buttonLabel: 'Review and verify',
    priority: 'medium',
  },
  {
    id: 'a5',
    org: '',
    location: '',
    badges: [
      { label: 'Batch Request', className: badgeStyles.batchRequest },
      { label: 'New request', className: badgeStyles.newRequest },
    ],
    title: 'First-aid training — Limpopo cohort',
    category: 'Limpopo Province · First Aid Training',
    description: '',
    timing: 'Received 2 days ago',
    buttonLabel: 'Review batch',
    priority: 'medium',
    meta: '8 ELPs · 3 in My ELPs',
    chips: ['Support eligible ELPs', 'Invite collaborator', 'Resolve overlap', 'Request information'],
  },
  {
    id: 'a6',
    org: '',
    location: '',
    badges: [
      { label: 'Batch Request', className: badgeStyles.batchRequest },
      { label: 'In progress', className: badgeStyles.inProgress },
    ],
    title: 'Batch nutrition programme — Soweto cluster',
    category: 'Soweto, Gauteng · Nutrition support',
    description: '',
    timing: 'Updated today',
    buttonLabel: 'Follow up',
    priority: 'medium',
    meta: '3 ELPs · 2 in My ELPs',
    chips: ['Support eligible ELPs', 'Invite collaborator'],
  },
  {
    id: 'a7',
    org: "Thandi's Playgroup",
    location: 'Tembisa',
    badges: [
      { label: 'Data update', className: badgeStyles.dataUpdate },
      { label: 'Single Request', className: badgeStyles.singleRequest },
    ],
    title: 'Contact details may have changed',
    category: 'Document Pack - Admin',
    description: 'The practitioner submitted an update from a new contact number.',
    timing: 'Received yesterday',
    buttonLabel: 'Confirm update',
    priority: 'low',
  },
]

export const statTiles = [
  { value: 8, label: 'New support requests', className: 'text-violet-600' },
  { value: 6, label: 'Follow-ups due', className: 'text-amber-500' },
  { value: 5, label: 'Awaiting reports or evidence', className: 'text-sky-600' },
  { value: 3, label: 'Ready for verification', className: 'text-teal-600' },
]

export const comingUp = [
  { title: 'Nutrition delivery — Happy Kids Centre', date: 'Tomorrow', type: 'Delivery' },
  { title: 'Installation check — Sunshine ELP', date: '19 Jul', type: 'Follow-up' },
  { title: 'Evidence deadline — Bright Beginnings', date: '20 Jul', type: 'Reporting' },
  { title: 'Verification call — Little Stars ELP', date: '22 Jul', type: 'Verification' },
]

export const notifications = [
  {
    id: 'n1',
    title: 'New support request',
    description: "Thandi's Playgroup submitted a new infrastructure request via the messaging channel.",
    time: 'Just now',
    icon: 'bell' as const,
  },
  {
    id: 'n2',
    title: 'Partner update received',
    description: 'BuildCare confirmed materials delivery for the Sunshine ELP entrance upgrade.',
    time: '14 min ago',
    icon: 'partner' as const,
  },
]

export interface SupportRequestDetail {
  title: string
  statusBadge: string
  org: string
  location: string
  elpTier: string
  practitioner: string
  dateRaised: string
  source: string
  aiSummary: string
  requestDetails: string
  requestType: string
  contactVerified: boolean
  dataSource: string
  existingSupport: { name: string; subtitle: string; status: string; statusClassName: string }[]
  overlapNote: string
  priority: Priority
}

// Only "a1" (Sunshine ELP) has a populated detail record -- it's the only
// review screen shown so far. The other action cards' buttons stay as
// no-ops until their own review screens are described.
export const supportRequestDetails: Record<string, SupportRequestDetail> = {
  a1: {
    title: 'Child-safe entrance upgrade',
    statusBadge: 'New',
    org: 'Sunshine ELP',
    location: 'Soweto',
    elpTier: 'Bronze',
    practitioner: 'Naledi Mokoena',
    dateRaised: '3 July 2025',
    source: 'ELP submission',
    aiSummary:
      'Sunshine ELP needs a child-safe entrance upgrade to address an outstanding safety requirement. Nutrition support is already being provided by another partner, but no organisation is currently assigned to this infrastructure request.',
    requestDetails:
      'The practitioner reported that the current entrance does not meet child-safety requirements. The gate is broken and poses a risk to children entering and leaving the facility. This is flagged as a safety certificate requirement for Bronze tier certification.',
    requestType: 'Infrastructure',
    contactVerified: true,
    dataSource: 'Field assessment',
    existingSupport: [
      {
        name: 'Nutrition Foundation',
        subtitle: 'Active nutrition support · Since March 2025',
        status: 'In progress',
        statusClassName: 'bg-sky-100 text-sky-700',
      },
      {
        name: 'Infrastructure support (this request)',
        subtitle: 'No partner currently assigned',
        status: 'Pending',
        statusClassName: 'bg-amber-100 text-amber-700',
      },
    ],
    overlapNote: 'No overlap detected. No other partner is currently handling infrastructure support for this ELP.',
    priority: 'high',
  },
}

export const SUPPORT_STAGES = [
  'Support accepted',
  'Support planned',
  'Fulfilment underway',
  'Awaiting confirmation',
  'Ready to complete',
]

export interface ActiveSupportItem {
  id: string
  title: string
  badges: ActionBadge[]
  org?: string
  location?: string
  lead?: string
  with?: string
  stageIndex: number // 1-based, how many of SUPPORT_STAGES are reached
  latestUpdate: string
  expectedCompletion: string
  buttonLabel: string
  priority: Priority
  batch?: { completed: number; scheduled: number; awaiting: number; blocked: number; total: number }
}

export const activeSupport: ActiveSupportItem[] = [
  {
    id: 's1',
    title: 'Infrastructure - Structure',
    badges: [{ label: 'Joint support', className: 'bg-sky-100 text-sky-700' }],
    org: 'Sunshine ELP',
    location: 'Soweto',
    stageIndex: 3,
    latestUpdate: 'Materials were delivered on 15 July. Installation is scheduled for Friday.',
    expectedCompletion: '19 July 2025',
    buttonLabel: 'View progress',
    priority: 'high',
  },
  {
    id: 's2',
    title: 'First Aid Training',
    badges: [],
    org: 'Happy Kids Centre',
    location: 'Randburg',
    stageIndex: 2,
    latestUpdate: 'Training session confirmed for 22 July with Community Skills Network.',
    expectedCompletion: '22 July 2025',
    buttonLabel: 'View progress',
    priority: 'medium',
  },
  {
    id: 's3',
    title: 'First-aid training — Limpopo cohort',
    badges: [
      { label: 'Batch support', className: 'bg-violet-100 text-violet-700' },
      { label: 'Joint support', className: 'bg-sky-100 text-sky-700' },
    ],
    location: 'Limpopo Province · First Aid Training',
    lead: 'EduPartners SA',
    with: 'Community Skills Network',
    stageIndex: 0,
    latestUpdate: 'Community Skills Network confirmed trainers for six ELPs. Two practitioners have not yet confirmed availability.',
    expectedCompletion: '15 August 2025',
    buttonLabel: 'View batch progress',
    priority: 'medium',
    batch: { completed: 4, scheduled: 2, awaiting: 2, blocked: 1, total: 8 },
  },
]

export interface CompletedSupportItem {
  id: string
  title: string
  org: string
  location: string
  outcomeLabel: string
  outcomeDescription: string
  completedDate: string
  satisfaction: string
  partners: string
  priority: Priority
}

export const completedSupport: CompletedSupportItem[] = [
  {
    id: 'c1',
    title: 'Nutrition support',
    org: 'Little Stars ELP',
    location: 'Alexandra',
    outcomeLabel: 'Improvement verified',
    outcomeDescription: 'Daily meal availability improved for 24 children.',
    completedDate: '12 July 2025',
    satisfaction: 'Very satisfied',
    partners: 'Nutrition Foundation',
    priority: 'medium',
  },
  {
    id: 'c2',
    title: 'First Aid Training',
    org: 'Siyakhula Early Learning',
    location: 'Limpopo',
    outcomeLabel: 'Improvement reported',
    outcomeDescription: '12 staff members completed first-aid certification.',
    completedDate: '5 July 2025',
    satisfaction: 'Satisfied',
    partners: 'Community Skills Network',
    priority: 'low',
  },
]

export const impactStats = [
  { value: '84', label: 'ELPs supported', sub: '12 ELPs this month', className: 'text-violet-600' },
  { value: '62', label: 'Needs resolved', sub: '74% of completed needs', className: 'text-teal-600' },
  { value: '27', label: 'ELPs toward Silver', sub: '8 newly progressing this quarter', className: 'text-sky-600' },
  { value: '1,240', label: 'Children potentially reached', sub: 'Estimate based on enrolment data*', className: 'text-amber-500' },
]

export const impactSummary =
  'Your organisation supported 84 ELPs during the selected period. Infrastructure and safety represented the largest areas of support. Twenty-seven ELPs progressed closer to Silver readiness, while 11 completed cases still require outcome confirmation.'

// Single-hue magnitude bar -- one brand color, not a categorical palette
// (per the dataviz skill: sequential/magnitude data uses one hue, not
// per-category color).
export const impactBySupportType = [
  { label: 'Infrastructure - Structure', value: 28 },
  { label: 'Nutrition support', value: 22 },
  { label: 'First Aid Training', value: 18 },
  { label: 'LTSM', value: 15 },
  { label: 'Equipment', value: 12 },
  { label: 'H&S pack', value: 7 },
]

// Status-semantic colors (drawn from the dataviz skill's status palette +
// categorical blue for "reported", validated for CVD/contrast) -- not a
// generic categorical set, since these 4 values form a quality gradient
// (verified is "best", further-support-needed is "worst").
export const outcomeStatus = [
  { label: 'Improvement verified', value: 45, color: '#0ca30c' },
  { label: 'Improvement reported', value: 25, color: '#2a78d6' },
  { label: 'Outcome pending', value: 18, color: '#fab219' },
  { label: 'Further support needed', value: 12, color: '#d03b3b' },
]

export const outcomeHighlights = [
  '18 safety requirements completed',
  '14 ELPs received reliable nutrition support',
  '23 practitioners completed training',
  '9 infrastructure improvements verified',
  '7 ELPs became ready for assessment',
]

export const quickInsights = [
  { title: 'Regional concentration', description: 'Most support is in Gauteng. Limpopo has the highest unresolved need.' },
  {
    title: 'Satisfaction',
    description: '82% of practitioners rated support as satisfactory or better. Delivery delays were the most common concern.',
  },
]

export interface ProgressEvent {
  title: string
  status: 'done' | 'waiting'
  note: string
}

export interface AuditEntry {
  actor: string
  source: string
  description: string
  attachment?: { label: string }
  timestamp: string
}

export interface ActiveSupportDetail {
  title: string
  statusBadge: string
  org: string
  location: string
  badges: ActionBadge[]
  startDate: string
  expectedCompletion: string
  leadOrg: string
  collaboratingPartners: string
  stageIndex: number
  receivingSupport: string
  requestRaised: string
  whyNeeded: string
  fulfilmentBegan: string
  progressEvents: ProgressEvent[]
  recommendation: string
  auditTrail: AuditEntry[]
  priority: Priority
}

// Only "s1" (Sunshine ELP's Infrastructure - Structure item) has a
// populated detail record -- the only Active-tab detail screen shown so
// far. Other "View progress" / "View batch progress" buttons stay no-ops.
export const activeSupportDetails: Record<string, ActiveSupportDetail> = {
  s1: {
    title: 'Child-safe entrance upgrade',
    statusBadge: 'In progress',
    org: 'Sunshine ELP',
    location: 'Soweto',
    badges: [{ label: 'Joint support', className: 'bg-sky-100 text-sky-700' }],
    startDate: '15 July 2025',
    expectedCompletion: '19 July 2025',
    leadOrg: 'EduPartners SA',
    collaboratingPartners: 'BuildCare',
    stageIndex: 3,
    receivingSupport: 'Sunshine ELP, Soweto · Naledi Mokoena',
    requestRaised: '3 July 2025 via ELP submission',
    whyNeeded: 'Outstanding safety certificate requirement for Bronze tier',
    fulfilmentBegan: '15 July 2025',
    progressEvents: [
      { title: 'Installation scheduled — 19 July', status: 'waiting', note: 'Awaiting confirmation from BuildCare' },
      { title: 'Materials delivered — 15 July', status: 'done', note: 'Field assessment' },
    ],
    recommendation: 'Confirm the installation date with the fulfilment partner before Friday.',
    auditTrail: [
      { actor: 'Tracey van der Merwe', source: 'Platform', description: 'Installation scheduled for Friday 19 July.', timestamp: '15 Jul · 16:00' },
      {
        actor: 'BuildCare',
        source: 'Partner system',
        description: 'Materials delivered to site.',
        attachment: { label: 'Delivery confirmation.pdf' },
        timestamp: '15 Jul · 08:45',
      },
      { actor: 'EduPartners SA', source: 'Platform', description: 'Materials ordered from BuildCare supplier.', timestamp: '10 Jul · 09:00' },
      { actor: 'BuildCare', source: 'Partner platform', description: 'BuildCare added as collaborating partner for installation.', timestamp: '5 Jul · 11:20' },
      { actor: 'EduPartners SA', source: 'Platform', description: 'EduPartners SA accepted support.', timestamp: '4 Jul · 10:00' },
      { actor: 'Tracey van der Merwe', source: 'Platform', description: 'Request reviewed by Tracey.', timestamp: '3 Jul · 14:30' },
      { actor: 'Naledi Mokoena', source: 'ELP submission', description: 'Request submitted by practitioner.', timestamp: '3 Jul · 09:14' },
    ],
    priority: 'high',
  },
}

export interface CompletedAuditEntry {
  actor: string
  source: string
  timestamp: string
  description: string
  attachment?: { label: string }
}

export interface CompletedSupportDetail {
  title: string
  badges: ActionBadge[]
  org: string
  location: string
  startDate: string
  completedDate: string
  leadOrg: string
  collaboratingPartners: string
  whoReceived: string
  whatRequested: string
  requestRaised: string
  whyNeeded: string
  contributionBreakdown: { org: string; contribution: string }[]
  satisfaction: { level: string; feedbackDate: string; channel: string; comment: string }
  supportImpact: { label: string; description: string; className: string }[]
  evidence: { label: string; date: string; icon: 'message' | 'document' | 'check'; className: string }[]
  auditTrail: CompletedAuditEntry[]
  priority: Priority
}

// Only "c1" (Little Stars ELP's Nutrition support) has a populated detail
// record -- the only Completed-tab detail screen shown so far.
export const completedSupportDetails: Record<string, CompletedSupportDetail> = {
  c1: {
    title: 'Nutrition support',
    badges: [
      { label: 'Completed', className: 'bg-teal-100 text-teal-700' },
      { label: 'Improvement verified', className: 'bg-teal-100 text-teal-700' },
    ],
    org: 'Little Stars ELP',
    location: 'Alexandra',
    startDate: '1 July 2025',
    completedDate: '12 July 2025',
    leadOrg: 'EduPartners SA',
    collaboratingPartners: 'Nutrition Foundation',
    whoReceived: 'Little Stars ELP · Naledi Dlamini',
    whatRequested: 'Consistent nutrition supply for 24 enrolled children',
    requestRaised: '28 June 2025',
    whyNeeded: 'Meals had become inconsistent due to supply disruptions.',
    contributionBreakdown: [
      { org: 'EduPartners SA (Tracey)', contribution: 'Coordination and procurement funding' },
      { org: 'Nutrition Foundation', contribution: 'Nutritional supplies and delivery' },
    ],
    satisfaction: {
      level: 'Very satisfied',
      feedbackDate: '11 July 2025',
      channel: 'messaging channel',
      comment: 'The children are now eating a full meal every day. This has made a big difference to their concentration and wellbeing.',
    },
    supportImpact: [
      {
        label: 'What was delivered',
        description: 'Consistent daily nutrition supply for 24 children for 12 days.',
        className: 'bg-violet-50 border-violet-200 text-violet-900',
      },
      {
        label: 'What changed',
        description: "Meal availability improved from irregular to daily. Children's attendance increased noticeably.",
        className: 'bg-sky-50 border-sky-200 text-sky-900',
      },
      {
        label: 'Journey contribution',
        description: 'Little Stars ELP moved closer to Silver readiness with nutrition requirement met.',
        className: 'bg-teal-50 border-teal-200 text-teal-900',
      },
    ],
    evidence: [
      { label: 'Practitioner confirmation', date: '11 Jul', icon: 'message', className: 'bg-teal-50 border-teal-200 text-teal-700' },
      { label: 'Delivery receipt', date: '9 Jul', icon: 'document', className: 'bg-sky-50 border-sky-200 text-sky-700' },
      { label: 'Practitioner feedback form', date: '11 Jul', icon: 'check', className: 'bg-violet-50 border-violet-200 text-violet-700' },
    ],
    auditTrail: [
      { actor: 'Tracey van der Merwe', source: 'Platform', timestamp: '12 Jul · 15:30', description: "Case closed. Outcome verified as 'Improvement verified'." },
      {
        actor: 'Naledi Mokoena',
        source: 'ELP submission',
        timestamp: '11 Jul · 10:00',
        description: 'Practitioner confirmed consistent daily meals for all 24 children.',
        attachment: { label: 'Feedback form.pdf' },
      },
      { actor: 'Tracey van der Merwe', source: 'Platform', timestamp: '10 Jul · 09:15', description: 'Outcome reviewed and marked as verified.' },
      {
        actor: 'Nutrition Foundation',
        source: 'Partner platform',
        timestamp: '9 Jul · 14:00',
        description: 'Final delivery completed. All supply items confirmed received.',
        attachment: { label: 'Delivery receipt.pdf' },
      },
      { actor: 'EduPartners SA', source: 'Platform', timestamp: '2 Jul · 11:00', description: 'Nutrition Foundation added as collaborating partner.' },
      { actor: 'EduPartners SA', source: 'Platform', timestamp: '1 Jul · 09:00', description: 'Support accepted. Nutrition delivery plan confirmed.' },
      { actor: 'Naledi Mokoena', source: 'Messaging channel', timestamp: '28 Jun · 14:20', description: 'Request received — nutrition supplies needed urgently.' },
    ],
    priority: 'medium',
  },
}

export interface ElpDetail {
  siteId: string
  childrenEnrolled: number
  totalRequests: number
  lastEngagement: string
  completedFraction: string
  practitioner: {
    name: string
    role: string
    phone: string
    phoneVerified: boolean
    preferredLanguage: string
    lastContact: string
    contactVerified: boolean
  }
  summary: string
  currentSupportRelationships: { name: string; categories: string; status: string; statusClassName: string; startDate: string; overlapBadge?: string }[]
  governmentSupport: {
    title: string
    badge: string
    categories: string
    expectedFulfilment: string
    source: string
    complementarySupport: string[]
  }
  requestHistory: {
    request: string
    raised: string
    status: string
    statusClassName: string
    type: string
    fulfilledBy: string
    latestUpdate: string
    completed: string
    outcome?: { label: string; className: string }
    // Only set for rows that have real detail content to expand into
    // (reuses the same activeSupportDetails/completedSupportDetails
    // records already built for the Active/Completed tab detail pages).
    expandDetailId?: string
    expandType?: 'active' | 'completed'
  }[]
}

// Only Sunshine ELP (ELP-SOW-0042) has a populated detail record -- the
// only ELP profile screen shown so far.
export const elpDetails: Record<string, ElpDetail> = {
  'ELP-SOW-0042': {
    siteId: 'ELP-SOW-0042',
    childrenEnrolled: 28,
    totalRequests: 6,
    lastEngagement: '2 days ago',
    completedFraction: '3 of 6',
    practitioner: {
      name: 'Naledi Mokoena',
      role: 'ELP Owner & Practitioner',
      phone: '+27 71 234 5678',
      phoneVerified: true,
      preferredLanguage: 'Zulu / English',
      lastContact: '15 July 2025',
      contactVerified: true,
    },
    summary:
      'Your organisation has engaged with Sunshine ELP across six support requests. Three are complete, two remain active and one is awaiting review. Health and safety remains the primary unmet need.',
    currentSupportRelationships: [
      {
        name: 'EduPartners SA + BuildCare',
        categories: 'Infrastructure – Structure · Infrastructure – Structure',
        status: 'In progress',
        statusClassName: 'bg-sky-100 text-sky-700',
        startDate: 'Started 3 Jul 2025',
      },
      {
        name: 'EduPartners SA',
        categories: 'Nutrition support · Nutrition support',
        status: 'In progress',
        statusClassName: 'bg-sky-100 text-sky-700',
        startDate: 'Started 9 Jul 2025',
      },
      {
        name: 'Nutrition Foundation',
        categories: 'Nutrition support · Nutrition support',
        status: 'Active',
        statusClassName: 'bg-gray-100 text-gray-600',
        startDate: 'Started 1 Jun 2025',
        overlapBadge: 'Category overlap possible',
      },
    ],
    governmentSupport: {
      title: 'Govt. infrastructure support',
      badge: 'Selected',
      categories: 'Infrastructure & facilities · Building materials & repairs',
      expectedFulfilment: 'October 2025',
      source: 'Dept of Public Works',
      complementarySupport: ['Maintenance training', 'Safety training', 'Technical guidance', 'First-aid training'],
    },
    requestHistory: [
      {
        request: 'Child-safe entrance upgrade',
        raised: '3 July',
        status: 'In progress',
        statusClassName: 'bg-sky-100 text-sky-700',
        type: 'Infrastructure - Structure',
        fulfilledBy: 'EduPartners SA + BuildCare',
        latestUpdate: 'Installation scheduled…',
        completed: '—',
        expandDetailId: 's1',
        expandType: 'active',
      },
      {
        request: 'Nutrition support',
        raised: '9 July',
        status: 'In progress',
        statusClassName: 'bg-sky-100 text-sky-700',
        type: 'Nutrition support',
        fulfilledBy: 'EduPartners SA',
        latestUpdate: 'Delivery scheduled…',
        completed: '—',
      },
      {
        request: 'First Aid Training',
        raised: '14 July',
        status: 'Pending',
        statusClassName: 'bg-amber-100 text-amber-700',
        type: 'First Aid Training',
        fulfilledBy: 'Unassigned',
        latestUpdate: 'Awaiting review',
        completed: '—',
      },
      {
        request: 'Garden fencing',
        raised: '20 June',
        status: 'Completed',
        statusClassName: 'bg-teal-100 text-teal-700',
        type: 'Infrastructure - Structure',
        fulfilledBy: 'EduPartners SA + BuildCare',
        latestUpdate: 'Very satisfied',
        completed: '30 June',
        outcome: { label: 'Improvement verified', className: 'bg-teal-100 text-teal-700' },
      },
      {
        request: 'LTSM',
        raised: '5 June',
        status: 'Completed',
        statusClassName: 'bg-teal-100 text-teal-700',
        type: 'LTSM',
        fulfilledBy: 'EduPartners SA',
        latestUpdate: 'Satisfied',
        completed: '15 June',
        outcome: { label: 'Improvement reported', className: 'bg-sky-100 text-sky-700' },
      },
    ],
  },
}
