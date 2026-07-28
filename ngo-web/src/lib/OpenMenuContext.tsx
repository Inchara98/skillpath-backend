import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface OpenMenuContextValue {
  openId: string | null
  setOpenId: (id: string | null) => void
}

const OpenMenuContext = createContext<OpenMenuContextValue | undefined>(undefined)

// Wrap the app once with this so every dropdown/popover/panel shares one
// "which menu is open" slot -- opening any of them automatically closes
// whichever other one was open, instead of each tracking its own state.
export function OpenMenuProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return <OpenMenuContext.Provider value={{ openId, setOpenId }}>{children}</OpenMenuContext.Provider>
}

// Returns a ref to attach to the menu's root element, plus open state
// shared across every menu using this provider. Closing on an outside
// click is done via a document pointerdown listener rather than a
// full-screen overlay -- an overlay would swallow the click entirely,
// so clicking straight from one trigger to another would need two clicks
// (one to close, one to open) instead of switching in a single click.
export function useExclusiveMenu<T extends HTMLElement = HTMLDivElement>() {
  const context = useContext(OpenMenuContext)
  if (!context) throw new Error('useExclusiveMenu must be used within OpenMenuProvider')
  const { openId, setOpenId } = context
  const id = useId()
  const isOpen = openId === id
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenId(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, setOpenId])

  return {
    ref,
    isOpen,
    open: () => setOpenId(id),
    close: () => {
      if (isOpen) setOpenId(null)
    },
    toggle: () => setOpenId(isOpen ? null : id),
  }
}
