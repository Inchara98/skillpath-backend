import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { SupportStageBar } from '../components/SupportStageBar'
import { completedSupportDetails, SUPPORT_STAGES } from '../data/mockDashboard'
import { CheckCircleIcon, DocumentIcon, LocationIcon, MessageIcon, PlusIcon, ChevronUpIcon } from '../components/icons'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

const EVIDENCE_ICON = { message: MessageIcon, document: DocumentIcon, check: CheckCircleIcon }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

function ActionButton({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button type="button" className="flex w-full items-center gap-2 rounded-full border border-gray-300 text-gray-700 px-4 py-2.5 text-sm font-bold">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

export function CompletedSupportDetailPage() {
  const { id } = useParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(true)
  const detail = id ? completedSupportDetails[id] : undefined

  if (!detail) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-gray-500">
          No details for this item yet.{' '}
          <Link to="/support" className="text-violet-600 font-semibold">
            Back to My Support
          </Link>
        </p>
        <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/support" className="hover:text-gray-600">
          My Support
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">
          {detail.org} — {detail.title}
        </span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[detail.priority]} p-6`}>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{detail.title}</h1>
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <LocationIcon className="h-4 w-4" />
                {detail.org} · {detail.location}
              </span>
              {detail.badges.map((b) => (
                <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}>
                  {b.label}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Start date</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.startDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Completed</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.completedDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Lead organisation</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.leadOrg}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Collaborating partners</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.collaboratingPartners}</p>
              </div>
            </div>

            <div className="mt-5">
              <SupportStageBar stageIndex={SUPPORT_STAGES.length} />
            </div>
          </div>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Support overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-sm text-gray-400">Who received support</p>
                <p className="font-medium text-gray-900 mt-0.5">{detail.whoReceived}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">What was requested</p>
                <p className="font-medium text-gray-900 mt-0.5">{detail.whatRequested}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Request raised</p>
                <p className="font-medium text-gray-900 mt-0.5">{detail.requestRaised}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Why support was needed</p>
                <p className="font-medium text-gray-900 mt-0.5">{detail.whyNeeded}</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Contribution breakdown</h2>
            <ul className="flex flex-col">
              {detail.contributionBreakdown.map((c) => (
                <li key={c.org} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <span className="font-medium text-gray-900">{c.org}</span>
                  <span className="text-sm text-gray-500">{c.contribution}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Satisfaction</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-teal-100 text-teal-700 px-3 py-1 text-sm font-semibold">{detail.satisfaction.level}</span>
              <span className="text-sm text-gray-400">
                Feedback received {detail.satisfaction.feedbackDate} · via {detail.satisfaction.channel}
              </span>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 mt-4">
              <p className="text-sm text-gray-400">Practitioner comment</p>
              <p className="text-gray-700 italic mt-1">"{detail.satisfaction.comment}"</p>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Support impact</h2>
            <div className="flex flex-col gap-3">
              {detail.supportImpact.map((s) => (
                <div key={s.label} className={`rounded-lg border p-4 ${s.className}`}>
                  <p className="text-sm font-semibold opacity-80">{s.label}</p>
                  <p className="mt-1">{s.description}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Evidence</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detail.evidence.map((e) => {
                const Icon = EVIDENCE_ICON[e.icon]
                return (
                  <div key={e.label} className={`flex items-center gap-3 rounded-lg border p-4 ${e.className}`}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">{e.label}</p>
                      <p className="text-sm opacity-70">{e.date}</p>
                    </div>
                  </div>
                )
              })}
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
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{entry.actor}</span>
                      <span className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500">{entry.source}</span>
                      <span className="text-xs text-gray-400">· {entry.timestamp}</span>
                    </p>
                    <p className="text-sm text-gray-700 mt-1">{entry.description}</p>
                    {entry.attachment && (
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 mt-1">
                        <DocumentIcon className="h-4 w-4" />
                        {entry.attachment.label}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="w-full lg:w-72 shrink-0 h-fit lg:sticky lg:top-6 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-col gap-2">
            <ActionButton icon={MessageIcon} label="Message practitioner" />
            <ActionButton icon={DocumentIcon} label="Download case report" />
            <ActionButton icon={PlusIcon} label="Add new support request" />
          </div>
        </div>
      </div>

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
