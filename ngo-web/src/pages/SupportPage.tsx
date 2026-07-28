import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { SupportStageBar } from '../components/SupportStageBar'
import { Dropdown } from '../components/Dropdown'
import { HorizontalBarChart } from '../components/HorizontalBarChart'
import { DonutChart } from '../components/DonutChart'
import {
  activeSupport,
  activeSupportDetails,
  completedSupport,
  completedSupportDetails,
  impactStats,
  impactSummary,
  impactBySupportType,
  outcomeStatus,
  outcomeHighlights,
  quickInsights,
  SUPPORT_STAGES,
} from '../data/mockDashboard'
import { CheckCircleIcon, LightningIcon, LocationIcon } from '../components/icons'

type Tab = 'active' | 'completed' | 'impact'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

function ActiveCard({ item }: { item: (typeof activeSupport)[number] }) {
  return (
    <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[item.priority]} p-5 md:p-6`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-gray-900">{item.title}</h3>
            {item.badges.map((b) => (
              <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}>
                {b.label}
              </span>
            ))}
          </div>
          {item.org ? (
            <p className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              {item.org} <LocationIcon className="h-3.5 w-3.5 text-gray-400" /> {item.location}
            </p>
          ) : (
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-semibold">Lead:</span> {item.lead} <span className="font-semibold ml-2">With:</span> {item.with}
            </p>
          )}
        </div>
        {activeSupportDetails[item.id] ? (
          <Link
            to={`/support/${item.id}`}
            className="shrink-0 flex items-center gap-1 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            {item.buttonLabel} <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <button
            type="button"
            className="shrink-0 flex items-center gap-1 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            {item.buttonLabel} <span aria-hidden="true">›</span>
          </button>
        )}
      </div>

      <div className="mt-4">
        {item.batch ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                ['Completed', item.batch.completed, 'text-teal-600'],
                ['Scheduled', item.batch.scheduled, 'text-sky-600'],
                ['Awaiting', item.batch.awaiting, 'text-amber-500'],
                ['Blocked', item.batch.blocked, 'text-red-600'],
                ['Total ELPs', item.batch.total, 'text-gray-700'],
              ].map(([label, value, cls]) => (
                <div key={label as string}>
                  <p className={`text-xl font-bold ${cls}`}>{value}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>
                {item.batch.completed} of {item.batch.total} ELPs completed
              </span>
              <span>{Math.round((item.batch.completed / item.batch.total) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 mt-1">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{ width: `${(item.batch.completed / item.batch.total) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <SupportStageBar stageIndex={item.stageIndex} />
        )}
      </div>

      <div className="rounded-lg bg-gray-50 p-4 mt-4">
        <p className="text-sm text-gray-400">Latest update</p>
        <p className="text-sm text-gray-700 mt-0.5">{item.latestUpdate}</p>
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Expected completion: <span className="font-semibold text-gray-900">{item.expectedCompletion}</span>
      </p>
    </div>
  )
}

function CompletedCard({ item }: { item: (typeof completedSupport)[number] }) {
  return (
    <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[item.priority]} p-5 md:p-6`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">{item.title}</h3>
          <p className="flex items-center gap-1 text-sm text-gray-600 mt-1">
            {item.org} <LocationIcon className="h-3.5 w-3.5 text-gray-400" /> {item.location}
          </p>
        </div>
        {completedSupportDetails[item.id] ? (
          <Link
            to={`/support/completed/${item.id}`}
            className="shrink-0 rounded-full border border-gray-300 text-gray-700 px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            View details
          </Link>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded-full border border-gray-300 text-gray-700 px-4 py-2 text-sm font-bold whitespace-nowrap"
          >
            View details
          </button>
        )}
      </div>

      <div className="mt-4">
        <SupportStageBar stageIndex={SUPPORT_STAGES.length} />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-teal-50 text-teal-800 p-4 mt-4">
        <CheckCircleIcon className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{item.outcomeLabel}</p>
          <p className="text-sm mt-0.5">{item.outcomeDescription}</p>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Completed: <span className="font-semibold text-gray-900">{item.completedDate}</span>
        <span className="mx-2">·</span>
        Satisfaction: <span className="font-semibold text-gray-900">{item.satisfaction}</span>
        <span className="mx-2">·</span>
        Partners: <span className="font-semibold text-gray-900">{item.partners}</span>
      </p>
    </div>
  )
}

function ImpactTab() {
  const [period, setPeriod] = useState('Last 12 months')

  return (
    <div className="flex flex-col gap-6 mt-6">
      <div className="flex justify-end">
        <Dropdown
          label="Reporting period"
          value={period}
          onChange={setPeriod}
          options={[{ label: 'Last 12 months' }, { label: 'Last 90 days' }, { label: 'Last 30 days' }]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {impactStats.map((s) => (
          <div key={s.label} className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
            <p className={`text-3xl font-bold ${s.className}`}>{s.value}</p>
            <p className="text-sm text-gray-700 mt-1">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 p-6">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-violet-600 mb-2">
          <LightningIcon className="h-4 w-4" />
          AI IMPACT SUMMARY
        </p>
        <p className="text-violet-900">{impactSummary}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-bold text-gray-900 mb-4">Impact by support type</h2>
          <HorizontalBarChart data={impactBySupportType} />
        </Card>
        <Card>
          <h2 className="font-bold text-gray-900 mb-4">Outcome status</h2>
          <DonutChart data={outcomeStatus} />
        </Card>
      </div>

      <Card>
        <h2 className="font-bold text-gray-900 mb-4">Outcome highlights</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {outcomeHighlights.map((h) => (
            <li key={h} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircleIcon className="h-4 w-4 text-teal-600 shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quickInsights.map((q) => (
          <div key={q.title} className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
            <p className="flex items-center gap-2 font-semibold text-gray-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-xs">i</span>
              {q.title}
            </p>
            <p className="text-sm text-gray-500 mt-2">{q.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SupportPage() {
  const [tab, setTab] = useState<Tab>('active')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <h1 className="text-2xl font-bold text-gray-900">My Support</h1>
      <p className="text-gray-500 mt-1">All support your organisation has committed to.</p>

      <div className="flex gap-1 rounded-full bg-gray-100 p-1 w-fit mt-6">
        {([
          ['active', 'Active'],
          ['completed', 'Completed'],
          ['impact', 'My Impact'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-5 py-2 text-sm font-bold ${tab === id ? 'bg-violet-600 text-white' : 'text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <div className="flex flex-col gap-4 mt-6">
          {activeSupport.map((item) => (
            <ActiveCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {tab === 'completed' && (
        <div className="flex flex-col gap-4 mt-6">
          {completedSupport.map((item) => (
            <CompletedCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {tab === 'impact' && <ImpactTab />}

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
