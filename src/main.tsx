import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { instalarInterceptadorFetch } from './lib/api'

// Injeta o token nas telas antigas que ainda chamam fetch('/api.php') direto
instalarInterceptadorFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
