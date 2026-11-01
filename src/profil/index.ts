// Bedriftsprofil: farger, skrift og logo for moderne og samlet visning.
// Uten profil er appen nøytral. En profil velges i config.json («"profil": "skanska"»),
// og kan overstyres i adressen med ?profil=skanska eller ?profil=ingen, for eksempel for å vise appen frem nøytralt.
// For å legge til en ny bedrift: lag en CSS-fil her som overstyrer variablene i .stil-moderne, og legg den inn i PROFILER.
import { useSyncExternalStore } from 'react'
import './skanska.css'
import skanskaLogo from './skanska-logo.svg'

export interface Profil {
  navn: string
  logo?: string
}

const PROFILER: Record<string, Profil> = {
  skanska: { navn: 'Skanska', logo: skanskaLogo },
}

let valgt: string | null = null
const lyttere = new Set<() => void>()

function sett(key: string | null) {
  valgt = key && PROFILER[key] ? key : null
  if (valgt) document.documentElement.dataset.profil = valgt
  else delete document.documentElement.dataset.profil
  lyttere.forEach((l) => l())
}

// Kalles én gang ved oppstart
export async function lastProfil() {
  // ?profil= huskes i fanen, så valget står seg når appen bytter adresse (for eksempel ?demo=)
  let fraAdresse = new URLSearchParams(location.search).get('profil')
  try {
    if (fraAdresse) sessionStorage.setItem('rr-profil', fraAdresse)
    else fraAdresse = sessionStorage.getItem('rr-profil')
  } catch {
    /* ignorer */
  }
  if (fraAdresse) return sett(fraAdresse === 'ingen' ? null : fraAdresse)
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'config.json', { cache: 'no-store' })
    if (r.ok) {
      const c = (await r.json()) as { profil?: string }
      sett(c.profil ?? null)
    }
  } catch {
    /* ingen config.json: nøytral */
  }
}

export function useProfil(): Profil | null {
  const key = useSyncExternalStore(
    (l) => (lyttere.add(l), () => lyttere.delete(l)),
    () => valgt,
  )
  return key ? PROFILER[key] : null
}
