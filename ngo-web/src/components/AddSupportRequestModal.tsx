import { useState } from 'react'
import { elps, supportTypes, type Elp } from '../data/mockDashboard'
import { useExclusiveMenu } from '../lib/OpenMenuContext'
import { useBatchWizardState } from '../lib/useBatchWizardState'
import { BatchRequestWizardBody, BatchRequestWizardFooter } from './BatchRequestWizard'
import { CloseIcon, SearchIcon, ChevronDownIcon } from './icons'

type Tab = 'single' | 'batch'

function ElpPicker({ selected, onChange }: { selected: Elp[]; onChange: (elps: Elp[]) => void }) {
  const { ref, isOpen, toggle: togglePanel, close } = useExclusiveMenu<HTMLDivElement>()
  const [query, setQuery] = useState('')

  const filtered = elps.filter((e) => {
    const q = query.toLowerCase()
    return e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
  })

  function selectElp(elp: Elp) {
    onChange([elp])
    close()
  }

  const summary = selected.length === 0 ? 'Search and select an ELP...' : selected[0].name

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        className={`flex w-full items-center justify-between rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm ${
          selected.length === 0 ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {summary}
        <ChevronDownIcon className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="relative p-2 border-b border-gray-100">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, location or ID..."
              className="w-full rounded-md border border-violet-400 pl-9 pr-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.map((elp) => {
              const isSelected = selected.some((s) => s.id === elp.id)
              return (
                <li key={elp.id}>
                  <button
                    type="button"
                    onClick={() => selectElp(elp)}
                    className={`flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-gray-50 ${
                      isSelected ? 'bg-violet-50' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{elp.name}</span>
                    <span className="text-xs text-gray-400">
                      {elp.location} · {elp.id}
                    </span>
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">No ELPs match "{query}"</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
      {label}
      {children}
    </label>
  )
}

const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-900'

export function AddSupportRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('single')
  const [selectedElp, setSelectedElp] = useState<Elp[]>([])
  const [supportType, setSupportType] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignTo, setAssignTo] = useState('To self')
  const batchState = useBatchWizardState()

  if (!open) return null

  function reset() {
    setTab('single')
    setSelectedElp([])
    setSupportType('')
    setDescription('')
    setPriority('')
    setDueDate('')
    setAssignTo('To self')
    batchState.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  // No backend for support requests yet -- this just resets the form.
  // See ngo-web's mock data module for why: none of this domain exists
  // anywhere in the project's backend yet.
  function handleSubmit() {
    handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-7xl max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add New Support Request</h2>
            <p className="text-sm text-gray-500 mt-0.5">Raise a support request on behalf of one or more ELPs.</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 w-fit">
            {(['single', 'batch'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                  tab === t ? 'bg-violet-600 text-white' : 'text-gray-600'
                }`}
              >
                {t === 'single' ? 'Single Request' : 'Batch Request'}
              </button>
            ))}
          </div>

          {tab === 'single' ? (
            <>
              <Field label="Select ELP">
                <ElpPicker selected={selectedElp} onChange={setSelectedElp} />
              </Field>

              <Field label="Support type">
                <select value={supportType} onChange={(e) => setSupportType(e.target.value)} className={selectClass}>
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the support needed, context, and any specific requirements..."
                  rows={3}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 resize-none"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Priority">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
                    <option value="">Select priority...</option>
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                </Field>

                <Field label="Expected fulfilment date">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={selectClass} />
                </Field>
              </div>

              <Field label="Assign to">
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className={selectClass}>
                  <option>To self</option>
                  <option>To a collaborator</option>
                </select>
              </Field>
            </>
          ) : (
            <BatchRequestWizardBody state={batchState} />
          )}
        </div>

        <div className="border-t border-gray-100 p-6">
          {tab === 'single' ? (
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full border border-gray-300 px-5 py-2 text-sm font-bold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 px-5 py-2 text-sm font-bold text-white"
              >
                ✓ Raise Request
              </button>
            </div>
          ) : (
            <BatchRequestWizardFooter state={batchState} onCancel={handleClose} onSubmit={handleSubmit} />
          )}
        </div>
      </div>
    </div>
  )
}
