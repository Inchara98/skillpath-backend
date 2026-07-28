import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './lib/auth-context'
import { OpenMenuProvider } from './lib/OpenMenuContext'
import { DonationAlertsProvider } from './lib/DonationAlertsContext'
import { router } from './router'

function App() {
  return (
    <AuthProvider>
      <DonationAlertsProvider>
        <OpenMenuProvider>
          <RouterProvider router={router} />
        </OpenMenuProvider>
      </DonationAlertsProvider>
    </AuthProvider>
  )
}

export default App
