// Gjør versjonshistorikken til en risk og tiltakene dens om til en liste over endringer som kan leses:
// hvem, når og hvilke felt som ble endret fra hva til hva. Felt appen bruker internt (id, rekkefølge,
// tidsstempler) vises ikke, så en utgave som bare endret slike felt, blir ikke med.
import type { Register, Vedlegg } from './model'
import { MARKERINGER } from './model'
import type { RadHistorikk } from './store/backend'

export interface FeltEndring {
  felt: string
  fra: string
  til: string
}

export interface HistorikkPost {
  tid: string
  av?: string
  hva: 'risk' | 'tiltak'
  tiltak?: string // tiltaksteksten, for å vise hvilket tiltak endringen gjelder
  type: 'opprettet' | 'endret' | 'eldste' // eldste: den eldste utgaven SharePoint har tatt vare på
  endringer: FeltEndring[]
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const dato = (v: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s(v)
}
const tall = (v: unknown) => (s(v) === '' ? '' : Number(v).toLocaleString('nb-NO'))
const jaNei = (v: unknown) => (v === true || v === 'true' || v === 1 ? 'Ja' : 'Nei')
const farge = (v: unknown) => MARKERINGER.find((m) => m.key === s(v))?.navn ?? (s(v) ? s(v) : 'Ingen')
const vedlegg = (v: unknown) => {
  try {
    const l = s(v) ? (JSON.parse(s(v)) as Vedlegg[]) : []
    return l.map((x) => x.navn).join(', ')
  } catch {
    return ''
  }
}

type Felt = [kolonne: string, navn: string, vis?: (v: unknown) => string]

function riskFelt(doc: Register): Felt[] {
  const fag = (v: unknown) => doc.lister.fag.find((f) => f.id === s(v))?.navn ?? ''
  return [
    ['Hendelse', 'Hendelse'],
    ['Aarsak', 'Årsak'],
    ['Konsekvenser', 'Konsekvenser'],
    ['RM', 'R&M'],
    ['Eier', 'Risikoeier'],
    ['Status', 'Status'],
    ['Kategori', 'Kategori'],
    ['Egendef', doc.lister.egendefNavn || 'Egendefinert'],
    ['Egendef2', doc.lister.egendef2Navn || 'Egendefinert 2'],
    ['FagId', 'Fag', fag],
    ['Sannsynlighet', 'Sannsynlighet', tall],
    ['Konsekvens', 'Konsekvens', tall],
    ['BC', 'BC', tall],
    ['ML', 'ML', tall],
    ['WC', 'WC', tall],
    ['TilSkarisk', 'Til Skarisk', jaNei],
    ['Vedlegg', 'Vedlegg', vedlegg],
    ['Markering', 'Farge', farge],
  ]
}

const TILTAK_FELT: Felt[] = [
  ['Tekst', 'Tiltak'],
  ['Eier', 'Tiltakseier'],
  ['Frist', 'Frist', dato],
  ['Status', 'Status tiltak'],
  ['Beskrivelse', 'Statusbeskrivelse'],
  ['Markering', 'Farge', farge],
]

export function lagHistorikk(rader: RadHistorikk[], doc: Register): HistorikkPost[] {
  const rf = riskFelt(doc)
  const ut: HistorikkPost[] = []
  for (const rad of rader) {
    const felt = rad.liste === 'risker' ? rf : TILTAK_FELT
    const hva = rad.liste === 'risker' ? 'risk' : 'tiltak'
    const vis = ([k, , f]: Felt, v: Record<string, unknown>) => (f ? f(v[k]) : s(v[k]).trim())
    rad.versjoner.forEach((v, i) => {
      const tiltak = hva === 'tiltak' ? s(v.felt.Tekst) || 'Tiltak uten tekst' : undefined
      if (i === 0) {
        // Risker har egne felt for hvem som opprettet dem (f.eks. «importert fra fil»), som er mer presise enn listen
        const opprettetTid = v.forste && hva === 'risk' ? s(v.felt.OpprettetTid) : ''
        const opprettetAv = v.forste && hva === 'risk' ? s(v.felt.OpprettetAv) : ''
        ut.push({ tid: opprettetTid || v.tid, av: opprettetAv || v.av, hva, tiltak, type: v.forste ? 'opprettet' : 'eldste', endringer: [] })
        return
      }
      const forrige = rad.versjoner[i - 1].felt
      const endringer = felt.map((f): FeltEndring => ({ felt: f[1], fra: vis(f, forrige), til: vis(f, v.felt) })).filter((e) => e.fra !== e.til)
      if (endringer.length) ut.push({ tid: v.tid, av: v.av, hva, tiltak, type: 'endret', endringer })
    })
  }
  return ut.sort((a, b) => b.tid.localeCompare(a.tid))
}
