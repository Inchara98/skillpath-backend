import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { NotificationsPanel } from '../components/NotificationsPanel'
import { DonationAlertsProvider, useDonationAlerts } from '../lib/DonationAlertsContext'
import { BookIcon, ClipboardIcon, HouseIcon, LogOutIcon, MenuIcon, PlusIcon, ShieldIcon } from '../components/icons'

const NAV_ITEMS = [
  { to: '/actions', label: 'My Actions Centre', icon: HouseIcon },
  { to: '/support', label: 'My Support', icon: ClipboardIcon },
  { to: '/elps', label: 'ELPs', icon: BookIcon },
]

// Mock signed-in identity for display only -- there's no name/org field on
// profiles yet, just org_type. Matches the reference design's header.
const MOCK_IDENTITY = { name: 'Tracey van der Merwe', org: 'EduPartners SA' }

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { newCount } = useDonationAlerts()

  return (
    <>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span className="flex-1">{label}</span>
            {to === '/actions' && newCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {newCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <p className="mt-auto p-4 text-xs text-gray-400">
        Data from partner systems, programme records, government sources and submitted updates.
      </p>
    </>
  )
}

export function DashboardLayout({ children, onNewRequest }: { children: ReactNode; onNewRequest: () => void }) {
  const { signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <DonationAlertsProvider>
      <div className="h-screen overflow-hidden flex flex-col bg-gray-50">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="flex h-[72px] items-center gap-3 px-4 md:px-6">
            <button
              type="button"
              className="lg:hidden text-gray-500"
              aria-label="Toggle navigation"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <MenuIcon className="h-6 w-6" />
            </button>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600">
              <ShieldIcon className="h-5 w-5 text-white" />
            </span>
            <div className="hidden sm:block">
              <p className="font-bold text-gray-900 leading-tight">ELP Partner</p>
              <p className="text-xs text-gray-400 leading-tight">Platform</p>
            </div>

            <div className="ml-auto flex items-center gap-2 md:gap-4">
              <button
                type="button"
                onClick={onNewRequest}
                className="flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 md:px-4 text-sm font-bold"
              >
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Support Request</span>
              </button>

              <NotificationsPanel />

              <div className="hidden md:flex items-center gap-2 border-l border-gray-200 pl-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-sm font-bold">
                  {MOCK_IDENTITY.name.charAt(0)}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-gray-900">{MOCK_IDENTITY.name}</p>
                  <p className="text-xs text-gray-400">{MOCK_IDENTITY.org}</p>
                </div>
              </div>

              <button type="button" onClick={() => signOut()} className="text-gray-400 hover:text-gray-600" aria-label="Sign out">
                <LogOutIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <SidebarNav />
          </aside>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} />
              <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-white shadow-xl overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
              </aside>
            </div>
          )}

          <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </DonationAlertsProvider>
  )
}
