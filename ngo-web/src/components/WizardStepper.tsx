const STEPS = ['Define need', 'Add ELPs', 'Review eligibility', 'Confirm batch', 'Fulfilment']

export function WizardStepper({ current }: { current: number }) {
  return (
    <div className="flex items-center overflow-x-auto">
      {STEPS.map((label, i) => {
        const stepNum = i + 1
        const done = stepNum < current
        const active = stepNum === current
        return (
          <div key={label} className="flex items-center shrink-0">
            {i > 0 && <div className={`h-px w-8 ${done || active ? 'bg-violet-300' : 'bg-gray-200'}`} />}
            <div className="flex items-center gap-1.5 px-1">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done || active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {done ? '✓' : stepNum}
              </span>
              <span className={`text-sm whitespace-nowrap ${active ? 'text-violet-600 font-semibold' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
