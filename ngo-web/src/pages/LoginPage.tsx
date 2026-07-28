import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { ShieldIcon } from '../components/icons'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/actions')
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-[#1a0f36] via-[#3f1d78] to-[#7c3aed] flex flex-col items-center px-4 py-10 md:py-16">
      <div className="flex items-center gap-3 mb-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShieldIcon className="h-6 w-6 text-white" />
        </span>
        <div>
          <h1 className="text-white text-lg font-bold leading-tight">NGO Partner Platform</h1>
          <p className="text-purple-200 text-sm leading-tight">South Africa</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900">Sign in</h2>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          Manage support requests, track fulfilment and understand your impact.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-full bg-gray-100 border border-transparent px-4 py-2.5 text-base font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
            <span className="flex items-center justify-between">
              Password
              <a href="/forgot-password" className="text-sm font-medium text-violet-600 hover:text-violet-700">
                Forgot password?
              </a>
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-full bg-gray-100 border border-transparent px-4 py-2.5 text-base font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white py-3 text-sm font-bold disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-purple-200/80 text-xs text-center mt-8">
        © {new Date().getFullYear()} NGO Partner Platform · Early Learning Programmes
      </p>
    </div>
  )
}
