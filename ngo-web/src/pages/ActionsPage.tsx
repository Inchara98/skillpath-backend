import { useEffect, useState } from 'react'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { ActionCard } from '../components/ActionCard'
import { StatTile } from '../components/StatTile'
import { ComingUpPanel } from '../components/ComingUpPanel'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { Dropdown } from '../components/Dropdown'
import { actionItems as mockActionItems, statTiles, type ActionItem, type Priority } from '../data/mockDashboard'
import { fetchDonationRequests } from '../lib/ngoRequestsApi'
import { donationRequestToActionItem } from '../lib/donationActionItem'

const ACTION_TYPE_OPTIONS: { label: string; match: string | null }[] = [
  { label: 'All actions', match: null },
  { label: 'New requests', match: 'New request' },
  { label: 'In progress', match: 'In progress' },
  { label: 'Follow-ups', match: 'Follow-up' },
  { label: 'Reports & evidence', match: 'Reports & evidence' },
  { label: 'Verification', match: 'Verification' },
  { label: 'Data updates', match: 'Data update' },
  { label: 'Batch requests', match: 'Batch Request' },
]

const PRIORITY_OPTIONS: { label: string; match: Priority | null; dot?: string }[] = [
  { label: 'All priorities', match: null },
  { label: 'High priority', match: 'high', dot: 'bg-red-500' },
  { label: 'Medium priority', match: 'medium', dot: 'bg-amber-500' },
  { label: 'Low priority', match: 'low', dot: 'bg-sky-500' },
]

export function ActionsPage() {
  const [actionType, setActionType] = useState('All actions')
  const [priority, setPriority] = useState('All priorities')
  const [modalOpen, setModalOpen] = useState(false)
  const [donationItems, setDonationItems] = useState<ActionItem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchDonationRequests()
      .then((requests) => {
        if (cancelled) return
        const sorted = [...requests].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        setDonationItems(sorted.map(donationRequestToActionItem))
      })
      .catch((err) => {
        // Fails quietly here -- the rest of the (mock) Actions Centre
        // should still work even if the real backend is unreachable.
        console.error('[ngo-web] failed to load donation requests for Actions Centre:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Real donation requests appear first (most recently raised at the
  // top), ahead of the mock items -- same reasoning as everywhere else
  // in this integration: real, live data takes priority over the
  // reference-design mock content.
  const allItems = [...donationItems, ...mockActionItems]

  const actionMatch = ACTION_TYPE_OPTIONS.find((o) => o.label === actionType)?.match ?? null
  const priorityMatch = PRIORITY_OPTIONS.find((o) => o.label === priority)?.match ?? null

  const filtered = allItems.filter((item) => {
    if (actionMatch && !item.badges.some((b) => b.label === actionMatch)) return false
    if (priorityMatch && item.priority !== priorityMatch) return false
    return true
  })

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <h1 className="text-2xl font-bold text-gray-900">My Actions Centre</h1>
      <p className="text-gray-500 mt-1">What needs your attention, and what should you do next?</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {statTiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 mt-6">
        <Dropdown label="Action type" value={actionType} onChange={setActionType} options={ACTION_TYPE_OPTIONS} />
        <Dropdown label="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400">No actions match these filters.</p>
          ) : (
            filtered.map((item) => <ActionCard key={item.id} item={item} />)
          )}
        </div>
        <ComingUpPanel />
      </div>

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
