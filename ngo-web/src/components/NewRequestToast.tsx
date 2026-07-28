import { useNavigate } from 'react-router-dom'
import { useDonationAlerts } from '../lib/DonationAlertsContext'
import { BellIcon, CloseIcon } from './icons'

// Sits fixed at the top of the viewport whenever a new donation request
// arrives -- the bell shake alone was too easy to miss since it's a small
// icon in a corner; this is meant to be genuinely hard not to notice,
// the same way a new WhatsApp message banner would be.
export function NewRequestToast() {
  const { justArrived, latestArrival, dismissToast } = useDonationAlerts()
  const navigate = useNavigate()

  if (!justArrived || latestArrival.length === 0) return null

  const first = latestArrival[0]
  const extra = latestArrival.length - 1

  return (
    <div className="fixed top-4 right-4 z-[100] w-96 max-w-[calc(100vw-2rem)] animate-[toast-in_0.3s_ease-out]">
      <div className="flex items-start gap-3 rounded-xl bg-white shadow-2xl ring-1 ring-black/10 border-l-4 border-red-500 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <BellIcon className="h-5 w-5 text-red-600" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">
            New donation request{first.crId ? ` — ${first.crId}` : ''}
          </p>
          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{first.description}</p>
          {extra > 0 && <p className="text-xs text-gray-400 mt-1">+{extra} more new request{extra > 1 ? 's' : ''}</p>}
          <button
            type="button"
            onClick={() => {
              dismissToast()
              navigate(`/actions/donation-${first.id}`)
            }}
            className="mt-2 text-sm font-semibold text-violet-600 hover:text-violet-700"
          >
            Review now →
          </button>
        </div>
        <button
          type="button"
          onClick={dismissToast}
          className="text-gray-300 hover:text-gray-500 shrink-0"
          aria-label="Dismiss"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
