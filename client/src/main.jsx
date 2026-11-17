import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import MissingConfig from './components/MissingConfig.jsx'
import { clerkAppearanceFor } from './lib/clerkAppearance.js'
import { useTheme } from './lib/useTheme.js'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Clerk's own screens follow the app's light/dark choice.
function ThemedClerk({ children }) {
  const { theme } = useTheme()
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearanceFor(theme)} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {publishableKey ? (
      <ThemedClerk>
        <App />
      </ThemedClerk>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
)
