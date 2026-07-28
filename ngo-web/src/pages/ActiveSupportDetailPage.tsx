import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { SupportStageBar } from '../components/SupportStageBar'
import { SupportProgressDetails } from '../components/SupportProgressDetails'
import { activeSupportDetails } from '../data/mockDashboard'
import { CheckCircleIcon, DocumentIcon, LightningIcon, LocationIcon, MessageIcon, PlusIcon } from '../components/icons'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

function ActionButton({ icon: Icon, label, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${
        primary ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'border border-gray-300 text-gray-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

export function ActiveSupportDetailPage() {
  const { id } = useParams()
  const [modalOpen, setModalOpen] = useState(false)
  const detail = id ? activeSupportDetails[id] : undefined

  if (!detail) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-gray-500">
          No progress details for this item yet.{' '}
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
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900">{detail.title}</h1>
              <span className="shrink-0 rounded-full bg-sky-100 text-sky-700 px-3 py-1 text-xs font-semibold">
                {detail.statusBadge}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
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
                <p className="text-sm text-gray-400">Expected completion</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.expectedCompletion}</p>
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
          </div>

          <Card>
            <p className="text-xs font-bold tracking-wide text-gray-400 mb-4">CURRENT PHASE</p>
            <SupportStageBar stageIndex={detail.stageIndex} />
          </Card>

          <SupportProgressDetails detail={detail} />
        </div>

        <div className="w-full lg:w-72 shrink-0 h-fit lg:sticky lg:top-6 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-col gap-2">
            <ActionButton icon={MessageIcon} label="Message practitioner" />
            <ActionButton icon={MessageIcon} label="Contact partner" />
            <ActionButton icon={LightningIcon} label="Update status" />
            <ActionButton icon={PlusIcon} label="Add note" />
            <ActionButton icon={DocumentIcon} label="Upload evidence" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <ActionButton icon={CheckCircleIcon} label="Mark ready for verification" primary />
          </div>
        </div>
      </div>

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
