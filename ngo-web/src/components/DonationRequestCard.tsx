import { useState } from 'react'
import type { DonationRequest } from '../lib/ngoRequestsApi'
import { acceptDonationRequest, markDonationRequestPaid } from '../lib/ngoRequestsApi'
import { CheckCircleIcon } from './icons'
import { FakePaymentModal } from './FakePaymentModal'

const STATUS_META: Record<DonationRequest['status'], { label: string; className: string }> = {
  requested: { label: 'New request', className: 'bg-violet-100 text-violet-700' },
  confirmed: { label: 'New request', className: 'bg-violet-100 text-violet-700' },
  accepted: { label: 'Accepted', className: 'bg-sky-100 text-sky-700' },
  paid: { label: 'Paid', className: 'bg-teal-100 text-teal-700' },
}

export function DonationRequestCard({
  request,
  onChanged,
}: {
  request: DonationRequest
  onChanged: (updated: DonationRequest) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const status = STATUS_META[request.status]

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      const updated = await acceptDonationRequest(request.id)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // The actual API call only happens once the fake payment animation
  // finishes (see FakePaymentModal's onDone) -- clicking "Pay Now" just
  // opens the modal, it doesn't mark anything paid by itself.
  async function handlePaymentDone() {
    setShowPayment(false)
    setBusy(true)
    setError(null)
    try {
      const updated = await markDonationRequestPaid(request.id)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 border-violet-400 p-4 md:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="text-gray-700">{request.participantName}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
          {request.crId && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">{request.crId}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 whitespace-nowrap">{new Date(request.createdAt).toLocaleDateString()}</p>
      </div>

      <p className="font-bold text-gray-900 mt-3">Donation request</p>
      <p className="text-sm text-gray-500 mt-1">{request.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
        {request.amount && <span>Amount: {request.amount}</span>}
        {request.deadline && <span>Needed by: {request.deadline}</span>}
        {request.region && <span>Region: {request.region}</span>}
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <div className="flex items-center gap-2 mt-4">
        {(request.status === 'requested' || request.status === 'confirmed') && (
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="flex items-center gap-1 rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            {busy ? 'Working…' : 'Accept request'}
          </button>
        )}
        {request.status === 'accepted' && (
          <button
            type="button"
            onClick={() => setShowPayment(true)}
            disabled={busy}
            className="flex items-center gap-1 rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            {busy ? 'Working…' : 'Pay Now'}
          </button>
        )}
        {request.status === 'paid' && (
          <span className="flex items-center gap-1 text-sm text-teal-700 font-semibold">
            <CheckCircleIcon className="h-4 w-4" /> Donation completed
          </span>
        )}
      </div>

      {showPayment && (
        <FakePaymentModal amount={request.amount} onDone={handlePaymentDone} onClose={() => setShowPayment(false)} />
      )}
    </div>
  )
}
