import type { Elp } from '../data/mockDashboard'
import { elps, supportTypes } from '../data/mockDashboard'
import type { BatchWizardState } from '../lib/useBatchWizardState'
import { useState } from 'react'
import { WizardStepper } from './WizardStepper'
import { AwardIcon, CheckCircleIcon, SearchIcon } from './icons'

const inputClass = 'rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-900'

const TIER_CLASS: Record<string, string> = {
  Bronze: 'text-amber-600',
  Silver: 'text-gray-500',
  Gold: 'text-yellow-600',
}

const FULFILMENT_OPTIONS = [
  { id: 'self', title: 'Assign to my organisation', subtitle: 'EduPartners SA will lead fulfilment' },
  { id: 'collaborate', title: 'Collaborate with a provider', subtitle: 'EduPartners SA + invited partner' },
  { id: 'lead-provider', title: 'Assign a lead provider', subtitle: 'Another organisation leads fulfilment' },
  { id: 'pending', title: 'Leave provider assignment pending', subtitle: 'Decide after batch is confirmed' },
]

const STEP_LABELS = ['', 'Add ELPs', 'Review eligibility', 'Confirm batch', 'Fulfilment']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
      {label}
      {children}
    </label>
  )
}

// No real eligibility/overlap backend exists -- every selected ELP is
// treated as "Ready to include". This is a placeholder classification,
// not a real rules engine.
function classifyEligibility(selected: Elp[]) {
  return { readyToInclude: selected.length, complementaryAllowed: 0, needsReview: 0, excluded: 0 }
}

export function BatchRequestWizardBody({ state }: { state: BatchWizardState }) {
  const [query, setQuery] = useState('')
  const { step, selected, toggleElp, setSelected } = state

  const filteredElps = elps.filter((e) => {
    const q = query.toLowerCase()
    return e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
  })

  const eligibility = classifyEligibility(selected)

  return (
    <>
      <div className="mb-5">
        <WizardStepper current={step} />
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Field label="Batch name">
            <input
              value={state.batchName}
              onChange={(e) => state.setBatchName(e.target.value)}
              placeholder="e.g. First Aid Training — Limpopo cohort"
              className={inputClass}
            />
          </Field>

          <Field label="Support type">
            <select value={state.supportType} onChange={(e) => state.setSupportType(e.target.value)} className={inputClass}>
              <option value="">Choose a support type...</option>
              {supportTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Request description">
            <textarea
              value={state.description}
              onChange={(e) => state.setDescription(e.target.value)}
              placeholder="Describe the support needed for this group of ELPs..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Priority">
              <select value={state.priority} onChange={(e) => state.setPriority(e.target.value)} className={inputClass}>
                <option value="">Select priority...</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </Field>
            <Field label="Region">
              <input
                value={state.region}
                onChange={(e) => state.setRegion(e.target.value)}
                placeholder="e.g. Limpopo"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Timeframe">
            <input
              value={state.timeframe}
              onChange={(e) => state.setTimeframe(e.target.value)}
              placeholder="e.g. Within 2 weeks"
              className={inputClass}
            />
          </Field>

          <Field label="Reason for grouping">
            <input
              value={state.groupingReason}
              onChange={(e) => state.setGroupingReason(e.target.value)}
              placeholder="e.g. Same district, same cohort"
              className={inputClass}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, location or ID..."
                className={`${inputClass} w-full pl-9`}
              />
            </div>
            <button
              type="button"
              onClick={() => setSelected(filteredElps.every((e) => selected.some((s) => s.id === e.id)) ? [] : filteredElps)}
              className="shrink-0 text-sm font-semibold text-violet-600"
            >
              Select all
            </button>
          </div>

          <ul className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
            {filteredElps.map((elp) => {
              const isSelected = selected.some((s) => s.id === elp.id)
              return (
                <li key={elp.id} className={`border-b border-gray-100 last:border-b-0 ${isSelected ? 'bg-violet-50' : ''}`}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleElp(elp)} className="h-4 w-4" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{elp.name}</p>
                      <p className="text-xs text-gray-400">{elp.location}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-sm font-semibold ${TIER_CLASS[elp.tier]}`}>
                      <AwardIcon className="h-4 w-4" />
                      {elp.tier}
                    </span>
                    {elp.myElp && <span className="text-sm font-semibold text-violet-600">My ELP</span>}
                  </label>
                </li>
              )
            })}
          </ul>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((elp) => (
                <span
                  key={elp.id}
                  className="flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-700 px-3 py-1 text-sm font-semibold"
                >
                  {elp.name}
                  <button type="button" onClick={() => toggleElp(elp)} aria-label={`Remove ${elp.name}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-teal-600">{eligibility.readyToInclude}</p>
              <p className="text-sm text-gray-500 mt-1">Ready to include</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{eligibility.complementaryAllowed}</p>
              <p className="text-sm text-gray-500 mt-1">Complementary allowed</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-sky-600">{eligibility.needsReview}</p>
              <p className="text-sm text-gray-500 mt-1">Needs review</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{eligibility.excluded}</p>
              <p className="text-sm text-gray-500 mt-1">Excluded</p>
            </div>
          </div>

          <p className="text-sm text-gray-500">{selected.length} ELPs · eligibility checked against support type</p>

          {selected.length === 0 ? (
            <p className="text-center text-gray-400 py-6">No ELPs selected — go back to Step 2.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selected.map((elp) => (
                <li key={elp.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
                  <span className="text-sm font-medium text-gray-900">{elp.name}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-teal-600">
                    <CheckCircleIcon className="h-4 w-4" />
                    Ready to include
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-violet-50 text-violet-900 p-4 text-sm">
            You are creating a <strong>support</strong> batch for <strong>{selected.length} ELPs</strong>.
          </div>

          <dl className="flex flex-col">
            {[
              ['Batch name', state.batchName],
              ['Support type', state.supportType],
              ['Priority', state.priority],
              ['Region', state.region],
              ['Timeframe', state.timeframe],
              ['Grouping reason', state.groupingReason],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{value || '—'}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg bg-teal-50 p-4">
              <p className="text-sm font-semibold text-teal-700">Included ({eligibility.readyToInclude})</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-700">Needs review / Excluded (0)</p>
              <p className="text-sm text-gray-400 mt-1">None</p>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-3">
          {FULFILMENT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${
                state.fulfilment === opt.id ? 'border-violet-400 bg-violet-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="fulfilment"
                checked={state.fulfilment === opt.id}
                onChange={() => state.setFulfilment(opt.id)}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{opt.title}</p>
                <p className="text-sm text-gray-500">{opt.subtitle}</p>
              </div>
            </label>
          ))}
        </div>
      )}
    </>
  )
}

export function BatchRequestWizardFooter({
  state,
  onCancel,
  onSubmit,
}: {
  state: BatchWizardState
  onCancel: () => void
  onSubmit: () => void
}) {
  const { step, setStep } = state

  return (
    <div className="flex justify-between gap-3">
      <div className="flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="rounded-full border border-gray-300 px-5 py-2 text-sm font-bold text-gray-700"
          >
            Back
          </button>
        )}
        {step !== 3 && step !== 4 && (
          <button type="button" onClick={onCancel} className="rounded-full border border-gray-300 px-5 py-2 text-sm font-bold text-gray-700">
            Cancel
          </button>
        )}
      </div>

      {step < 5 ? (
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-bold text-white"
        >
          Next: {STEP_LABELS[step]} <span aria-hidden="true">›</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          className="flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-bold text-white"
        >
          ✓ Submit batch request
        </button>
      )}
    </div>
  )
}
