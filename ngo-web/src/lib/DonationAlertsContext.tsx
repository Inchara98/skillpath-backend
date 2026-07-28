import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchDonationRequests, type DonationRequest } from './ngoRequestsApi'

const POLL_INTERVAL_MS = 5000
const TOAST_DURATION_MS = 6000

interface DonationAlertsValue {
  // Every donation request, any status, newest first -- the single
  // shared source of truth for the Actions Centre list, its stat tile,
  // and anywhere else real donation data is shown. Polled the same way
  // as newRequests below, so everything updates together automatically
  // instead of each page fetching (and going stale) independently.
  allRequests: DonationRequest[]
  // Requests that haven't been actioned yet (status requested or confirmed) --
  // this is the "unread" count shown next to My Actions Centre and on the
  // bell icon, same idea as an unread message count in WhatsApp itself.
  newCount: number
  // The actual unread requests, newest first -- lets the UI deep-link
  // straight to a specific request rather than just the general list.
  newRequests: DonationRequest[]
  // True for a few seconds right after newCount increases -- used to
  // trigger the bell's shake animation exactly once per new arrival,
  // not continuously.
  justArrived: boolean
  // The request(s) that triggered the most recent justArrived moment --
  // used to populate the toast banner with something concrete to show
  // and click through to, not just a generic "something changed" message.
  latestArrival: DonationRequest[]
  dismissToast: () => void
}

const DonationAlertsContext = createContext<DonationAlertsValue>({
  allRequests: [],
  newCount: 0,
  newRequests: [],
  justArrived: false,
  latestArrival: [],
  dismissToast: () => {},
})

export function useDonationAlerts() {
  return useContext(DonationAlertsContext)
}

export function DonationAlertsProvider({ children }: { children: ReactNode }) {
  const [allRequests, setAllRequests] = useState<DonationRequest[]>([])
  const [newRequests, setNewRequests] = useState<DonationRequest[]>([])
  const [justArrived, setJustArrived] = useState(false)
  const [latestArrival, setLatestArrival] = useState<DonationRequest[]>([])
  const previousIds = useRef<Set<string> | null>(null)
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const requests = await fetchDonationRequests()
        if (cancelled) return
        const sorted = [...requests].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        const unread = sorted.filter((r) => r.status === 'requested' || r.status === 'confirmed')
        const currentIds = new Set(unread.map((r) => r.id))

        // Only flag genuinely NEW arrivals (ids we haven't seen as unread
        // before) -- not on first load, and not just because the set
        // shrank when something got actioned.
        if (previousIds.current !== null) {
          const arrivals = unread.filter((r) => !previousIds.current!.has(r.id))
          if (arrivals.length > 0) {
            setLatestArrival(arrivals)
            setJustArrived(true)
            if (shakeTimeout.current) clearTimeout(shakeTimeout.current)
            shakeTimeout.current = setTimeout(() => setJustArrived(false), TOAST_DURATION_MS)
          }
        }
        previousIds.current = currentIds
        setNewRequests(unread)
        setAllRequests(sorted)
      } catch (err) {
        console.error('[ngo-web] failed to poll for new donation requests:', err)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current)
    }
  }, [])

  return (
    <DonationAlertsContext.Provider
      value={{
        allRequests,
        newCount: newRequests.length,
        newRequests,
        justArrived,
        latestArrival,
        dismissToast: () => setJustArrived(false),
      }}
    >
      {children}
    </DonationAlertsContext.Provider>
  )
}
