// Single-hue magnitude bar chart. One brand color throughout (not a
// categorical palette) -- per the dataviz skill, "compare magnitude"
// data uses sequential/one-hue color, not per-category identity.
export function HorizontalBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = Math.max((d.value / max) * 100, 14) // keep short bars readable
        return (
          <div key={d.label} className="grid grid-cols-[minmax(0,auto)_1fr] sm:grid-cols-[200px_1fr] items-center gap-3">
            <span className="text-sm text-gray-600 truncate">{d.label}</span>
            <div className="h-6 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-violet-600 flex items-center justify-end px-2.5"
                style={{ width: `${pct}%` }}
              >
                <span className="text-xs font-bold text-white">{d.value}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
