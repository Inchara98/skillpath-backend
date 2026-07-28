import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { FakePaymentModal } from '../components/FakePaymentModal'
import { supportRequestDetails } from '../data/mockDashboard'
import { AlertCircleIcon, AwardIcon, CheckCircleIcon, LightningIcon, LocationIcon } from '../components/icons'
import { useEffect, useState } from 'react'
import { acceptDonationRequest, fetchDonationRequests, markDonationRequestPaid, type DonationRequest } from '../lib/ngoRequestsApi'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

// Reused unchanged for every donation request, exactly as instructed --
// this section isn't tied to real per-request data, it's the same
// reference-design content shown for the one wired mock request ("a1").
const DONATION_EXISTING_SUPPORT = [
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
]
const DONATION_OVERLAP_NOTE = 'No overlap detected. No other partner is currently handling infrastructure support for this ELP.'

export function SupportRequestReviewPage() {
  const { id } = useParams()

  if (id?.startsWith('donation-')) {
    return <DonationRequestReview realId={id.replace(/^donation-/, '')} />
  }

  return <MockSupportRequestReview id={id} />
}

function DonationRequestReview({ realId }: { realId: string }) {
  const [request, setRequest] = useState<DonationRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchDonationRequests()
      .then((all) => {
        if (cancelled) return
        setRequest(all.find((r) => r.id === realId) ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load request')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [realId])

  async function handleAssignOrg() {
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const updated = await acceptDonationRequest(request.id)
      setRequest(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // The real markDonationRequestPaid call happens once the fake payment
  // animation finishes -- see FakePaymentModal's onDone.
  async function handlePaymentDone() {
    setShowPayment(false)
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const updated = await markDonationRequestPaid(request.id)
      setRequest(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-gray-400">Loading request…</p>
        <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DashboardLayout>
    )
  }

  if (error || !request) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-red-600">
          {error || 'This donation request could not be found.'}{' '}
          <Link to="/actions" className="text-violet-600 font-semibold">
            Back to My Actions Centre
          </Link>
        </p>
        <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DashboardLayout>
    )
  }

  const isPaid = request.status === 'paid'
  const isAccepted = request.status === 'accepted' || isPaid
  const statusBadge = isPaid ? 'Donation Fulfilled' : isAccepted ? 'In progress' : 'New'
  const priority = isPaid ? 'low' : isAccepted ? 'medium' : 'high'
  const title = request.description.split(/[.\n]/)[0].trim() || 'Donation request'

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/actions" className="hover:text-gray-600">
          My Actions Centre
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Support Request Review</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[priority]} p-6`}>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  isPaid ? 'bg-teal-100 text-teal-700' : 'bg-violet-100 text-violet-700'
                }`}
              >
                {statusBadge}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <LocationIcon className="h-4 w-4" />
                {request.participantName} · {request.region || 'Region not specified'}
              </span>
              {request.crId && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">
                  {request.crId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Practitioner</p>
                <p className="font-semibold text-gray-900 mt-0.5">{request.participantName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Date raised</p>
                <p className="font-semibold text-gray-900 mt-0.5">{new Date(request.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Source</p>
                <span className="inline-block mt-0.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700">
                  WhatsApp (Beckn network)
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 p-6">
            <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-violet-600 mb-2">
              <LightningIcon className="h-4 w-4" />
              REQUEST SUMMARY
            </p>
            <p className="text-violet-900">{request.description}</p>
          </div>

          <Card>
            <h2 className="font-bold text-gray-900 mb-3">Payment details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-sm text-gray-400">Amount requested</p>
                <p className="font-semibold text-gray-900 mt-0.5">{request.amount ? `₹${request.amount}` : 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Needed by</p>
                <p className="font-semibold text-gray-900 mt-0.5">{request.deadline || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Payment status</p>
                <p className={`font-semibold mt-0.5 ${isPaid ? 'text-teal-600' : 'text-amber-600'}`}>
                  {isPaid ? 'Paid in full' : isAccepted ? 'Awaiting payment' : 'Not yet assigned'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Tracking reference</p>
                <p className="font-semibold text-gray-900 mt-0.5">{request.crId || request.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Request type</p>
                <p className="font-semibold text-gray-900 mt-0.5">Donation / Funding</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Contact verified</p>
                <p className="flex items-center gap-1 font-semibold text-teal-600 mt-0.5">
                  <CheckCircleIcon className="h-4 w-4" />
                  Yes — verified via WhatsApp
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Existing support &amp; other partners</h2>
            <ul className="flex flex-col gap-4">
              {DONATION_EXISTING_SUPPORT.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-3 pb-4 border-b border-gray-100 last:border-b-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{s.subtitle}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.statusClassName}`}>{s.status}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2 mt-5 rounded-lg bg-amber-50 text-amber-800 p-4 text-sm">
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0" />
              {DONATION_OVERLAP_NOTE}
            </div>
          </Card>
        </div>

        <div className="w-full lg:w-72 shrink-0 h-fit lg:sticky lg:top-6 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Actions</h2>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex flex-col gap-2">
            {!isAccepted && (
              <button
                type="button"
                onClick={handleAssignOrg}
                disabled={busy}
                className="rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 text-sm font-bold"
              >
                {busy ? 'Working…' : 'Assign my organisation'}
              </button>
            )}
            {isAccepted && !isPaid && (
              <button
                type="button"
                onClick={() => setShowPayment(true)}
                disabled={busy}
                className="rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 text-sm font-bold"
              >
                {busy ? 'Working…' : 'Pay Now'}
              </button>
            )}
            {isPaid && (
              <p className="flex items-center justify-center gap-1.5 rounded-full bg-teal-50 text-teal-700 py-2.5 text-sm font-bold">
                <CheckCircleIcon className="h-4 w-4" /> Donation Fulfilled
              </p>
            )}
            <button type="button" className="rounded-full border border-gray-300 text-gray-700 py-2.5 text-sm font-bold">
              Request more information
            </button>
          </div>

          <button
            type="button"
            disabled={isPaid}
            className={`w-full text-left mt-4 pt-4 border-t border-gray-100 text-sm font-semibold ${
              isPaid ? 'text-gray-300 cursor-not-allowed' : 'text-red-600'
            }`}
          >
            Decline request
          </button>
        </div>
      </div>

      {showPayment && (
        <FakePaymentModal amount={request.amount} onDone={handlePaymentDone} onClose={() => setShowPayment(false)} />
      )}

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}

function MockSupportRequestReview({ id }: { id: string | undefined }) {
  const [modalOpen, setModalOpen] = useState(false)
  const detail = id ? supportRequestDetails[id] : undefined

  if (!detail) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-gray-500">
          No review details for this request yet.{' '}
          <Link to="/actions" className="text-violet-600 font-semibold">
            Back to My Actions Centre
          </Link>
        </p>
        <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/actions" className="hover:text-gray-600">
          My Actions Centre
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Support Request Review</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[detail.priority]} p-6`}>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900">{detail.title}</h1>
              <span className="shrink-0 rounded-full bg-violet-100 text-violet-700 px-3 py-1 text-xs font-semibold">
                {detail.statusBadge}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <LocationIcon className="h-4 w-4" />
                {detail.org} · {detail.location}
              </span>
              <span className="flex items-center gap-1 text-amber-600 font-semibold">
                <AwardIcon className="h-4 w-4" />
                {detail.elpTier}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Practitioner</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.practitioner}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Date raised</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.dateRaised}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Source</p>
                <span className="inline-block mt-0.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700">
                  {detail.source}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 p-6">
            <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-violet-600 mb-2">
              <LightningIcon className="h-4 w-4" />
              AI SUMMARY
            </p>
            <p className="text-violet-900">{detail.aiSummary}</p>
          </div>

          <Card>
            <h2 className="font-bold text-gray-900 mb-3">Request details</h2>
            <p className="text-gray-600">{detail.requestDetails}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Request type</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.requestType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">ELP tier</p>
                <p className="flex items-center gap-1 font-semibold text-amber-600 mt-0.5">
                  <AwardIcon className="h-4 w-4" />
                  {detail.elpTier}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Contact verified</p>
                {detail.contactVerified ? (
                  <p className="flex items-center gap-1 font-semibold text-teal-600 mt-0.5">
                    <CheckCircleIcon className="h-4 w-4" />
                    Yes — confirmed
                  </p>
                ) : (
                  <p className="font-semibold text-gray-500 mt-0.5">Not verified</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-400">Data source</p>
                <span className="inline-block mt-0.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700">
                  {detail.dataSource}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Existing support &amp; other partners</h2>
            <ul className="flex flex-col gap-4">
              {detail.existingSupport.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-3 pb-4 border-b border-gray-100 last:border-b-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{s.subtitle}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.statusClassName}`}>{s.status}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2 mt-5 rounded-lg bg-amber-50 text-amber-800 p-4 text-sm">
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0" />
              {detail.overlapNote}
            </div>
          </Card>
        </div>

        <div className="w-full lg:w-72 shrink-0 h-fit lg:sticky lg:top-6 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-col gap-2">
            <button type="button" className="rounded-full bg-violet-600 hover:bg-violet-700 text-white py-2.5 text-sm font-bold">
              Assign my organisation
            </button>
            <button type="button" className="rounded-full border border-gray-300 text-gray-700 py-2.5 text-sm font-bold">
              Invite another partner
            </button>
            <button type="button" className="rounded-full border border-gray-300 text-gray-700 py-2.5 text-sm font-bold">
              Request more information
            </button>
          </div>

          <button
            type="button"
            className="w-full text-left mt-4 pt-4 border-t border-gray-100 text-sm font-semibold text-red-600"
          >
            Decline request
          </button>

          <Link
            to="#"
            className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 text-sm font-semibold text-violet-600"
          >
            View {detail.org} profile <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
