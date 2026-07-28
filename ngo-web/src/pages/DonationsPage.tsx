import { useEffect, useState } from 'react'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { DonationRequestCard } from '../components/DonationRequestCard'
import { fetchDonationRequests, type DonationRequest } from '../lib/ngoRequestsApi'

export function DonationsPage() {
  const [requests, setRequests] = useState<DonationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDonationRequests()
      .then((data) => {
        if (!cancelled) setRequests(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load requests')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleChanged(updated: DonationRequest) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  // Donation requests only ever come in automatically via the WhatsApp
  // bot -- there's no "raise a new one from here" flow, unlike the mock
  // Support Request button elsewhere in this app.
  function handleNewRequestNoop() {
    window.alert('Donation requests come in automatically from the WhatsApp bot -- there\'s nothing to create here.')
  }

  return (
    <DashboardLayout onNewRequest={handleNewRequestNoop}>
      <h1 className="text-2xl font-bold text-gray-900">Donation Requests</h1>
      <p className="text-gray-500 mt-1">
        Real requests raised by learners over WhatsApp, via the Beckn network -- this is the one section of the app backed by
        a real service, not mock data.
      </p>

      <div className="flex flex-col gap-4 mt-6 max-w-3xl">
        {loading && <p className="text-sm text-gray-400">Loading requests…</p>}
        {error && (
          <p className="text-sm text-red-600">
            {error}. Check that <code>VITE_NGO_BPP_BASE_URL</code> is set correctly (see <code>.env.example</code>).
          </p>
        )}
        {!loading && !error && requests.length === 0 && <p className="text-sm text-gray-400">No donation requests yet.</p>}
        {requests
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((r) => (
            <DonationRequestCard key={r.id} request={r} onChanged={handleChanged} />
          ))}
      </div>
    </DashboardLayout>
  )
}
