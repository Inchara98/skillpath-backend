import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { Dropdown } from '../components/Dropdown'
import { elps, elpDetails, ELP_STATUS_META, type Elp } from '../data/mockDashboard'
import { AwardIcon, LayersIcon, ListIcon, LocationIcon, SearchIcon } from '../components/icons'

type Tab = 'my' | 'search'
type StatusFilter = 'all' | 'active' | 'none'
type View = 'list' | 'map'

const MY_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All ELPs' },
  { id: 'active', label: 'Currently active' },
  { id: 'none', label: 'Previously supported' },
]

const PROVINCES = ['All provinces', ...Array.from(new Set(elps.map((e) => e.location.split(', ')[1])))]
const TIERS = ['All tiers', 'Pre-Bronze', 'Bronze', 'Silver', 'Gold']
const TYPES = ['All types', 'Centre-Based', 'Non-Centre-Based']
const SUPPORT_STATUSES = ['All support status', ...Object.values(ELP_STATUS_META).map((s) => s.label)]

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex gap-1 rounded-full border border-gray-300 p-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
          view === 'list' ? 'bg-violet-600 text-white' : 'text-gray-600'
        }`}
      >
        <ListIcon className="h-4 w-4" />
        List
      </button>
      <button
        type="button"
        onClick={() => onChange('map')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
          view === 'map' ? 'bg-violet-600 text-white' : 'text-gray-600'
        }`}
      >
        <LayersIcon className="h-4 w-4" />
        Map
      </button>
    </div>
  )
}

function MapPlaceholder() {
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-12 mt-6 text-center text-gray-400">Map view isn't built yet.</div>
  )
}

function ViewElpButton({ elpId }: { elpId: string }) {
  const className = 'rounded-full bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold whitespace-nowrap'
  return elpDetails[elpId] ? (
    <Link to={`/elps/${elpId}`} className={`flex items-center gap-1 ${className}`}>
      View ELP <span aria-hidden="true">›</span>
    </Link>
  ) : (
    <button type="button" className={`flex items-center gap-1 ${className}`}>
      View ELP <span aria-hidden="true">›</span>
    </button>
  )
}

function SecondaryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-full border border-gray-300 text-gray-700 px-4 py-2 text-sm font-bold whitespace-nowrap"
    >
      {label} <span aria-hidden="true">›</span>
    </button>
  )
}

function MyElpCard({ elp }: { elp: Elp }) {
  const status = elp.supportStatus ? ELP_STATUS_META[elp.supportStatus] : null

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-900">{elp.name}</h3>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
            <AwardIcon className="h-4 w-4" />
            {elp.tier}
          </span>
          {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>}
        </div>
        <p className="flex items-center gap-1 text-sm text-gray-500 mt-1">
          <LocationIcon className="h-3.5 w-3.5" />
          {elp.location}
        </p>
      </div>

      {elp.stats && (
        <div className="flex gap-6 shrink-0">
          {[
            ['Requests', elp.stats.requests, 'text-gray-900'],
            ['Done', elp.stats.done, 'text-teal-600'],
            ['Active', elp.stats.active, 'text-sky-600'],
            ['Pending', elp.stats.pending, 'text-amber-500'],
          ].map(([label, value, cls]) => (
            <div key={label as string}>
              <p className={`text-xl font-bold ${cls}`}>{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 shrink-0">
        {elp.lastEngagement && (
          <div className="text-right">
            <p className="text-sm text-gray-400">Last engagement</p>
            <p className="text-sm font-semibold text-gray-900">{elp.lastEngagement}</p>
          </div>
        )}
        <ViewElpButton elpId={elp.id} />
      </div>
    </div>
  )
}

function SearchElpCard({ elp }: { elp: Elp }) {
  const status = elp.supportStatus ? ELP_STATUS_META[elp.supportStatus] : null

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-900">{elp.name}</h3>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
            <AwardIcon className="h-4 w-4" />
            {elp.tier}
          </span>
          {elp.myElp && <span className="rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-semibold">My ELP</span>}
        </div>
        <p className="flex items-center gap-1 text-sm text-gray-500 mt-1">
          <LocationIcon className="h-3.5 w-3.5" />
          {elp.location} · {elp.id} · {elp.type}
        </p>
        {status && (
          <div className="flex items-center gap-2 mt-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
            {elp.lastEngagement && <span className="text-sm text-gray-400">Last contact: {elp.lastEngagement}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {!elp.myElp && <SecondaryButton label="Add to My ELPs" />}
        <SecondaryButton label="Raise support request" />
        <SecondaryButton label="Add to batch" />
        <SecondaryButton label="Find specialist" />
        <ViewElpButton elpId={elp.id} />
      </div>
    </div>
  )
}

function MyElpsTab() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<View>('list')

  const filtered = elps
    .filter((e) => e.myElp)
    .filter((e) => {
      if (filter === 'active' && e.supportStatus !== 'active') return false
      if (filter === 'none' && e.supportStatus !== 'none') return false
      const q = query.toLowerCase()
      return !q || e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)
    })

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mt-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or location..."
            className="w-full rounded-full border border-gray-300 pl-10 pr-4 py-2.5 text-sm"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {MY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap ${
                filter === f.id ? 'bg-violet-600 text-white' : 'border border-gray-300 text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'list' ? (
        <div className="flex flex-col gap-4 mt-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400">No ELPs match these filters.</p>
          ) : (
            filtered.map((elp) => <MyElpCard key={elp.id} elp={elp} />)
          )}
        </div>
      ) : (
        <MapPlaceholder />
      )}
    </>
  )
}

function SearchElpsTab() {
  const [query, setQuery] = useState('')
  const [province, setProvince] = useState('All provinces')
  const [tier, setTier] = useState('All tiers')
  const [type, setType] = useState('All types')
  const [status, setStatus] = useState('All support status')
  const [view, setView] = useState<View>('list')

  const filtered = elps.filter((e) => {
    if (province !== 'All provinces' && !e.location.endsWith(province)) return false
    if (tier !== 'All tiers' && e.tier !== tier) return false
    if (type !== 'All types' && e.type !== type) return false
    if (status !== 'All support status' && (!e.supportStatus || ELP_STATUS_META[e.supportStatus].label !== status)) return false
    const q = query.toLowerCase()
    return !q || e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)
  })

  return (
    <>
      <div className="flex flex-col gap-3 mt-6">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, location, tier, ELP owner..."
            className="w-full rounded-full border border-gray-300 pl-10 pr-4 py-2.5 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Dropdown label="" value={province} onChange={setProvince} options={PROVINCES.map((label) => ({ label }))} />
          <Dropdown label="" value={tier} onChange={setTier} options={TIERS.map((label) => ({ label }))} />
          <Dropdown label="" value={type} onChange={setType} options={TYPES.map((label) => ({ label }))} />
          <Dropdown label="" value={status} onChange={setStatus} options={SUPPORT_STATUSES.map((label) => ({ label }))} />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{filtered.length} ELPs found</p>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {view === 'list' ? (
        <div className="flex flex-col gap-4 mt-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400">No ELPs match these filters.</p>
          ) : (
            filtered.map((elp) => <SearchElpCard key={elp.id} elp={elp} />)
          )}
        </div>
      ) : (
        <MapPlaceholder />
      )}
    </>
  )
}

export function ElpsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('my')

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <h1 className="text-2xl font-bold text-gray-900">ELPs</h1>
      <p className="text-gray-500 mt-1">Manage your ELP portfolio and discover new ELPs across South Africa.</p>

      <div className="flex gap-6 mt-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('my')}
          className={`pb-3 text-sm font-bold ${tab === 'my' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-400'}`}
        >
          My ELPs
        </button>
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`pb-3 text-sm font-bold ${tab === 'search' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-400'}`}
        >
          Search ELPs
        </button>
      </div>

      {tab === 'my' ? <MyElpsTab /> : <SearchElpsTab />}

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
