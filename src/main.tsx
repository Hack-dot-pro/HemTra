import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tailwind.css'
import './styles/glass.css'
import App from './app/App.tsx'
import { registerServiceWorker, startDeployVersionPolling } from './lib/pwaClient'

// P4-T6: đăng ký SW + poll /version.json định kỳ (design §8.6) — gọi 1 lần khi app khởi động.
// Dev (vite-plugin-pwa devOptions.enabled=false): registerSW là noop, không phát sinh lỗi console.
registerServiceWorker()
startDeployVersionPolling()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
