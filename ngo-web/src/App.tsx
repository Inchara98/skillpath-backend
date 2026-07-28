import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './lib/auth-context'
import { OpenMenuProvider } from './lib/OpenMenuContext'
import { router } from './router'

function App() {
  return (
    <AuthProvider>
      <OpenMenuProvider>
        <RouterProvider router={router} />
      </OpenMenuProvider>
    </AuthProvider>
  )
}

export default App
