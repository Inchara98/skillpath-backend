import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { ActionsPage } from './pages/ActionsPage'
import { SupportRequestReviewPage } from './pages/SupportRequestReviewPage'
import { SupportPage } from './pages/SupportPage'
import { ActiveSupportDetailPage } from './pages/ActiveSupportDetailPage'
import { CompletedSupportDetailPage } from './pages/CompletedSupportDetailPage'
import { ElpsPage } from './pages/ElpsPage'
import { ElpDetailPage } from './pages/ElpDetailPage'
import { RequireAuth } from './lib/RequireAuth'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LoginPage />,
  },
  {
    path: '/actions',
    element: (
      <RequireAuth>
        <ActionsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/actions/:id',
    element: (
      <RequireAuth>
        <SupportRequestReviewPage />
      </RequireAuth>
    ),
  },
  {
    path: '/support',
    element: (
      <RequireAuth>
        <SupportPage />
      </RequireAuth>
    ),
  },
  {
    path: '/support/completed/:id',
    element: (
      <RequireAuth>
        <CompletedSupportDetailPage />
      </RequireAuth>
    ),
  },
  {
    path: '/support/:id',
    element: (
      <RequireAuth>
        <ActiveSupportDetailPage />
      </RequireAuth>
    ),
  },
  {
    path: '/elps',
    element: (
      <RequireAuth>
        <ElpsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/elps/:id',
    element: (
      <RequireAuth>
        <ElpDetailPage />
      </RequireAuth>
    ),
  },
])
