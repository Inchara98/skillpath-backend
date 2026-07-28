import { useState } from 'react'
import type { ActiveSupportDetail } from '../data/mockDashboard'
import { AlertCircleIcon, CheckCircleIcon, ChevronUpIcon, DocumentIcon, LightningIcon } from './icons'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

// Shared by ActiveSupportDetailPage and ElpDetailPage's expandable request
// history rows -- both show the same "what's happening with this request"
// shape (overview, progress checklist, audit trail) for the same
// underlying activeSupportDetails record.
export function SupportProgressDetails({ detail }: { detail: ActiveSupportDetail }) {
  const [auditOpen, setAuditOpen] = useState(true)

  return (
    <>
      <Card>
        <h2 className="font-bold text-gray-900 mb-4">Support overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-sm text-gray-400">Receiving support</p>
            <p className="font-medium text-gray-900 mt-0.5">{detail.receivingSupport}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Request raised</p>
            <p className="font-medium text-gray-900 mt-0.5">{detail.requestRaised}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Why needed</p>
            <p className="font-medium text-gray-900 mt-0.5">{detail.whyNeeded}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Fulfilment began</p>
            <p className="font-medium text-gray-900 mt-0.5">{detail.fulfilmentBegan}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold text-gray-900 mb-4">Current progress</h2>
        <ul className="flex flex-col gap-4">
          {detail.progressEvents.map((e) => (
            <li key={e.title} className="flex items-start gap-3">
              {e.status === 'done' ? (
                <CheckCircleIcon className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircleIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold text-gray-900">{e.title}</p>
                {e.status === 'waiting' ? (
                  <p className="text-sm text-amber-600 mt-0.5">{e.note}</p>
                ) : (
                  <span className="inline-block mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                    {e.note}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2 rounded-lg bg-violet-50 text-violet-900 p-4 mt-5 text-sm">
          <LightningIcon className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" />
          <p>
            <span className="font-bold">Recommended:</span> {detail.recommendation}
          </p>
        </div>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setAuditOpen((o) => !o)}
          className="flex w-full items-center justify-between font-bold text-gray-900"
        >
          Audit trail
          <ChevronUpIcon className={`h-5 w-5 text-gray-400 transition-transform ${auditOpen ? '' : 'rotate-180'}`} />
        </button>

        {auditOpen && (
          <ol className="relative flex flex-col gap-5 mt-5 border-l-2 border-violet-100 pl-5">
            {detail.auditTrail.map((entry, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-violet-600 ring-4 ring-violet-100" />
                <p className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{entry.actor}</span>
                  <span className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500">{entry.source}</span>
                </p>
                <p className="text-sm text-gray-700 mt-1">{entry.description}</p>
                {entry.attachment && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 mt-1">
                    <DocumentIcon className="h-4 w-4" />
                    {entry.attachment.label}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">{entry.timestamp}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  )
}
