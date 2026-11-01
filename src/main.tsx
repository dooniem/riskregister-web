import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { lastProfil } from './profil'

void lastProfil()

createRoot(document.getElementById('root')!).render(<App />)
