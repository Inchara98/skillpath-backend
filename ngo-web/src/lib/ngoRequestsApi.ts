// Talks to ngo-bpp-server.js -- the actual Beckn BPP backend that receives
// donation requests from the SkillPath/Bana Pele WhatsApp bot (via
// demo-bap). This is the ONLY real backend integration in this app so far;
// everything else in src/data/mockDashboard.ts is still hardcoded mock
// data, since no backend exists yet for ELPs, general support requests,
// or notifications (see the repo root README's ngo-bpp-server.js section
// for how a request actually gets here).

export type DonationRequestStatus = 'requested' | 'confirmed' | 'accepted' | 'paid'

export interface DonationRequest {
  id: string
  participantId: string
  participantName: string
  description: string
  amount: string
  deadline: string
  region: string
  status: DonationRequestStatus
  crId?: string
  createdAt: string
}

const BASE_URL = import.meta.env.VITE_NGO_BPP_BASE_URL as string | undefined

if (!BASE_URL) {
  console.warn(
    '[ngo-web] VITE_NGO_BPP_BASE_URL is not set -- the Donation Requests page will show an error until .env is filled in (see .env.example).',
  )
}

function requireBaseUrl(): string {
  if (!BASE_URL) throw new Error('VITE_NGO_BPP_BASE_URL is not set -- see .env.example')
  return BASE_URL
}

export async function fetchDonationRequests(): Promise<DonationRequest[]> {
  const res = await fetch(`${requireBaseUrl()}/api/ngo/requests`)
  if (!res.ok) throw new Error(`Failed to load donation requests (${res.status})`)
  return res.json()
}

export async function acceptDonationRequest(id: string): Promise<DonationRequest> {
  const res = await fetch(`${requireBaseUrl()}/api/ngo/requests/${id}/accept`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to accept request (${res.status})`)
  const data = await res.json()
  return data.request
}

export async function markDonationRequestPaid(id: string): Promise<DonationRequest> {
  const res = await fetch(`${requireBaseUrl()}/api/ngo/requests/${id}/paid`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to mark request paid (${res.status})`)
  const data = await res.json()
  return data.request
}
