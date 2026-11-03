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
  snarvei?: Snarvei // ferdig utvalg fra snarveiraden over registeret
  snarveiFra?: string // tidspunktet «Nye siden siste snapshot» regnes fra (ISO-tid)
}

export interface Visning {
  fane: Fane
  sok: string
  sortering: Sortering[]
  filter: Filter
  gruppering: string // '' = ingen
  grupperingLukkede?: string // egen gruppering i Lukkede-fanen. Mangler den, grupperes lukkede risker etter når de ble lukket
  skjulteGrupper: string[] // kolonnegrupper som er slått sammen
  skjulteKolonner: string[]
  bredder: Record<string, number>
  kunFiltrerteSummer: boolean
  visOversikt: boolean
  fag?: string[] // valgte fag-id-er, UTEN_FAG for risker uten fag. Tom = alle
  skjulFag?: boolean // skjul fagmerkene i Nr.-kolonnen og på kortene (også i utskrift)
  person?: string // vis bare risker der personen er risikoeier eller tiltakseier
  samletUtenKategori?: boolean // skjul kategorien under risikoeieren i samlet utseende (egen innstilling, så Klassisk ikke påvirkes)
  samletEgendef?: string[] // egendefinerte felt som vises i risikokortet i samlet utseende ('egendef', 'egendef2'). Tom = ingen
  skjulMarkering?: boolean // skjul fargemarkeringene på risknummer og tiltak, f.eks. før utskrift eller presentasjon
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
  { key: 'samlet', navn: 'Samlet' },
  { key: 'moderne', navn: 'Moderne' },
  { key: 'klassisk', navn: 'Klassisk' },
]
const STIL_KEY = 'rr-stil'

export function lesStil(): Stil {
  try {
    const s = localStorage.getItem(STIL_KEY)
    // Samlet er standard for nye brukere; den som har valgt noe selv, beholder valget
    return s === 'moderne' || s === 'klassisk' ? s : 'samlet'
  } catch {
    return 'samlet'
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
  { key: 'egendef2', tittel: 'Egendefinert 2', verdi: (r) => r.egendef2 || '(tom)' },
  { key: 'status', tittel: 'Status risk', verdi: (r) => r.status || '(tom)' },
  { key: 'lukket', tittel: 'Når lukket', verdi: (r) => lukketGruppe(r) },
  { key: 'tiltakstatus', tittel: 'Status på tiltak', verdi: (r) => tiltakOppsummering(r) },
]

// Grupperingene som kan velges i registeret: de egendefinerte får navnet fra prosjektet, og felt 2 er bare med når det er aktivert
// «Når lukket» gir bare mening der det finnes lukkede risker, altså i Lukkede og Alle.
export function grupperinger(doc: Register, fane?: Fane) {
  return GRUPPERINGER.filter((g) => (g.key !== 'egendef2' || doc.lister.egendef2Aktiv) && (g.key !== 'lukket' || fane === 'lukkede' || fane === 'alle')).map((g) =>
    g.key === 'egendef' ? { ...g, tittel: doc.lister.egendefNavn || g.tittel } : g.key === 'egendef2' ? { ...g, tittel: doc.lister.egendef2Navn || g.tittel } : g,
  )
}

// Lukkede risker eldes ut av synsfeltet: de som er lukket de siste 90 dagene står øverst, eldre grupperes per år
// og er slått sammen til man åpner gruppen. Ingenting slettes.
export const NYLIG_LUKKET_DAGER = 90
export const NYLIG_LUKKET = `Lukket siste ${NYLIG_LUKKET_DAGER} dager`
export const LUKKET_UTEN_DATO = 'Lukket, uten dato'
const LUKKET_AAR = 'Lukket i '

export function lukketGruppe(r: Risk, naa = Date.now()): string {
  if (r.status !== 'Lukket') return 'Åpne'
  // Risker som er lukket før appen tok vare på tidspunktet (f.eks. importert fra Excel), bruker sist endret
  const t = Date.parse(r.lukket ?? r.endret ?? '')
  if (Number.isNaN(t)) return LUKKET_UTEN_DATO
  if (naa - t <= NYLIG_LUKKET_DAGER * 86_400_000) return NYLIG_LUKKET
  return LUKKET_AAR + new Date(t).getFullYear()
}

// Gruppene i «Når lukket» som er slått sammen til brukeren åpner dem: alt som er eldre enn de siste 90 dagene
export const sammenslaattSomStandard = (gruppering: string, navn: string) => gruppering === 'lukket' && (navn.startsWith(LUKKET_AAR) || navn === LUKKET_UTEN_DATO)

// Grupperingen som gjelder i fanen. Lukkede-fanen har sin egen, som er «Når lukket» til brukeren velger noe annet.
export function aktivGruppering(v: Visning): string {
  return v.fane === 'lukkede' ? (v.grupperingLukkede ?? 'lukket') : v.gruppering === 'lukket' && v.fane !== 'alle' ? '' : v.gruppering
}

// Snarveier: ferdige utvalg som appen regner ut, for å finne det som haster eller er glemt når registeret har vokst
export type Snarvei = 'frist' | 'ikkeVurdert' | 'nye' | 'utenTiltak'
export const IKKE_VURDERT_MND = 6

const avsluttet = (status: string) => status === 'Utført' || status === 'Utføres ikke'

export const SNARVEIER: { key: Snarvei; tittel: string; forklaring: string }[] = [
  { key: 'frist', tittel: 'Frist passert', forklaring: 'Åpne risker med minst ett tiltak der fristen er passert og som ikke er utført' },
  { key: 'ikkeVurdert', tittel: `Ikke endret på ${IKKE_VURDERT_MND} mnd`, forklaring: `Åpne risker der verken risken eller tiltakene er endret de siste ${IKKE_VURDERT_MND} månedene` },
  { key: 'nye', tittel: 'Nye siden siste snapshot', forklaring: 'Risker som er opprettet etter det siste snapshotet' },
  { key: 'utenTiltak', tittel: 'Uten tiltak', forklaring: 'Åpne risker som ikke har noen tiltak' },
]

export function iSnarvei(r: Risk, s: Snarvei, fra?: string, naa = new Date()): boolean {
  const aapen = r.status !== 'Lukket'
  switch (s) {
    case 'frist': {
      const d = naa.toISOString().slice(0, 10)
      return aapen && r.tiltak.some((t) => !!t.frist && t.frist < d && !avsluttet(t.status))
    }
    case 'ikkeVurdert': {
      const grense = new Date(naa)
      grense.setMonth(grense.getMonth() - IKKE_VURDERT_MND)
      const sist = r.endret ?? r.opprettet
      return aapen && (!sist || Date.parse(sist) < grense.getTime())
    }
    case 'nye':
      return !!fra && !!r.opprettet && r.opprettet > fra
    case 'utenTiltak':
      return aapen && !r.tiltak.some((t) => t.tekst.trim())
  }
}

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
    if (v.filter.snarvei && !iSnarvei(r, v.filter.snarvei, v.filter.snarveiFra)) return false
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

const lukketRang = (n: string) => (n === 'Åpne' ? 0 : n === NYLIG_LUKKET ? 1 : n === LUKKET_UTEN_DATO ? 3 : 2)

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
  // Åpne først, så de nylig lukkede, så årene med det nyeste først, og til sist de uten dato
  else if (key === 'lukket') navn.sort((a, b) => lukketRang(a) - lukketRang(b) || b.localeCompare(a, 'nb'))
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
