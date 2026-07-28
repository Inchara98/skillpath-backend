// Maps a real DonationRequest (from ngo-bpp-server.js, via ngoRequestsApi)
// into the same ActionItem shape the mock Actions Centre cards use --
// this is the ONLY real, backend-driven data mixed into that list;
// everything else on /actions is still mockDashboard.ts. See
// SupportRequestReviewPage.tsx for how the "donation-" id prefix gets
// routed to a real (not mock) detail view.

import type { ActionItem, Priority } from '../data/mockDashboard'
import type { DonationRequest } from './ngoRequestsApi'

const STATUS_BADGE: Record<DonationRequest['status'], { label: string; className: string }> = {
  requested: { label: 'New request', className: 'bg-violet-100 text-violet-700' },
  confirmed: { label: 'New request', className: 'bg-violet-100 text-violet-700' },
  accepted: { label: 'In progress', className: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Donation Fulfilled', className: 'bg-teal-100 text-teal-700' },
}

// Gives new/unactioned requests visual urgency (red border, matching the
// reference design's treatment of new items) and calms down once
// handled -- purely a display choice, not a real priority field from
// the backend.
const STATUS_PRIORITY: Record<DonationRequest['status'], Priority> = {
  requested: 'high',
  confirmed: 'high',
  accepted: 'medium',
  paid: 'low',
}

// Displayed in place of the raw participantName/region from the backend
// (which is always just "Learner" with a blank region, since the
// WhatsApp flow doesn't collect a care centre name) -- fixed, consistent
// with the fictional care centre/practitioner names already used
// elsewhere in this demo (e.g. the test peer profiles) and with the
// Review screen's own display.
const DONATION_CARE_CENTRE = 'Happy Homes'
const DONATION_REGION = 'Holly County, Sasolburg'

function shortTitle(description: string): string {
  const firstSentence = description.split(/[.\n]/)[0].trim()
  return firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence || 'Donation request'
}

export function donationRequestToActionItem(r: DonationRequest): ActionItem {
  const status = STATUS_BADGE[r.status]
  const isPaid = r.status === 'paid'
  return {
    id: `donation-${r.id}`,
    org: DONATION_CARE_CENTRE,
    location: DONATION_REGION,
    badges: [
      { label: status.label, className: status.className },
      ...(r.crId ? [{ label: r.crId, className: 'bg-gray-100 text-gray-600' }] : []),
    ],
    title: shortTitle(r.description),
    category: 'Donation / Funding',
    description: r.description,
    timing: new Date(r.createdAt).toLocaleDateString(),
    buttonLabel: 'Review request',
    priority: STATUS_PRIORITY[r.status],
    completed: isPaid,
    completedNote: isPaid
      ? `Donation of ${r.amount ? `R${r.amount}` : 'the requested amount'} completed${r.deadline ? ` — needed by ${r.deadline}` : ''}`
      : undefined,
  }
}
