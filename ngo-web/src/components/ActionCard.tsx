import { Link } from 'react-router-dom'
import { supportRequestDetails, type ActionItem } from '../data/mockDashboard'
import { CheckCircleIcon, WarningIcon, InfoIcon } from './icons'

const PRIORITY_BORDER = {
  high: 'border-red-400',
  medium: 'border-amber-400',
  low: 'border-sky-400',
}

function MetaLine({ meta }: { meta: string }) {
  // "8 ELPs · 3 in My ELPs · 6 eligible · 1 overlap · 1 needs verification"
  // -- only the counts after the first two segments get an icon, matching
  // the reference design's checkmark/warning/info chips.
  const parts = meta.split(' · ')
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm">
      {parts.map((part, i) => {
        if (/eligible/i.test(part)) {
          return (
            <span key={i} className="flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 px-2 py-0.5">
              <CheckCircleIcon className="h-3.5 w-3.5" /> {part}
            </span>
          )
        }
        if (/overlap/i.test(part)) {
          return (
            <span key={i} className="flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5">
              <WarningIcon className="h-3.5 w-3.5" /> {part}
            </span>
          )
        }
        if (/verification/i.test(part)) {
          return (
            <span key={i} className="flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
              <InfoIcon className="h-3.5 w-3.5" /> {part}
            </span>
          )
        }
        return (
          <span key={i} className="text-gray-500">
            {part}
          </span>
        )
      })}
    </div>
  )
}

export function ActionCard({ item }: { item: ActionItem }) {
  const hasReviewPage = item.id.startsWith('donation-') || Boolean(supportRequestDetails[item.id])
  const buttonClassName =
    'flex items-center gap-1 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold whitespace-nowrap'

  return (
    <div className={`rounded-xl bg-white shadow-sm ring-1 ring-black/5 border-l-4 ${PRIORITY_BORDER[item.priority]} p-4 md:p-5`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          {item.org && (
            <span className="text-gray-700">
              {item.org} · {item.location}
            </span>
          )}
          {item.badges.map((badge) => (
            <span key={badge.label} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          ))}
        </div>

        <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0">
          {item.completed ? (
            <span className="flex items-center gap-1.5 rounded-full bg-teal-50 text-teal-700 px-4 py-2 text-sm font-bold whitespace-nowrap">
              <CheckCircleIcon className="h-4 w-4" /> Completed
            </span>
          ) : hasReviewPage ? (
            <Link to={`/actions/${item.id}`} className={buttonClassName}>
              {item.buttonLabel} <span aria-hidden="true">›</span>
            </Link>
          ) : (
            <button type="button" className={buttonClassName}>
              {item.buttonLabel} <span aria-hidden="true">›</span>
            </button>
          )}
          <p className="text-xs text-gray-400 whitespace-nowrap">{item.timing}</p>
        </div>
      </div>

      <p className="font-bold text-gray-900 mt-3">{item.title}</p>
      <p className="text-sm text-gray-500">{item.category}</p>
      {item.description && <p className="text-sm text-gray-500 mt-1">{item.description}</p>}
      {item.completed && item.completedNote && (
        <p className="flex items-center gap-1.5 text-sm text-teal-700 mt-2">
          <CheckCircleIcon className="h-4 w-4 shrink-0" /> {item.completedNote}
        </p>
      )}
      {item.meta && <MetaLine meta={item.meta} />}

      {item.chips && (
        <div className="flex flex-wrap gap-2 mt-3">
          {item.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 text-xs font-semibold"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
