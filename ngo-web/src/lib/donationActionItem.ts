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

function shortTitle(description: string): string {
  const firstSentence = description.split(/[.\n]/)[0].trim()
  return firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence || 'Donation request'
}

export function donationRequestToActionItem(r: DonationRequest): ActionItem {
  const status = STATUS_BADGE[r.status]
  return {
    id: `donation-${r.id}`,
    org: r.participantName,
    location: r.region || 'Region not specified',
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
  }
}
