// Categorical part-to-whole with 4 status-semantic colors (see
// mockDashboard.ts's outcomeStatus comment for why these aren't a generic
// categorical set). A legend with text labels always accompanies the
// ring so identity never depends on color alone.
export function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = 60
  const strokeWidth = 22
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const segments = data.map((d) => {
    const fraction = d.value / total
    const dash = fraction * circumference
    const gap = circumference - dash
    const seg = { ...d, dash, gap, offset }
    offset += dash
    return seg
  })

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90">
        {segments.map((s) => (
          <circle
            key={s.label}
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>

      <ul className="flex flex-col gap-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            {d.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
