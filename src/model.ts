// Datamodell for et riskregister. I SharePoint ligger registeret i lister på prosjektets område (se store/lister/skjema.ts).

export const SCHEMA_VERSION = 1

export type RM = 'R' | 'M' | '-'

export interface Tiltak {
  id: string
  tekst: string
  eier: string
  frist: string // ISO-dato (YYYY-MM-DD) eller tom
  beskrivelse: string // fri tekst om status (kolonne V i Excel)
  status: string // valg fra lister.statusTiltak (kolonne W)
}

// Fag er en farget merkelapp på risken, vist i Nr.-kolonnen
export interface Fag {
  id: string
  navn: string
  kort: string // vises i merket, maks 4 tegn
  farge: number // indeks i FAG_FARGER
}

// Ti farger som skiller seg godt fra hverandre og er lesbare med tekst oppå
export const FAG_FARGER: { navn: string; bg: string; fg: string }[] = [
  { navn: 'Blå', bg: '#1d4ed8', fg: '#fff' },
  { navn: 'Rød', bg: '#b91c1c', fg: '#fff' },
  { navn: 'Grønn', bg: '#15803d', fg: '#fff' },
  { navn: 'Oransje', bg: '#ea580c', fg: '#fff' },
  { navn: 'Lilla', bg: '#7e22ce', fg: '#fff' },
  { navn: 'Turkis', bg: '#0e7490', fg: '#fff' },
  { navn: 'Rosa', bg: '#db2777', fg: '#fff' },
  { navn: 'Brun', bg: '#78350f', fg: '#fff' },
  { navn: 'Gul', bg: '#facc15', fg: '#1d2733' },
  { navn: 'Grå', bg: '#475569', fg: '#fff' },
]

export const fagFarge = (f: Fag) => FAG_FARGER[f.farge % FAG_FARGER.length]
export const kortFag = (navn: string) => navn.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase()

export interface Risk {
  id: string
  nr: number
  rm: RM
  aarsak: string
  hendelse: string
  konsekvenser: string
  eier: string
  status: string // 'Åpen' | 'Lukket'
  kategori: string
  egendef: string
  egendef2?: string // egendefinert kolonne 2, brukes bare når lister.egendef2Aktiv er satt
  fag?: string // id i lister.fag
  sannsynlighet: number // 0 = ikke satt, ellers 1–5
  konsekvens: number // 0 = ikke satt, ellers 1–5
  bc: number
  ml: number
  wc: number
  tilSkarisk: boolean
  tiltak: Tiltak[]
  endret?: string
  endretAv?: string
  opprettet?: string
  opprettetAv?: string
  lukket?: string // når status sist ble satt til Lukket
  lukketAv?: string
  kilde?: string // hvor risken kom fra, f.eks. delregisteret i Excel den ble hentet inn fra
}

export interface Deltaker {
  id: string
  initialer: string
  navn: string
  rolleProsjekt: string
  rolleRisk: string
  epost?: string // kobler deltakeren til en bruker i organisasjonen
}

// E-postadresse for de oppdiktede personene i demoen
export const demoEpost = (navn: string) =>
  navn
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .join('.') + '@demo.example'

export interface Gjennomgang {
  id: string
  dato: string
  signatur: string
  fasilitator: string
}

export interface Lister {
  statusRisk: string[]
  kategorier: string[]
  statusTiltak: string[]
  rollerProsjekt: string[]
  rollerRisk: string[]
  faser: string[]
  virksomhet: string[]
  egendefNavn: string
  egendef: string[]
  egendef2Aktiv: boolean
  egendef2Navn: string
  egendef2: string[]
  fag: Fag[]
}

export interface Prosjekt {
  nummer: string
  navn: string
  eier: string
  sjef: string
  leder: string
  fase: string
  virksomhet: string
  notering: string
}

export interface Register {
  schemaVersion: number
  registerId: string
  opprettet: string
  prosjekt: Prosjekt
  deltakere: Deltaker[]
  gjennomganger: Gjennomgang[]
  lister: Lister
  risker: Risk[]
  // Neste ledige risknummer. Nummer brukes aldri på nytt, heller ikke etter at en risk er slettet.
  nesteNr?: number
  // Nøkkelen Excel-registeret bygger UnikID av (cellene AC2 og AC3 i Riskregister-arket). Tas vare på ved import fra Excel.
  excelNokkel?: { ac2: string; ac3: string }
}

export const SANNSYNLIGHET = ['1 Veldig lav', '2 Lav', '3 Medium', '4 Høy', '5 Veldig høy']
export const KONSEKVENS = ['1 Veldig lav', '2 Lav', '3 Medium', '4 Høy', '5 Veldig høy']

export const DEFAULT_LISTER: Lister = {
  statusRisk: ['Åpen', 'Lukket'],
  kategorier: [
    'Egenproduksjon', 'HMS', 'Innkjøp', 'Kontrakt', 'Kunde', 'Kvalitet', 'Myndigheter', 'Organisasjon',
    'Prosjektering/ rådgivere', 'Rigg og logistikk', 'Tekniske løsninger', 'UE', 'Ytre Miljø',
  ],
  statusTiltak: ['Ikke startet', 'Pågår', 'Utført', 'Utføres ikke'],
  rollerProsjekt: [
    'Ansvarlig dokumentasjon', 'Arbeidsleder', 'Controller', 'Fasilitator', 'HMS-leder', 'Innkjøper', 'Kalkulatør',
    'Planlegger', 'Prosjekteier', 'Prosjekteringsleder', 'Prosjektingeniør', 'Prosjektleder', 'Prosjektsjef',
    'Prosjektutvikler', 'Prosjektøkonom', 'Tilbudsleder',
  ],
  rollerRisk: ['Administrasjon', 'Fasilitator', 'Kompetanseressurs', 'Risikoeier', 'Tiltakseier'],
  faser: ['B0 Prospekt', 'B0-B1 Utvikling/Prosjektering', 'B2-B3 Tilbud', 'B3-B4 Mobilisering', 'B4-B6 Produksjon'],
  virksomhet: ['Anlegg', 'Bygg'],
  egendefNavn: '<egendefinert>',
  egendef: ['BH', 'Internt'],
  egendef2Aktiv: false,
  egendef2Navn: '<egendefinert 2>',
  egendef2: [],
  fag: [],
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function nyttTiltak(): Tiltak {
  return { id: uid(), tekst: '', eier: '', frist: '', beskrivelse: '', status: '' }
}

export function nyRisk(nr: number): Risk {
  return {
    id: uid(), nr, rm: '-', aarsak: '', hendelse: '', konsekvenser: '', eier: '', status: 'Åpen', kategori: '',
    egendef: '', sannsynlighet: 0, konsekvens: 0, bc: 0, ml: 0, wc: 0, tilSkarisk: false, tiltak: [nyttTiltak()],
  }
}

export function nyttRegister(navn = ''): Register {
  return {
    schemaVersion: SCHEMA_VERSION,
    registerId: uid(),
    opprettet: new Date().toISOString(),
    prosjekt: { nummer: '', navn, eier: '', sjef: '', leder: '', fase: '', virksomhet: '', notering: '' },
    deltakere: [],
    gjennomganger: [],
    lister: structuredClone(DEFAULT_LISTER),
    risker: [],
  }
}

export interface KopiValg {
  navn: string
  behold: { lister: boolean; deltakere: boolean; prosjektinfo: boolean; risker: boolean; lukkede: boolean }
}

// Lager et nytt register fra et eksisterende. Alt som kopieres får nye ID-er.
export function kopierRegister(kilde: Register, valg: KopiValg): Register {
  const reg = nyttRegister(valg.navn)
  if (valg.behold.lister) reg.lister = structuredClone(kilde.lister)
  if (valg.behold.prosjektinfo) reg.prosjekt = { ...structuredClone(kilde.prosjekt), navn: valg.navn }
  if (valg.behold.deltakere) reg.deltakere = kilde.deltakere.map((d) => ({ ...d, id: uid() }))
  if (valg.behold.risker) {
    reg.risker = kilde.risker
      .filter((r) => valg.behold.lukkede || r.status !== 'Lukket')
      .map((r) => ({ ...structuredClone(r), id: uid(), tiltak: r.tiltak.map((t) => ({ ...t, id: uid() })) }))
    renummerer(reg)
  }
  return reg
}

export function renummerer(reg: Register) {
  ;[...reg.risker].sort((a, b) => a.nr - b.nr).forEach((r, i) => (r.nr = i + 1))
}

// Excel-registeret merker risker som er hentet inn fra et delregister med en linje først i årsaken:
// «[Filnavn #RiskID | dd.mm.yy]» (frmImport, Tag dokumentet i årsakskolonnen). Risker som er importert flere ganger,
// kan ha flere slike linjer etter hverandre.
const DELREG_MERKE = /^(?:\[[^\]\r\n]* #[^\]\r\n|]* \| \d{2}\.\d{2}\.\d{2}\][ \t]*(?:\r?\n|$))+/

export const harDelregisterMerke = (r: Risk) => DELREG_MERKE.test(r.aarsak) || DELREG_MERKE.test(r.hendelse)

// Fjerner prefixet og tar vare på det som kilde: «1. Riskregister Felles, risk 42 (hentet inn 26.10.26)»
export function utenDelregisterMerke(r: Risk): Risk {
  const merke = r.aarsak.match(DELREG_MERKE)?.[0] ?? r.hendelse.match(DELREG_MERKE)?.[0]
  if (!merke) return r
  const kilde = [...merke.matchAll(/\[(.*) #([^\]|]*) \| ([\d.]+)\]/g)].map(([, fil, id, dato]) => `${fil}${id.trim() ? `, risk ${id.trim()}` : ''} (hentet inn ${dato})`).join(' › ')
  return { ...r, aarsak: r.aarsak.replace(DELREG_MERKE, '').trimStart(), hendelse: r.hendelse.replace(DELREG_MERKE, '').trimStart(), kilde: r.kilde || kilde }
}

// Legger til prefixet slik Excel gjør når et delregister hentes inn: «[Filnavn #nr | dd.mm.yy]» først i årsaken.
// Risker som allerede har et prefix, beholder sitt eget, så det aldri blir to.
export function medDelregisterMerke(r: Risk, filnavn: string, dato = new Date()): Risk {
  if (harDelregisterMerke(r)) return r
  const fil = filnavn.replace(/\.[^.]*$/, '')
  const d = dato.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' })
  return { ...r, aarsak: `[${fil} #${r.nr} | ${d}]\n${r.aarsak}`, kilde: r.kilde || `${fil}, risk ${r.nr} (hentet inn ${d})` }
}

export type PrefixValg = 'behold' | 'fjern' | 'legg-til'

export function brukPrefixValg(risker: Risk[], valg: PrefixValg, filnavn: string): Risk[] {
  if (valg === 'fjern') return risker.map(utenDelregisterMerke)
  if (valg === 'legg-til') return risker.map((r) => medDelregisterMerke(r, filnavn))
  return risker
}

// Eksponering = sannsynlighet × konsekvens (Eksponering i modBeregninger)
export function eksponering(r: Risk): number {
  return r.sannsynlighet && r.konsekvens ? r.sannsynlighet * r.konsekvens : 0
}

// Forventningsverdi, samme vekting som FV i modBeregninger
export function fv(r: Risk): number {
  return (r.bc + 2.95 * r.ml + r.wc) / 4.95
}

// Farger fra CondFormat.setCondFormat
export function eksponeringFarge(rm: RM, e: number): { bg: string; fg: string } | null {
  if (!e || rm === '-') return null
  const trinn = e < 5 ? 0 : e < 9 ? 1 : e < 15 ? 2 : e < 20 ? 3 : 4
  if (rm === 'R') {
    const bg = ['rgb(0,176,80)', 'rgb(146,208,80)', 'rgb(255,255,0)', 'rgb(255,192,0)', 'rgb(255,0,0)'][trinn]
    return { bg, fg: trinn === 4 ? '#fff' : '#000' }
  }
  const bg = ['rgb(204,229,255)', 'rgb(153,204,255)', 'rgb(102,178,255)', 'rgb(0,102,204)', 'rgb(0,76,153)'][trinn]
  return { bg, fg: trinn >= 3 ? '#fff' : '#000' }
}

export function eksponeringNivaa(e: number): string {
  if (!e) return 'Ikke vurdert'
  return e < 5 ? 'Lav (1–4)' : e < 9 ? 'Moderat (5–8)' : e < 15 ? 'Betydelig (9–14)' : e < 20 ? 'Høy (15–19)' : 'Kritisk (20–25)'
}

// Oppgraderer eldre filformat ved innlesing
export function migrer(doc: Register): Register {
  const d = structuredClone(doc)
  d.lister = { ...structuredClone(DEFAULT_LISTER), ...d.lister }
  d.deltakere ??= []
  d.gjennomganger ??= []
  d.risker ??= []
  d.schemaVersion = SCHEMA_VERSION
  // Felt fra tiden registeret var én JSON-fil i en mappe
  const gammel = d as Register & { hjem?: unknown; lagring?: unknown }
  delete gammel.hjem
  delete gammel.lagring
  return d
}
