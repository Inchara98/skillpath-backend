export function StatTile({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
      <p className={`text-3xl font-bold ${className}`}>{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
}
