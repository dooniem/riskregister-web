// Datamodell for et riskregister. I SharePoint ligger registeret i lister på prosjektets område (se store/lister/skjema.ts).
import type { VisningInnhold } from './view'

export const SCHEMA_VERSION = 1

export type RM = 'R' | 'M' | '-'

export interface Tiltak {
  id: string
  tekst: string
  eier: string
  frist: string // ISO-dato (YYYY-MM-DD) eller tom
  beskrivelse: string // fri tekst om status (kolonne V i Excel)
  status: string // valg fra lister.statusTiltak (kolonne W)
  markering?: string // bakgrunnsfarge på tiltaket, nøkkel i MARKERINGER
}

// Fag er en farget merkelapp på risken, vist i Nr.-kolonnen
export interface Fag {
  id: string
  navn: string
  kort: string // vises i merket, maks 4 tegn
  farge: number // indeks i FAG_FARGER
}

// Ti farger som skiller seg godt fra hverandre og er lesbare med tekst oppå.
// Fargene går gjennom CSS-variabler (--fag-0 … --fag-9), så moderne og samlet visning kan bruke fargene til en bedriftsprofil (src/profil).
const fagFarger: [string, string, string][] = [
  ['Blå', '#1d4ed8', '#fff'],
  ['Rød', '#b91c1c', '#fff'],
  ['Grønn', '#15803d', '#fff'],
  ['Oransje', '#c2410c', '#fff'],
  ['Lilla', '#7e22ce', '#fff'],
  ['Turkis', '#0e7490', '#fff'],
  ['Rosa', '#db2777', '#fff'],
  ['Brun', '#78350f', '#fff'],
  ['Gul', '#facc15', '#1d2733'],
  ['Grå', '#475569', '#fff'],
]
export const FAG_FARGER: { navn: string; bg: string; fg: string }[] = fagFarger.map(([navn, bg, fg], i) => ({
  navn,
  bg: `var(--fag-${i}, ${bg})`,
  fg: `var(--fag-${i}-tekst, ${fg})`,
}))

// Bakgrunnsfarger som brukerne kan legge på risknummeret og tiltakene, slik mange gjør i Excel-registeret
// for å vise hvor modent arbeidet er. Lyse farger, så teksten er lett å lese. Alle kan skjules i visningen.
export const MARKERINGER: { key: string; navn: string; farge: string }[] = [
  { key: 'gul', navn: 'Gul', farge: '#fff0a6' },
  { key: 'gronn', navn: 'Grønn', farge: '#cdeccf' },
  { key: 'blaa', navn: 'Blå', farge: '#cfe3f7' },
  { key: 'oransje', navn: 'Oransje', farge: '#fdd9b5' },
  { key: 'rod', navn: 'Rød', farge: '#f7c9c9' },
  { key: 'lilla', navn: 'Lilla', farge: '#e3d7f3' },
  { key: 'graa', navn: 'Grå', farge: '#dfe3e8' },
]
export const markering = (key?: string) => (key ? MARKERINGER.find((m) => m.key === key) : undefined)

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
  egendef2?: string // egendefinert kolonne 2, skjult i registeret til brukeren henter den fram under Kolonner
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
  vedlegg?: Vedlegg[]
  markering?: string // bakgrunnsfarge på risknummeret, nøkkel i MARKERINGER
}

// En fil i SharePoint som hører til risken: lastet opp fra registeret eller valgt fra dokumentbiblioteket.
// Risken lagrer bare lenken. Filen ligger i biblioteket og blir der selv om lenken fjernes eller risken slettes.
export interface Vedlegg {
  id: string // id-en til filen i dokumentbiblioteket
  navn: string
  url: string // åpner filen i SharePoint (Excel, Word osv. på nett)
  mappeUrl?: string // mappen filen ligger i
  opplastet?: boolean // lastet opp fra registeret til vedleggsmappen. Bare slike filer kan slettes fra registeret.
  lagtTilAv?: string
  lagtTil?: string
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
  egendef2Aktiv: boolean // gammelt valg «Bruk en egendefinert kolonne nr. 2». Avgjør bare om kolonnen vises som standard
  egendef2Navn: string
  egendef2: string[]
  fag: Fag[]
  // Hvor mange dager en lukket risk står øverst i Lukkede-fanen før den flyttes til gruppen for året den ble lukket.
  // Gjelder for alle i registeret. Mangler den, brukes NYLIG_LUKKET_STANDARD.
  nyligLukketDager?: number
}

export const NYLIG_LUKKET_STANDARD = 90
export const NYLIG_LUKKET_VALG = [30, 60, 90, 180, 365]
// Om registeret bruker egendefinert kolonne 2: valget var slått på, kolonnen har fått navn eller valg, eller en risk har en verdi.
// Brukes der kolonnen bare skal med når den er i bruk, som i Excel-eksporten og snapshot-sammenligningen.
export const egendef2IBruk = (doc: Register) =>
  doc.lister.egendef2Aktiv || doc.lister.egendef2.length > 0 || (!!doc.lister.egendef2Navn && doc.lister.egendef2Navn !== DEFAULT_LISTER.egendef2Navn) || doc.risker.some((r) => !!r.egendef2)

export const nyligLukketDager = (doc: Register) => doc.lister.nyligLukketDager || NYLIG_LUKKET_STANDARD

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

// Registeret er låst for redigering fra «fra» til «til» (ISO-tid). Alle kan fortsatt lese. Bare den som låste, kan låse opp før tiden.
// Mellom «tid» og «fra» telles det ned, så andre rekker å fullføre det de holder på med, og den som låste, kan angre.
export interface RegisterLaas {
  av: string // navnet på den som låste
  avId: string
  tid: string // når låsen ble satt
  fra?: string // når låsen trer i kraft (mangler den, gjelder låsen fra «tid»)
  til: string // når det åpner igjen av seg selv
  // Risker den som låste, har slettet i appen mens registeret var låst. Den som låste, kan fortsatt endre,
  // så disse skal ikke vises som slettet direkte i SharePoint.
  slettet?: string[]
}

// Sekundene fra låsen settes til den trer i kraft
export const LAAS_NEDTELLING_S = 30

// Låsen som gjelder akkurat nå, eller null hvis registeret er åpent (også under nedtellingen og når tiden har gått ut)
export function aktivLaas(doc: Register, naa = Date.now()): RegisterLaas | null {
  const l = doc.laas
  return l && Date.parse(l.fra ?? l.tid) <= naa && Date.parse(l.til) > naa ? l : null
}

// Låsen som er satt, men som ikke har trådt i kraft ennå (nedtellingen går)
export function kommendeLaas(doc: Register, naa = Date.now()): RegisterLaas | null {
  const l = doc.laas
  return l?.fra && Date.parse(l.fra) > naa && Date.parse(l.til) > naa ? l : null
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
  laas?: RegisterLaas | null
  // Snapshots som er merket som milepæl («Sluttstatus tilbud»). De står øverst i snapshotlisten og kan ikke slettes uten å fjerne merket først.
  milepaeler?: string[]
  // Hver gang prosjektet har byttet fase med Mer › Bytt fase. Gir fasen en risk ble opprettet og lukket i, ut fra datoene.
  faseHistorikk?: Fasebytte[]
  // Risker som hviler: skjult fra Åpne til en dato eller til prosjektet når en fase. Nøkkelen er risk-id.
  // Når tiden er ute, blir oppføringen stående, så risken kan vises som «Våknet» til noen fjerner merket.
  hviler?: Record<string, Hvile>
  // Felles visninger (filter, sortering, gruppering og kolonner med et navn) som alle i registeret ser over registeret.
  // Personlige visninger ligger i nettleseren til hver bruker.
  visninger?: LagretVisning[]
}

export interface LagretVisning {
  id: string
  navn: string
  innhold: VisningInnhold
  av?: string
  endret: string // ISO-tid
}

export interface Hvile {
  til?: string // YYYY-MM-DD, risken våkner denne dagen
  fase?: string // eller: risken våkner når prosjektet går over i denne fasen
  satt: string // ISO-tid
  av?: string
}

export const iDag = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD i lokal tid

// Om prosjektet har nådd fasen etter at hvilen ble satt: fasen i prosjektinfo, eller et fasebytte til den etter at hvilen ble satt
function naaddFase(doc: Register, h: Hvile): boolean {
  if (!h.fase) return false
  if (doc.prosjekt.fase === h.fase) return true
  return (doc.faseHistorikk ?? []).some((b) => b.til === h.fase && b.dato >= h.satt.slice(0, 10))
}

// 'hviler' når risken er åpen og skal holdes ute av Åpne, 'vaaknet' når den har hvilt og tiden er ute
export function hvileStatus(doc: Register, r: Risk, dag = iDag()): 'hviler' | 'vaaknet' | undefined {
  const h = doc.hviler?.[r.id]
  if (!h || r.status === 'Lukket') return undefined
  const hviler = h.til ? h.til > dag : h.fase ? !naaddFase(doc, h) : false
  return hviler ? 'hviler' : 'vaaknet'
}

export function hvileTekst(h: Hvile): string {
  return h.fase ? `fasen ${h.fase}` : h.til ? new Date(h.til + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

export interface Fasebytte {
  fra: string // fasen før byttet (kan være tom)
  til: string
  dato: string // YYYY-MM-DD, den nye fasen gjelder fra og med denne dagen
  snapshotId?: string // milepæl-snapshotet som ble tatt ved byttet
  av?: string
}

// Fasen prosjektet var i på et tidspunkt, ut fra fasehistorikken. Uten fasebytter er det fasen prosjektet står i nå.
export function faseVed(doc: Register, iso: string | undefined): string | undefined {
  const h = [...(doc.faseHistorikk ?? [])].sort((a, b) => a.dato.localeCompare(b.dato))
  if (!iso) return undefined
  if (!h.length) return doc.prosjekt.fase || undefined
  const d = iso.slice(0, 10)
  let fase = h[0].fra
  for (const b of h) if (b.dato <= d) fase = b.til
  return fase || undefined
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
  faser: ['B0 Prosjektutvikling', 'B1 Tilbudsarbeid', 'B2 Skarisk gjennomført', 'B3 Mobilisering', 'B4 Produksjon', 'B5 Testing', 'B6 Prosjektlukking'],
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
  // Fargene går gjennom CSS-variabler (--eks-r-0 … --eks-m-4), så moderne og samlet visning kan bruke fargene til en bedriftsprofil
  if (rm === 'R') {
    // Samme trinn som i Excel, men dusere farger så de ikke skriker i tabellen og matrisene
    const bg = ['#6cbf8a', '#b5d98a', '#f3dc6b', '#f2b45c', '#e06a5f'][trinn]
    return { bg: `var(--eks-r-${trinn}, ${bg})`, fg: `var(--eks-r-${trinn}-tekst, ${trinn === 4 ? '#fff' : '#1d2830'})` }
  }
  const bg = ['#dbe9f8', '#b9d4f1', '#8ab6e6', '#4f86c6', '#2f5f99'][trinn]
  return { bg: `var(--eks-m-${trinn}, ${bg})`, fg: `var(--eks-m-${trinn}-tekst, ${trinn >= 3 ? '#fff' : '#1d2830'})` }
}

export function eksponeringNivaa(e: number): string {
  if (!e) return 'Ikke vurdert'
  return e < 5 ? 'Lav (1–4)' : e < 9 ? 'Moderat (5–8)' : e < 15 ? 'Betydelig (9–14)' : e < 20 ? 'Høy (15–19)' : 'Kritisk (20–25)'
}

// Oppgraderer eldre filformat ved innlesing
// Standard faselisten før november 2026, og hva hver fase heter i den nye listen.
// Registre som fortsatt har den gamle standardlisten uendret, får den nye når de åpnes. Egne lister røres ikke.
const GAMLE_FASER: Record<string, string> = {
  'B0 Prospekt': 'B0 Prosjektutvikling',
  'B0-B1 Utvikling/Prosjektering': 'B0 Prosjektutvikling',
  'B2-B3 Tilbud': 'B1 Tilbudsarbeid',
  'B3-B4 Mobilisering': 'B3 Mobilisering',
  'B4-B6 Produksjon': 'B4 Produksjon',
}

export function oppdaterFaser(doc: Register): Register {
  const gamle = Object.keys(GAMLE_FASER)
  const f = doc.lister.faser
  if (f.length !== gamle.length || f.some((x, i) => x !== gamle[i])) return doc
  const ny = (x: string) => GAMLE_FASER[x] ?? x
  const d = structuredClone(doc)
  d.lister.faser = [...DEFAULT_LISTER.faser]
  d.prosjekt.fase = ny(d.prosjekt.fase)
  // Fasebytter og hvilende risker følger med, så en risk som venter på «B4-B6 Produksjon», nå venter på «B4 Produksjon»
  d.faseHistorikk = d.faseHistorikk?.map((b) => ({ ...b, fra: ny(b.fra), til: ny(b.til) }))
  for (const h of Object.values(d.hviler ?? {})) if (h.fase) h.fase = ny(h.fase)
  return d
}

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
