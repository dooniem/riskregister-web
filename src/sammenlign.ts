// Sammenligner to utgaver av et register, f.eks. et snapshot og registeret slik det er nå.
// Riskene og tiltakene kobles på id, så endret tekst og nytt nummer ikke gjør at de regnes som nye.
import type { Register, Risk, Tiltak } from './model'
import { eksponering, fv } from './model'

export interface FeltEndring {
  felt: string
  fra: string
  til: string
}

export interface RiskEndring {
  type: 'ny' | 'fjernet' | 'endret'
  risk: Risk // slik den er nå, eller slik den var for fjernede
  endringer: FeltEndring[]
}

export interface Nokkeltall {
  aapne: number
  lukkede: number
  eksponering: number // sum for åpne risker
  fv: number // sum forventningsverdi for åpne risker
}

export interface Sammenligning {
  risker: RiskEndring[]
  uendret: number
  fra: Nokkeltall
  til: Nokkeltall
}

const jaNei = (b: boolean) => (b ? 'Ja' : 'Nei')
const tall = (n: number) => (n ? n.toLocaleString('nb-NO', { maximumFractionDigits: 2 }) : '')

function nokkeltall(doc: Register): Nokkeltall {
  const aapne = doc.risker.filter((r) => r.status !== 'Lukket')
  return {
    aapne: aapne.length,
    lukkede: doc.risker.length - aapne.length,
    eksponering: aapne.reduce((s, r) => s + eksponering(r), 0),
    fv: aapne.reduce((s, r) => s + fv(r), 0),
  }
}

// Feltene som sammenlignes, med navn slik de vises i registeret
function riskFelt(doc: Register): [string, (r: Risk) => string][] {
  const fag = (id?: string) => doc.lister.fag.find((f) => f.id === id)?.navn ?? ''
  const felt: [string, (r: Risk) => string][] = [
    ['R/M', (r) => r.rm],
    ['Årsak', (r) => r.aarsak],
    ['Hendelse', (r) => r.hendelse],
    ['Konsekvenser', (r) => r.konsekvenser],
    ['Risikoeier', (r) => r.eier],
    ['Status', (r) => r.status],
    ['Kategori', (r) => r.kategori],
    [doc.lister.egendefNavn || 'Egendefinert', (r) => r.egendef],
    ['Fag', (r) => fag(r.fag)],
    ['Sannsynlighet', (r) => tall(r.sannsynlighet)],
    ['Konsekvens', (r) => tall(r.konsekvens)],
    ['Eksponering', (r) => tall(eksponering(r))],
    ['BC', (r) => tall(r.bc)],
    ['ML', (r) => tall(r.ml)],
    ['WC', (r) => tall(r.wc)],
    ['Til Skarisk', (r) => jaNei(r.tilSkarisk)],
  ]
  if (doc.lister.egendef2Aktiv) felt.push([doc.lister.egendef2Navn || 'Egendefinert 2', (r) => r.egendef2 ?? ''])
  return felt
}

const TILTAK_FELT: [string, (t: Tiltak) => string][] = [
  ['tekst', (t) => t.tekst],
  ['eier', (t) => t.eier],
  ['frist', (t) => t.frist],
  ['status', (t) => t.status],
  ['statusbeskrivelse', (t) => t.beskrivelse],
]

const kort = (s: string) => (s.length > 60 ? s.slice(0, 57) + '…' : s) || 'uten tekst'

function tiltakEndringer(fra: Tiltak[], til: Tiltak[]): FeltEndring[] {
  const ut: FeltEndring[] = []
  const gamle = new Map(fra.map((t) => [t.id, t]))
  for (const t of til) {
    const g = gamle.get(t.id)
    if (!g) {
      if (t.tekst || t.eier || t.frist) ut.push({ felt: 'Nytt tiltak', fra: '', til: t.tekst })
      continue
    }
    for (const [navn, f] of TILTAK_FELT) if (f(g) !== f(t)) ut.push({ felt: `Tiltak «${kort(t.tekst || g.tekst)}», ${navn}`, fra: f(g), til: f(t) })
  }
  const nye = new Set(til.map((t) => t.id))
  for (const g of fra) if (!nye.has(g.id) && (g.tekst || g.eier || g.frist)) ut.push({ felt: 'Fjernet tiltak', fra: g.tekst, til: '' })
  return ut
}

export function sammenlign(fra: Register, til: Register): Sammenligning {
  const felt = riskFelt(til)
  const feltFra = riskFelt(fra)
  const gamle = new Map(fra.risker.map((r) => [r.id, r]))
  const risker: RiskEndring[] = []
  let uendret = 0
  for (const r of til.risker) {
    const g = gamle.get(r.id)
    if (!g) {
      risker.push({ type: 'ny', risk: r, endringer: [] })
      continue
    }
    const endringer: FeltEndring[] = []
    felt.forEach(([navn, f], i) => {
      const a = (feltFra[i]?.[1] ?? f)(g)
      const b = f(r)
      if (a !== b) endringer.push({ felt: navn, fra: a, til: b })
    })
    endringer.push(...tiltakEndringer(g.tiltak, r.tiltak))
    if (endringer.length) risker.push({ type: 'endret', risk: r, endringer })
    else uendret++
  }
  const naa = new Set(til.risker.map((r) => r.id))
  for (const g of fra.risker) if (!naa.has(g.id)) risker.push({ type: 'fjernet', risk: g, endringer: [] })
  risker.sort((a, b) => a.risk.nr - b.risk.nr)
  return { risker, uendret, fra: nokkeltall(fra), til: nokkeltall(til) }
}
