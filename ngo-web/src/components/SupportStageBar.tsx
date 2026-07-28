import { SUPPORT_STAGES } from '../data/mockDashboard'

// Darker purple as the stage progresses, matching the reference design's
// gradient-by-stage treatment.
const FILLED_CLASS = ['bg-violet-300', 'bg-violet-400', 'bg-violet-500', 'bg-violet-600', 'bg-violet-800']

export function SupportStageBar({ stageIndex }: { stageIndex: number }) {
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${SUPPORT_STAGES.length}, 1fr)` }}>
        {SUPPORT_STAGES.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full ${i < stageIndex ? FILLED_CLASS[i] : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="grid gap-1 mt-1.5" style={{ gridTemplateColumns: `repeat(${SUPPORT_STAGES.length}, 1fr)` }}>
        {SUPPORT_STAGES.map((label, i) => (
          <span key={label} className="min-w-0 text-xs font-semibold text-violet-600 break-words">
            {i < stageIndex ? label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
