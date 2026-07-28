import { notifications } from '../data/mockDashboard'
import { useExclusiveMenu } from '../lib/OpenMenuContext'
import { BellIcon } from './icons'

export function NotificationsPanel() {
  const { ref, isOpen, toggle, close } = useExclusiveMenu()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative text-gray-500 hover:text-gray-700"
        aria-label="Notifications"
      >
        <BellIcon className="h-6 w-6" />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-3 w-80 max-w-[90vw] rounded-xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-900">Notifications</p>
              {notifications.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </div>

            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100">
                    <BellIcon className="h-4 w-4 text-violet-600" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      {n.title}
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{n.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="w-full py-3 text-center text-sm font-semibold text-violet-600 hover:text-violet-700"
              onClick={close}
            >
              View all notifications
            </button>
        </div>
      )}
    </div>
  )
}
