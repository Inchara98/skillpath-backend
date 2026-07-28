import { useEffect, useState } from 'react'
import { CheckCircleIcon } from './icons'

type Stage = 'scanning' | 'success'

// A purely visual payment simulation -- no real payment gateway involved.
// Walks through scanning -> success automatically, then calls onDone()
// which is where the actual (real) markDonationRequestPaid API call
// happens, in the parent. This just makes the demo feel like an actual
// payment happened, instead of a plain "Mark as paid" button click.
export function FakePaymentModal({
  amount,
  onDone,
  onClose,
}: {
  amount: string
  onDone: () => void
  onClose: () => void
}) {
  const [stage, setStage] = useState<Stage>('scanning')

  useEffect(() => {
    const toSuccess = setTimeout(() => setStage('success'), 1800)
    return () => clearTimeout(toSuccess)
  }, [])

  useEffect(() => {
    if (stage !== 'success') return
    const finish = setTimeout(() => onDone(), 1200)
    return () => clearTimeout(finish)
  }, [stage, onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center text-center">
        {stage === 'scanning' && (
          <>
            <p className="text-sm text-gray-500 mb-4">Scan to pay{amount ? ` · ₹${amount.replace(/[^\d.]/g, '')}` : ''}</p>
            <FakeQrCode />
            <div className="flex items-center gap-2 mt-5 text-sm text-gray-600">
              <span className="h-4 w-4 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
              Waiting for payment…
            </div>
            <button type="button" onClick={onClose} className="mt-6 text-sm text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </>
        )}

        {stage === 'success' && (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-600 mb-4">
              <CheckCircleIcon className="h-9 w-9" />
            </span>
            <p className="text-lg font-bold text-gray-900">Payment successful</p>
            <p className="text-sm text-gray-500 mt-1">{amount ? `₹${amount.replace(/[^\d.]/g, '')} sent` : 'Donation sent'}</p>
          </>
        )}
      </div>
    </div>
  )
}

// A decorative, non-functional QR-code-style pattern -- purely visual,
// deterministic per render (not random each re-render) so it doesn't
// flicker.
function FakeQrCode() {
  const size = 7
  // A fixed pseudo-random-looking pattern, not actually random -- keeps
  // it visually stable across re-renders without needing state.
  const pattern = [
    1, 1, 1, 0, 1, 1, 1,
    1, 0, 1, 0, 1, 0, 1,
    1, 1, 1, 0, 1, 1, 1,
    0, 0, 0, 1, 0, 0, 0,
    1, 1, 1, 0, 1, 1, 1,
    1, 0, 1, 0, 1, 0, 1,
    1, 1, 1, 0, 1, 1, 1,
  ]
  return (
    <div
      className="grid gap-0.5 bg-white p-3 rounded-lg ring-1 ring-gray-200"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, width: 168 }}
    >
      {pattern.map((filled, i) => (
        <div key={i} className={`aspect-square ${filled ? 'bg-gray-900' : 'bg-white'}`} />
      ))}
    </div>
  )
}
