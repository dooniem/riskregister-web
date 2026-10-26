import type { Register, Risk, Tiltak } from './model'
import { eksponering, fv, KONSEKVENS, SANNSYNLIGHET } from './model'
import type { RiskFelt, TiltakFelt } from './ops'

export type Celletype = 'tekst' | 'langtekst' | 'valg' | 'tall' | 'dato' | 'avkrysning' | 'beregnet'

export interface Kolonne {
  key: string
  tittel: (doc: Register) => string
  nivaa: 'risk' | 'tiltak'
  type: Celletype
  bredde: number
  gruppe: string
  felt?: RiskFelt | TiltakFelt
  // Valgliste for nedtrekk. fri = brukeren kan også skrive inn noe som ikke står i lista
  valg?: (doc: Register) => string[]
  fri?: boolean
  // Verdien slik den vises og sorteres
  verdi: (r: Risk, t?: Tiltak) => string | number | boolean
  hoyre?: boolean
  frosset?: boolean
}

export interface Kolonnegruppe {
  key: string
  tittel: string
  hoved: string // kolonnen som vises når gruppen er slått sammen
}

export const GRUPPER: Kolonnegruppe[] = [
  { key: 'fast', tittel: '', hoved: 'nr' },
  { key: 'beskrivelse', tittel: 'Beskrivelse', hoved: 'hendelse' },
  { key: 'eierskap', tittel: 'Eierskap og status', hoved: 'eier' },
  { key: 'vurdering', tittel: 'Vurdering', hoved: 'eksponering' },
  { key: 'kost', tittel: 'Mulig kost (i 1000)', hoved: 'fv' },
  { key: 'tiltak', tittel: 'Tiltak', hoved: 'tiltak' },
  { key: 'skarisk', tittel: 'Skarisk', hoved: 'tilSkarisk' },
]

const deltakerNavn = (doc: Register) => doc.deltakere.map((d) => d.navn).filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))

export const KOLONNER: Kolonne[] = [
  { key: 'nr', tittel: () => 'Nr.', nivaa: 'risk', type: 'beregnet', bredde: 64, gruppe: 'fast', verdi: (r) => r.nr, frosset: true },
  { key: 'rm', tittel: () => 'R&M', nivaa: 'risk', type: 'valg', bredde: 64, gruppe: 'fast', felt: 'rm', valg: () => ['R', 'M', '-'], verdi: (r) => r.rm, frosset: true },
  { key: 'aarsak', tittel: () => 'Årsak', nivaa: 'risk', type: 'langtekst', bredde: 210, gruppe: 'beskrivelse', felt: 'aarsak', verdi: (r) => r.aarsak, frosset: true },
  { key: 'hendelse', tittel: () => 'Hendelse (risiko/mulighet)', nivaa: 'risk', type: 'langtekst', bredde: 230, gruppe: 'beskrivelse', felt: 'hendelse', verdi: (r) => r.hendelse, frosset: true },
  { key: 'konsekvenser', tittel: () => 'Konsekvenser hvis det skjer', nivaa: 'risk', type: 'langtekst', bredde: 210, gruppe: 'beskrivelse', felt: 'konsekvenser', verdi: (r) => r.konsekvenser },
  { key: 'eier', tittel: () => 'Risikoeier', nivaa: 'risk', type: 'valg', bredde: 136, gruppe: 'eierskap', felt: 'eier', valg: deltakerNavn, fri: true, verdi: (r) => r.eier },
  { key: 'status', tittel: () => 'Status risk', nivaa: 'risk', type: 'valg', bredde: 96, gruppe: 'eierskap', felt: 'status', valg: (d) => d.lister.statusRisk, verdi: (r) => r.status },
  { key: 'kategori', tittel: () => 'Kategori', nivaa: 'risk', type: 'valg', bredde: 140, gruppe: 'eierskap', felt: 'kategori', valg: (d) => d.lister.kategorier, verdi: (r) => r.kategori },
  { key: 'egendef', tittel: (d) => d.lister.egendefNavn || '<egendefinert>', nivaa: 'risk', type: 'valg', bredde: 120, gruppe: 'eierskap', felt: 'egendef', valg: (d) => d.lister.egendef, fri: true, verdi: (r) => r.egendef },
  { key: 'egendef2', tittel: (d) => d.lister.egendef2Navn || '<egendefinert 2>', nivaa: 'risk', type: 'valg', bredde: 120, gruppe: 'eierskap', felt: 'egendef2', valg: (d) => d.lister.egendef2, fri: true, verdi: (r) => r.egendef2 ?? '' },
  { key: 'sannsynlighet', tittel: () => 'Sannsynlighet', nivaa: 'risk', type: 'valg', bredde: 126, gruppe: 'vurdering', felt: 'sannsynlighet', valg: () => SANNSYNLIGHET, verdi: (r) => r.sannsynlighet },
  { key: 'konsekvens', tittel: () => 'Konsekvens', nivaa: 'risk', type: 'valg', bredde: 118, gruppe: 'vurdering', felt: 'konsekvens', valg: () => KONSEKVENS, verdi: (r) => r.konsekvens },
  { key: 'eksponering', tittel: () => 'Eksponering', nivaa: 'risk', type: 'beregnet', bredde: 104, gruppe: 'vurdering', verdi: (r) => eksponering(r), hoyre: true },
  { key: 'bc', tittel: () => 'BC', nivaa: 'risk', type: 'tall', bredde: 78, gruppe: 'kost', felt: 'bc', verdi: (r) => r.bc, hoyre: true },
  { key: 'ml', tittel: () => 'ML', nivaa: 'risk', type: 'tall', bredde: 78, gruppe: 'kost', felt: 'ml', verdi: (r) => r.ml, hoyre: true },
  { key: 'wc', tittel: () => 'WC', nivaa: 'risk', type: 'tall', bredde: 78, gruppe: 'kost', felt: 'wc', verdi: (r) => r.wc, hoyre: true },
  { key: 'fv', tittel: () => 'FV', nivaa: 'risk', type: 'beregnet', bredde: 78, gruppe: 'kost', verdi: (r) => Math.round(fv(r)), hoyre: true },
  { key: 'tiltak', tittel: () => 'Tiltak', nivaa: 'tiltak', type: 'langtekst', bredde: 250, gruppe: 'tiltak', felt: 'tekst', verdi: (_r, t) => t?.tekst ?? '' },
  { key: 'tiltakseier', tittel: () => 'Tiltakseier', nivaa: 'tiltak', type: 'valg', bredde: 136, gruppe: 'tiltak', felt: 'eier', valg: deltakerNavn, fri: true, verdi: (_r, t) => t?.eier ?? '' },
  { key: 'frist', tittel: () => 'Frist tiltak', nivaa: 'tiltak', type: 'dato', bredde: 112, gruppe: 'tiltak', felt: 'frist', verdi: (_r, t) => t?.frist ?? '' },
  { key: 'beskrivelse', tittel: () => 'Status tiltak (beskrivelse)', nivaa: 'tiltak', type: 'langtekst', bredde: 200, gruppe: 'tiltak', felt: 'beskrivelse', verdi: (_r, t) => t?.beskrivelse ?? '' },
  { key: 'tiltakstatus', tittel: () => 'Status tiltak', nivaa: 'tiltak', type: 'valg', bredde: 116, gruppe: 'tiltak', felt: 'status', valg: (d) => d.lister.statusTiltak, verdi: (_r, t) => t?.status ?? '' },
  { key: 'tilSkarisk', tittel: () => 'Til Skarisk', nivaa: 'risk', type: 'avkrysning', bredde: 76, gruppe: 'skarisk', felt: 'tilSkarisk', verdi: (r) => r.tilSkarisk },
]

export const KOL = Object.fromEntries(KOLONNER.map((k) => [k.key, k])) as Record<string, Kolonne>

// Tekst slik cellen viser verdien
export function visTekst(k: Kolonne, r: Risk, t?: Tiltak): string {
  const v = k.verdi(r, t)
  if (k.key === 'sannsynlighet') return r.sannsynlighet ? SANNSYNLIGHET[r.sannsynlighet - 1] : '-'
  if (k.key === 'konsekvens') return r.konsekvens ? KONSEKVENS[r.konsekvens - 1] : '-'
  if (k.key === 'eksponering') return (v as number) ? String(v) : '-'
  if (k.type === 'tall' || k.key === 'fv') return formatTall(v as number)
  if (k.type === 'dato') return formatDato(v as string)
  if (k.type === 'avkrysning') return v ? 'Ja' : ''
  return String(v ?? '')
}

export function formatTall(n: number): string {
  if (!n) return '0'
  return Math.round(n).toLocaleString('nb-NO')
}

export function formatDato(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

// ISO-ukenummer (uka med årets første torsdag er uke 1)
export function isoUke(isoDato: string): { aar: number; uke: number } {
  const d = new Date(isoDato + 'T00:00:00Z')
  const dag = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dag + 3)
  const aar = d.getUTCFullYear()
  return { aar, uke: Math.floor((d.getTime() - Date.UTC(aar, 0, 1)) / 86400000 / 7) + 1 }
}

// Fredag i en ISO-uke, brukt når noen skriver «uke 12» som frist
function fredagIUke(aar: number, uke: number): string | null {
  if (uke < 1 || uke > 53) return null
  const jan4 = new Date(Date.UTC(aar, 0, 4))
  const mandag = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (uke - 1) * 7 * 86400000)
  const fredag = new Date(mandag.getTime() + 4 * 86400000).toISOString().slice(0, 10)
  return isoUke(fredag).uke === uke ? fredag : null
}

// Tolker datoer slik folk skriver dem: 31.12.2026, 31.12.26, 31.12, 311226, 2026-12-31, «uke 12», «i dag».
// Gir ISO-dato, '' for tom tekst og null når teksten ikke er en dato.
export function parseDato(s: string, idag = new Date()): string | null {
  const t = s.trim().toLowerCase()
  if (!t) return ''
  const iAar = idag.getFullYear()
  const aarFra = (a?: string) => (!a ? iAar : a.length <= 2 ? 2000 + Number(a) : Number(a))
  if (t === 'i dag' || t === 'idag') return iso(iAar, idag.getMonth() + 1, idag.getDate())
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[./\- ](\d{1,2})(?:[./\- ](\d{2}|\d{4}))?\.?$/)
  if (m) return iso(aarFra(m[3]), +m[2], +m[1])
  m = t.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/)
  if (m) return iso(aarFra(m[3]), +m[2], +m[1])
  m = t.match(/^(?:uke|u|w|week)\s*(\d{1,2})(?:[\s/.-]+(\d{2}|\d{4}))?$/)
  if (m) return fredagIUke(aarFra(m[2]), +m[1])
  return null
}

export function parseTall(s: string): number {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// Gjør inntastet tekst om til verdien som lagres i feltet
export function tolkInput(k: Kolonne, s: string): unknown {
  if (k.type === 'tall') return parseTall(s)
  if (k.type === 'dato') return parseDato(s) ?? ''
  if (k.key === 'sannsynlighet' || k.key === 'konsekvens') {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 5 ? n : 0
  }
  if (k.key === 'rm') {
    const u = s.trim().toUpperCase()
    return u === 'R' || u === 'M' ? u : '-'
  }
  return s
}

// Verdien som vises i editoren når man begynner å redigere
export function editorTekst(k: Kolonne, r: Risk, t?: Tiltak): string {
  if (k.key === 'sannsynlighet') return r.sannsynlighet ? SANNSYNLIGHET[r.sannsynlighet - 1] : ''
  if (k.key === 'konsekvens') return r.konsekvens ? KONSEKVENS[r.konsekvens - 1] : ''
  if (k.key === 'rm') return r.rm === '-' ? '' : r.rm
  const v = k.verdi(r, t)
  if (k.type === 'tall') return v ? String(v) : ''
  if (k.type === 'dato') return formatDato(v as string)
  return String(v ?? '')
}
