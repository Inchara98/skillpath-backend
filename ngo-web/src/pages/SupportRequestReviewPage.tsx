import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { supportRequestDetails } from '../data/mockDashboard'
import { AlertCircleIcon, AwardIcon, CheckCircleIcon, LightningIcon, LocationIcon } from '../components/icons'
import { useState } from 'react'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

export function SupportRequestReviewPage() {
  const { id } = useParams()
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
