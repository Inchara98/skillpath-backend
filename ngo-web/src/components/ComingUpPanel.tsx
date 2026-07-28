import { comingUp } from '../data/mockDashboard'

export function ComingUpPanel() {
  return (
    <div className="w-full lg:w-72 shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5 h-fit">
      <p className="text-xs font-bold tracking-wide text-gray-400 mb-4">COMING UP</p>
      <ul className="flex flex-col gap-4">
        {comingUp.map((item) => (
          <li key={item.title} className="flex gap-3 border-l-2 border-violet-300 pl-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.date} · {item.type}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
