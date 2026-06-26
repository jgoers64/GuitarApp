import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tuning.css'
import App from './App.tsx'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error)
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
