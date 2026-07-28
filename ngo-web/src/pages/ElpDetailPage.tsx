import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { AddSupportRequestModal } from '../components/AddSupportRequestModal'
import { elps, elpDetails, ELP_STATUS_META } from '../data/mockDashboard'
import { AwardIcon, CheckCircleIcon, DocumentIcon, LightningIcon, LocationIcon, MessageIcon, PlusIcon, ShieldIcon } from '../components/icons'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">{children}</div>
}

function ActionButton({ icon: Icon, label, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${
        primary ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'border border-gray-300 text-gray-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

export function ElpDetailPage() {
  const { id } = useParams()
  const [modalOpen, setModalOpen] = useState(false)

  const elp = elps.find((e) => e.id === id)
  const detail = id ? elpDetails[id] : undefined

  if (!elp || !detail) {
    return (
      <DashboardLayout onNewRequest={() => setModalOpen(true)}>
        <p className="text-sm text-gray-500">
          No profile details for this ELP yet.{' '}
          <Link to="/elps" className="text-violet-600 font-semibold">
            Back to ELPs
          </Link>
        </p>
        <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DashboardLayout>
    )
  }

  const status = elp.supportStatus ? ELP_STATUS_META[elp.supportStatus] : null

  return (
    <DashboardLayout onNewRequest={() => setModalOpen(true)}>
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/elps" className="hover:text-gray-600">
          ELPs
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{elp.name}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <Card>
            <h1 className="text-xl font-bold text-gray-900">{elp.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <LocationIcon className="h-4 w-4" />
                {elp.location}
              </span>
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <AwardIcon className="h-4 w-4" />
                {elp.tier}
              </span>
              {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-5 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-400">Site ID</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.siteId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Children enrolled</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.childrenEnrolled}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Total requests</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.totalRequests}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Last engagement</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.lastEngagement}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Completed</p>
                <p className="font-semibold text-teal-600 mt-0.5">{detail.completedFraction}</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Practitioner information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-sm text-gray-400">Name</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.practitioner.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Role</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.practitioner.role}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <p className="flex items-center gap-2 font-semibold text-gray-900 mt-0.5">
                  {detail.practitioner.phone}
                  {detail.practitioner.phoneVerified && (
                    <span className="rounded-full bg-teal-100 text-teal-700 px-2 py-0.5 text-xs font-semibold">Verified</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Preferred language</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.practitioner.preferredLanguage}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Last contact</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.practitioner.lastContact}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Contact verified</p>
                {detail.practitioner.contactVerified ? (
                  <p className="flex items-center gap-1 font-semibold text-teal-600 mt-0.5">
                    <CheckCircleIcon className="h-4 w-4" />
                    Verified
                  </p>
                ) : (
                  <p className="font-semibold text-gray-500 mt-0.5">Not verified</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-gray-100">
              <button type="button" className="flex items-center gap-2 rounded-full border border-gray-300 text-gray-700 px-4 py-2 text-sm font-bold">
                <MessageIcon className="h-4 w-4" />
                Send message
              </button>
              <button type="button" className="rounded-full border border-gray-300 text-gray-700 px-4 py-2 text-sm font-bold">
                Update contact details
              </button>
            </div>
          </Card>

          <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 p-6">
            <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-violet-600 mb-2">
              <LightningIcon className="h-4 w-4" />
              ELP SUMMARY
            </p>
            <p className="text-violet-900">{detail.summary}</p>
          </div>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Current support relationships</h2>
            <ul className="flex flex-col">
              {detail.currentSupportRelationships.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-3 py-3 border-b border-gray-100 last:border-b-0">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                      {r.name}
                      {r.overlapBadge && (
                        <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-semibold">{r.overlapBadge}</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{r.categories}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.statusClassName}`}>{r.status}</span>
                    <p className="text-sm text-gray-400 mt-1">{r.startDate}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="flex items-center gap-2 font-bold text-sky-700 mb-4">
              <ShieldIcon className="h-4 w-4" />
              Government support
            </p>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{detail.governmentSupport.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{detail.governmentSupport.categories}</p>
              </div>
              <span className="shrink-0 rounded-full bg-sky-100 text-sky-700 px-2.5 py-0.5 text-xs font-semibold">
                {detail.governmentSupport.badge}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-400">Expected fulfilment</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.governmentSupport.expectedFulfilment}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Source</p>
                <p className="font-semibold text-gray-900 mt-0.5">{detail.governmentSupport.source}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-4">Complementary support still allowed:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {detail.governmentSupport.complementarySupport.map((c) => (
                <span key={c} className="rounded-full border border-teal-200 bg-teal-50 text-teal-700 px-3 py-1 text-sm">
                  {c}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Support request history</h2>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="font-medium pb-2 pr-4">Request</th>
                    <th className="font-medium pb-2 pr-4">Raised</th>
                    <th className="font-medium pb-2 pr-4">Status</th>
                    <th className="font-medium pb-2 pr-4">Type</th>
                    <th className="font-medium pb-2 pr-4">Fulfilled by</th>
                    <th className="font-medium pb-2 pr-4">Latest update</th>
                    <th className="font-medium pb-2 pr-4">Completed</th>
                    <th className="font-medium pb-2 pr-4">Outcome</th>
                    <th className="font-medium pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {detail.requestHistory.map((row) => {
                    const detailLink =
                      row.expandDetailId &&
                      (row.expandType === 'completed' ? `/support/completed/${row.expandDetailId}` : `/support/${row.expandDetailId}`)
                    return (
                      <tr key={row.request} className="border-b border-gray-50">
                        <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">{row.request}</td>
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{row.raised}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${row.statusClassName}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{row.type}</td>
                        <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{row.fulfilledBy}</td>
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{row.latestUpdate}</td>
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{row.completed}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {row.outcome ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.outcome.className}`}>
                              {row.outcome.label}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {detailLink ? (
                            <Link to={detailLink} className="text-sm font-semibold text-violet-600">
                              Show more
                            </Link>
                          ) : (
                            <span className="text-sm text-gray-300">Show more</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="w-full lg:w-72 shrink-0 h-fit lg:sticky lg:top-6 rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-col gap-2">
            <ActionButton icon={PlusIcon} label="Add support request" primary />
            <ActionButton icon={MessageIcon} label="Message practitioner" />
            <ActionButton icon={DocumentIcon} label="Update details" />
          </div>
        </div>
      </div>

      <AddSupportRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  )
}
