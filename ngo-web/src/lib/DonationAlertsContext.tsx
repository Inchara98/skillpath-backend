import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchDonationRequests } from './ngoRequestsApi'

const POLL_INTERVAL_MS = 15000
const SHAKE_DURATION_MS = 2500

interface DonationAlertsValue {
  // Requests that haven't been actioned yet (status requested or confirmed) --
  // this is the "unread" count shown next to My Actions Centre and on the
  // bell icon, same idea as an unread message count in WhatsApp itself.
  newCount: number
  // True for a few seconds right after newCount increases -- used to
  // trigger the bell's shake animation exactly once per new arrival,
  // not continuously.
  justArrived: boolean
}

const DonationAlertsContext = createContext<DonationAlertsValue>({ newCount: 0, justArrived: false })

export function useDonationAlerts() {
  return useContext(DonationAlertsContext)
}

export function DonationAlertsProvider({ children }: { children: ReactNode }) {
  const [newCount, setNewCount] = useState(0)
  const [justArrived, setJustArrived] = useState(false)
  const previousCount = useRef<number | null>(null)
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const requests = await fetchDonationRequests()
        if (cancelled) return
        const unread = requests.filter((r) => r.status === 'requested' || r.status === 'confirmed').length

        // Only shake when the count goes UP from a known previous value --
        // not on first load (nothing "just arrived", it was already there)
        // and not when the count drops as requests get actioned.
        if (previousCount.current !== null && unread > previousCount.current) {
          setJustArrived(true)
          if (shakeTimeout.current) clearTimeout(shakeTimeout.current)
          shakeTimeout.current = setTimeout(() => setJustArrived(false), SHAKE_DURATION_MS)
        }
        previousCount.current = unread
        setNewCount(unread)
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
    <DonationAlertsContext.Provider value={{ newCount, justArrived }}>{children}</DonationAlertsContext.Provider>
  )
}
