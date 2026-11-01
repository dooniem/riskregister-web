// Visning: filtrering, sortering og gruppering. Endrer aldri selve registeret,
// så hver bruker kan sortere og gruppere som de vil uten å påvirke andre.
import type { Kolonne } from './columns'
import { KOL, visTekst } from './columns'
import type { Register, Risk } from './model'
import { eksponering, eksponeringNivaa, fv } from './model'

export type Fane = 'aapne' | 'lukkede' | 'alle' | 'skarisk'

export interface Sortering {
  key: string
  stigende: boolean
}

export interface Filter {
  // kolonnenøkkel -> tillatte verdier (visningstekst) eller tekst som må finnes
  verdier: Record<string, string[]>
  tekst: Record<string, string>
  matrise?: { s: number; k: number }
}

export interface Visning {
  fane: Fane
  sok: string
  sortering: Sortering[]
  filter: Filter
  gruppering: string // '' = ingen
  skjulteGrupper: string[] // kolonnegrupper som er slått sammen
  skjulteKolonner: string[]
  bredder: Record<string, number>
  kunFiltrerteSummer: boolean
  visOversikt: boolean
  fag?: string[] // valgte fag-id-er, UTEN_FAG for risker uten fag. Tom = alle
  skjulFag?: boolean // skjul fagmerkene i Nr.-kolonnen og på kortene (også i utskrift)
  person?: string // vis bare risker der personen er risikoeier eller tiltakseier
  samletEgendef?: string[] // egendefinerte felt som vises i risikokortet i samlet utseende ('egendef', 'egendef2'). Tom = ingen
  kostSkala?: 'prosjekt' // kostspennet i moderne utseende: egen skala per risk (standard) eller felles skala for prosjektet
}

export const STANDARD_VISNING: Visning = {
  fane: 'aapne',
  sok: '',
  sortering: [],
  filter: { verdier: {}, tekst: {} },
  gruppering: '',
  skjulteGrupper: [],
  skjulteKolonner: [],
  bredder: {},
  kunFiltrerteSummer: true,
  visOversikt: true,
}

export const UTEN_FAG = '_uten'

// Utseende på registeret. Gjelder for brukeren i alle registre, så det lagres utenfor visningen til hvert register.
// Samlet bygger på moderne, men slår sammen beskrivelse, eierskap og tiltak til hver sin kolonne.
export type Stil = 'klassisk' | 'moderne' | 'samlet'
export const STILER: { key: Stil; navn: string }[] = [
  { key: 'klassisk', navn: 'Klassisk' },
  { key: 'moderne', navn: 'Moderne' },
  { key: 'samlet', navn: 'Samlet' },
]
const STIL_KEY = 'rr-stil'

export function lesStil(): Stil {
  try {
    const s = localStorage.getItem(STIL_KEY)
    return s === 'moderne' || s === 'samlet' ? s : 'klassisk'
  } catch {
    return 'klassisk'
  }
}

export function lagreStil(stil: Stil) {
  try {
    localStorage.setItem(STIL_KEY, stil)
  } catch {
    /* ignorer */
  }
}

export function fagNavn(r: Risk, doc: Register): string {
  return doc.lister.fag.find((f) => f.id === r.fag)?.navn ?? ''
}

export const GRUPPERINGER: { key: string; tittel: string; verdi: (r: Risk, doc: Register) => string }[] = [
  { key: '', tittel: 'Ingen gruppering', verdi: () => '' },
  { key: 'fag', tittel: 'Fag', verdi: (r, doc) => fagNavn(r, doc) || '(uten fag)' },
  { key: 'kategori', tittel: 'Kategori', verdi: (r) => r.kategori || '(ingen kategori)' },
  { key: 'eier', tittel: 'Risikoeier', verdi: (r) => r.eier || '(ingen eier)' },
  { key: 'rm', tittel: 'Risiko / mulighet', verdi: (r) => (r.rm === 'R' ? 'Risiko' : r.rm === 'M' ? 'Mulighet' : '(ikke angitt)') },
  { key: 'nivaa', tittel: 'Eksponeringsnivå', verdi: (r) => eksponeringNivaa(eksponering(r)) },
  { key: 'egendef', tittel: 'Egendefinert', verdi: (r) => r.egendef || '(tom)' },
  { key: 'status', tittel: 'Status risk', verdi: (r) => r.status || '(tom)' },
  { key: 'tiltakstatus', tittel: 'Status på tiltak', verdi: (r) => tiltakOppsummering(r) },
]

function tiltakOppsummering(r: Risk): string {
  const st = r.tiltak.filter((t) => t.tekst || t.status).map((t) => t.status)
  if (!st.length) return 'Uten tiltak'
  if (st.every((s) => s === 'Utført' || s === 'Utføres ikke')) return 'Alle tiltak avsluttet'
  if (st.some((s) => s === 'Pågår')) return 'Tiltak pågår'
  return 'Tiltak ikke startet'
}

const NIVAA_REKKEFOLGE = ['Kritisk (20–25)', 'Høy (15–19)', 'Betydelig (9–14)', 'Moderat (5–8)', 'Lav (1–4)', 'Ikke vurdert']

// Verdien en kolonne filtreres på for en risk. For tiltak-kolonner: alle tiltakenes verdier.
export function filterVerdier(k: Kolonne, r: Risk): string[] {
  if (k.nivaa === 'tiltak') {
    const v = r.tiltak.map((t) => visTekst(k, r, t) || '(tom)')
    return v.length ? v : ['(tom)']
  }
  return [visTekst(k, r) || '(tom)']
}

export function iFane(r: Risk, fane: Fane) {
  if (fane === 'alle') return true
  if (fane === 'skarisk') return r.tilSkarisk && r.status !== 'Lukket'
  return fane === 'lukkede' ? r.status === 'Lukket' : r.status !== 'Lukket'
}

// Om risken hører til et av de valgte fagene (ingen valgt = alle). Risker med et fag som ikke finnes lenger regnes som uten fag.
export function iFag(r: Risk, doc: Register, fag?: string[]): boolean {
  return !fag?.length || fag.includes(doc.lister.fag.some((f) => f.id === r.fag) ? r.fag! : UTEN_FAG)
}

// Risken angår personen når hen er risikoeier eller eier minst ett av tiltakene
export function harPerson(r: Risk, navn: string): boolean {
  const n = navn.trim().toLowerCase()
  const lik = (x?: string) => !!x && x.trim().toLowerCase() === n
  return lik(r.eier) || r.tiltak.some((t) => lik(t.eier))
}

// Alle som står som risikoeier eller tiltakseier, pluss deltakerlisten, sortert
export function eierNavn(doc: Register): string[] {
  const s = new Map<string, string>()
  const legg = (x?: string) => x?.trim() && !s.has(x.trim().toLowerCase()) && s.set(x.trim().toLowerCase(), x.trim())
  doc.deltakere.forEach((d) => legg(d.navn))
  doc.risker.forEach((r) => (legg(r.eier), r.tiltak.forEach((t) => legg(t.eier))))
  return [...s.values()].sort((a, b) => a.localeCompare(b, 'nb'))
}

export function filtrer(doc: Register, v: Visning, ignorer?: string): Risk[] {
  const sok = v.sok.trim().toLowerCase()
  return doc.risker.filter((r) => {
    if (!iFane(r, v.fane)) return false
    if (!iFag(r, doc, v.fag)) return false
    if (v.person && !harPerson(r, v.person)) return false
    if (sok) {
      const hay = [r.nr, r.aarsak, r.hendelse, r.konsekvenser, r.eier, r.kategori, r.egendef, r.egendef2, ...r.tiltak.flatMap((t) => [t.tekst, t.eier, t.beskrivelse])]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(sok)) return false
    }
    for (const [key, tillatt] of Object.entries(v.filter.verdier)) {
      if (key === ignorer || !KOL[key]) continue
      if (!filterVerdier(KOL[key], r).some((x) => tillatt.includes(x))) return false
    }
    for (const [key, tekst] of Object.entries(v.filter.tekst)) {
      if (key === ignorer || !tekst || !KOL[key]) continue
      const t = tekst.toLowerCase()
      if (!filterVerdier(KOL[key], r).some((x) => x.toLowerCase().includes(t))) return false
    }
    if (v.filter.matrise && (r.sannsynlighet !== v.filter.matrise.s || r.konsekvens !== v.filter.matrise.k)) return false
    return true
  })
}

function sorteringsverdi(k: Kolonne, r: Risk): string | number {
  if (k.nivaa === 'tiltak') {
    const v = r.tiltak.map((t) => k.verdi(r, t)).filter((x) => x !== '' && x != null) as (string | number)[]
    if (!v.length) return ''
    // Frist: tidligste først. Ellers første tiltak.
    return k.key === 'frist' ? [...v].sort()[0] : v[0]
  }
  if (k.key === 'fv') return fv(r)
  const v = k.verdi(r)
  return typeof v === 'boolean' ? (v ? 1 : 0) : v
}

export function sorter(risker: Risk[], sortering: Sortering[]): Risk[] {
  const s = sortering.length ? sortering : [{ key: 'nr', stigende: true }]
  return [...risker].sort((a, b) => {
    for (const { key, stigende } of s) {
      const k = KOL[key]
      if (!k) continue
      const va = sorteringsverdi(k, a)
      const vb = sorteringsverdi(k, b)
      // Tomme verdier havner alltid nederst
      const ta = va === '' || va === 0 || va === '-'
      const tb = vb === '' || vb === 0 || vb === '-'
      if (ta !== tb && k.type !== 'tall') return ta ? 1 : -1
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'nb', { numeric: true })
      if (c) return stigende ? c : -c
    }
    return a.nr - b.nr
  })
}

export interface Gruppe {
  navn: string
  risker: Risk[]
}

export function grupper(doc: Register, risker: Risk[], key: string): Gruppe[] {
  const g = GRUPPERINGER.find((x) => x.key === key)
  if (!g || !key) return [{ navn: '', risker }]
  const m = new Map<string, Risk[]>()
  for (const r of risker) {
    const n = g.verdi(r, doc)
    if (!m.has(n)) m.set(n, [])
    m.get(n)!.push(r)
  }
  const navn = [...m.keys()]
  if (key === 'nivaa') navn.sort((a, b) => NIVAA_REKKEFOLGE.indexOf(a) - NIVAA_REKKEFOLGE.indexOf(b))
  else navn.sort((a, b) => (a.startsWith('(') ? 1 : b.startsWith('(') ? -1 : a.localeCompare(b, 'nb')))
  return navn.map((n) => ({ navn: n, risker: m.get(n)! }))
}

export interface Summer {
  antall: number
  bc: number
  ml: number
  wc: number
  fv: number
}

export function summer(risker: Risk[], rm: 'R' | 'M'): Summer {
  const s: Summer = { antall: 0, bc: 0, ml: 0, wc: 0, fv: 0 }
  for (const r of risker) {
    if (r.rm !== rm) continue
    s.antall++
    s.bc += r.bc
    s.ml += r.ml
    s.wc += r.wc
    s.fv += fv(r)
  }
  return s
}
