// Bedriftsprofil: farger, skrift og logo for moderne og samlet visning.
// Uten profil er appen nøytral, og det er standard. Profilen slås på i adressen med ?profil=yes og av med ?profil=no.
// Valget huskes i fanen. Den kan også slås på for alle med «"profil": "yes"» i config.json.
// For å legge til en ny profil: lag en CSS-fil her som overstyrer variablene i .stil-moderne, og legg den inn i PROFILER.
import { useSyncExternalStore } from 'react'
import './profil.css'
import ikon from './ikon.svg'
import logo from './logo.svg'

export interface Profil {
  navn: string
  logo?: string
  ikon?: string // fanesymbolet (favicon)
}

const PROFILER: Record<string, Profil> = {
  yes: { navn: 'Logo', logo, ikon },
}

let valgt: string | null = null
const lyttere = new Set<() => void>()
// Det nøytrale fanesymbolet fra index.html, så det kan settes tilbake
let noytraltIkon: string | null = null

function settIkon(href: string | undefined) {
  const lenke = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!lenke) return
  noytraltIkon ??= lenke.href
  lenke.href = href ?? noytraltIkon
}

function sett(key: string | null) {
  valgt = key && PROFILER[key] ? key : null
  if (valgt) document.documentElement.dataset.profil = valgt
  else delete document.documentElement.dataset.profil
  settIkon(valgt ? PROFILER[valgt].ikon : undefined)
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
  if (fraAdresse) return sett(fraAdresse === 'no' || fraAdresse === 'ingen' ? null : fraAdresse)
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
