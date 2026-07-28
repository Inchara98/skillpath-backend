import { useState } from 'react'
import type { Elp } from '../data/mockDashboard'

export function useBatchWizardState() {
  const [step, setStep] = useState(1)
  const [batchName, setBatchName] = useState('')
  const [supportType, setSupportType] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('')
  const [region, setRegion] = useState('')
  const [timeframe, setTimeframe] = useState('')
  const [groupingReason, setGroupingReason] = useState('')
  const [selected, setSelected] = useState<Elp[]>([])
  const [fulfilment, setFulfilment] = useState('self')

  function reset() {
    setStep(1)
    setBatchName('')
    setSupportType('')
    setDescription('')
    setPriority('')
    setRegion('')
    setTimeframe('')
    setGroupingReason('')
    setSelected([])
    setFulfilment('self')
  }

  function toggleElp(elp: Elp) {
    setSelected((prev) => (prev.some((s) => s.id === elp.id) ? prev.filter((s) => s.id !== elp.id) : [...prev, elp]))
  }

  return {
    step,
    setStep,
    batchName,
    setBatchName,
    supportType,
    setSupportType,
    description,
    setDescription,
    priority,
    setPriority,
    region,
    setRegion,
    timeframe,
    setTimeframe,
    groupingReason,
    setGroupingReason,
    selected,
    setSelected,
    toggleElp,
    fulfilment,
    setFulfilment,
    reset,
  }
}

export type BatchWizardState = ReturnType<typeof useBatchWizardState>
