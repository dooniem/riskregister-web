// Visning: filtrering, sortering og gruppering. Endrer aldri selve registeret,
// så hver bruker kan sortere og gruppere som de vil uten å påvirke andre.
import type { Kolonne } from './columns'
import { KOL, visTekst } from './columns'
import type { Register, Risk } from './model'
import { eksponering, eksponeringNivaa, faseVed, fv, hvileStatus, hvileTekst, markering, MARKERINGER, nyligLukketDager } from './model'

export type Fane = 'aapne' | 'hviler' | 'lukkede' | 'alle' | 'skarisk'

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
  undergruppering?: string // «og deretter»: grupper hver gruppe en gang til. Maks to nivåer.
  skjulteGrupper: string[] // kolonnegrupper som er slått sammen
  skjulteKolonner: string[]
  bredder: Record<string, number>
  kunFiltrerteSummer: boolean
  visOversikt: boolean
  fag?: string[] // valgte fag-id-er, UTEN_FAG for risker uten fag. Tom = alle
  skjulFag?: boolean // skjul fagmerkene i Nr.-kolonnen og på kortene (også i utskrift)
  person?: string // vis bare risker der personen er risikoeier eller tiltakseier
  samletUtenKategori?: boolean // skjul kategorien under risikoeieren i samlet utseende (egen innstilling, så Klassisk ikke påvirkes)
  visEgendef2?: boolean // egendefinert kolonne 2 er hentet fram (true) eller skjult (false) under Kolonner. Mangler den, gjelder registerets standard
  samletEgendef?: string[] // egendefinerte felt som vises i risikokortet i samlet utseende ('egendef', 'egendef2'). Tom = ingen
  skjulMarkering?: boolean // skjul fargemarkeringene på risknummer og tiltak, f.eks. før utskrift eller presentasjon
  kostSkala?: 'prosjekt' // kostspennet i moderne utseende: egen skala per risk (standard) eller felles skala for prosjektet
  stjerner?: string[] // risker brukeren følger (personlig stjerne). Ligger i nettleseren sammen med resten av visningen
  kunStjerner?: boolean // vis bare riskene brukeren følger (knappen «Følger» i Visninger-raden)
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

// Gruppene for «Neste frist» og «Sist endret», i den rekkefølgen de vises
const FRIST_GRUPPER = ['Frist passert', 'Neste 7 dager', 'Neste 30 dager', 'Senere', '(ingen åpen frist)']
const ENDRET_GRUPPER = ['Siste måned', '1–6 måneder siden', 'Mer enn 6 måneder siden', '(ukjent)']
export const GRUPPERINGER: { key: string; tittel: string; verdi: (r: Risk, doc: Register) => string; rekkefolge?: string[] }[] = [
  { key: '', tittel: 'Ingen gruppering', verdi: () => '' },
  { key: 'fag', tittel: 'Fag', verdi: (r, doc) => fagNavn(r, doc) || '(uten fag)' },
  { key: 'kategori', tittel: 'Kategori', verdi: (r) => r.kategori || '(ingen kategori)' },
  { key: 'eier', tittel: 'Risikoeier', verdi: (r) => r.eier || '(ingen eier)' },
  { key: 'rm', tittel: 'Risiko / mulighet', verdi: (r) => (r.rm === 'R' ? 'Risiko' : r.rm === 'M' ? 'Mulighet' : '(ikke angitt)') },
  { key: 'nivaa', tittel: 'Eksponeringsnivå', verdi: (r) => eksponeringNivaa(eksponering(r)) },
  { key: 'egendef', tittel: 'Egendefinert', verdi: (r) => r.egendef || '(tom)' },
  { key: 'egendef2', tittel: 'Egendefinert 2', verdi: (r) => r.egendef2 || '(tom)' },
  { key: 'status', tittel: 'Status risk', verdi: (r) => r.status || '(tom)' },
  { key: 'lukket', tittel: 'Når lukket', verdi: (r, doc) => lukketGruppe(r, doc, nyligLukketDager(doc)) },
  { key: 'fase', tittel: 'Opprettet i fase', verdi: (r, doc) => faseVed(doc, r.opprettet) ?? '(ukjent fase)' },
  { key: 'lukketfase', tittel: 'Lukket i fase', verdi: (r, doc) => (r.status !== 'Lukket' ? 'Åpne' : (faseVed(doc, r.lukket ?? r.endret) ?? '(ukjent fase)')) },
  { key: 'hvile', tittel: 'Hviler til', verdi: (r, doc) => hvileGruppe(r, doc) },
  { key: 'tiltakstatus', tittel: 'Status på tiltak', verdi: (r) => tiltakOppsummering(r) },
  { key: 'frist', tittel: 'Neste frist', verdi: (r) => fristGruppe(r), rekkefolge: FRIST_GRUPPER },
  { key: 'endret', tittel: 'Sist endret', verdi: (r) => endretGruppe(r), rekkefolge: ENDRET_GRUPPER },
  { key: 'skarisk', tittel: 'Til Skarisk', verdi: (r) => (r.tilSkarisk ? 'Til Skarisk' : 'Ikke til Skarisk'), rekkefolge: ['Til Skarisk', 'Ikke til Skarisk'] },
  { key: 'markering', tittel: 'Fargemarkering', verdi: (r) => markering(r.markering)?.navn ?? '(ingen farge)', rekkefolge: [...MARKERINGER.map((m) => m.navn), '(ingen farge)'] },
  { key: 'opprettet', tittel: 'Opprettet (kvartal)', verdi: (r) => kvartal(r.opprettet) },
]

// Nærmeste frist blant tiltakene som ikke er utført eller avsluttet
function fristGruppe(r: Risk, naa = new Date()): string {
  const frister = r.tiltak.filter((t) => t.frist && !avsluttet(t.status)).map((t) => t.frist.slice(0, 10))
  if (!frister.length) return FRIST_GRUPPER[4]
  const forst = frister.sort()[0]
  const dag = (n: number) => new Date(naa.getTime() + n * 86_400_000).toLocaleDateString('sv-SE')
  if (forst < dag(0)) return FRIST_GRUPPER[0]
  if (forst <= dag(7)) return FRIST_GRUPPER[1]
  if (forst <= dag(30)) return FRIST_GRUPPER[2]
  return FRIST_GRUPPER[3]
}

// Hvor lenge siden risken sist ble endret, samme dato som snarveien «Ikke endret» bruker
function endretGruppe(r: Risk, naa = new Date()): string {
  const sist = r.endret ?? r.opprettet
  if (!sist) return ENDRET_GRUPPER[3]
  const mnd = (n: number) => {
    const d = new Date(naa)
    d.setMonth(d.getMonth() - n)
    return d.getTime()
  }
  const t = Date.parse(sist)
  return t >= mnd(1) ? ENDRET_GRUPPER[0] : t >= mnd(IKKE_VURDERT_MND) ? ENDRET_GRUPPER[1] : ENDRET_GRUPPER[2]
}

function kvartal(iso?: string): string {
  if (!iso) return '(ukjent)'
  const d = new Date(iso)
  return `${d.getFullYear()} K${Math.floor(d.getMonth() / 3) + 1}`
}

// Om en kolonne er skjult i registeret. Egendefinert kolonne 2 er skjult til brukeren henter den fram under Kolonner,
// unntatt i registre der det gamle valget «Bruk en egendefinert kolonne nr. 2» var slått på. Der vises den som før.
export function kolonneSkjult(v: Visning, key: string, egendef2Standard: boolean): boolean {
  if (v.skjulteKolonner.includes(key)) return true
  return key === 'egendef2' && !(v.visEgendef2 ?? egendef2Standard)
}

// Vis eller skjul en kolonne. For egendefinert kolonne 2 huskes valget også i visEgendef2, så det overstyrer registerets standard.
export function visKolonne(v: Visning, key: string, vis: boolean): Visning {
  const andre = v.skjulteKolonner.filter((x) => x !== key)
  return { ...v, skjulteKolonner: vis ? andre : [...andre, key], ...(key === 'egendef2' ? { visEgendef2: vis } : {}) }
}

// Grupperingene som kan velges i registeret: de egendefinerte får navnet fra prosjektet
// «Når lukket» gir bare mening der det finnes lukkede risker, altså i Lukkede og Alle.
export function grupperinger(doc: Register, fane?: Fane) {
  return GRUPPERINGER.filter(
    (g) =>
      (g.key !== 'lukket' || fane === 'lukkede' || fane === 'alle') &&
      (g.key !== 'hvile' || fane === 'hviler') &&
      // Fasegrupperingene trenger at prosjektet står i en fase eller har byttet fase i appen
      ((g.key !== 'fase' && g.key !== 'lukketfase') || !!doc.faseHistorikk?.length || !!doc.prosjekt.fase) &&
      (g.key !== 'lukketfase' || fane === 'lukkede' || fane === 'alle'),
  ).map((g) =>
    g.key === 'egendef' ? { ...g, tittel: doc.lister.egendefNavn || g.tittel } : g.key === 'egendef2' ? { ...g, tittel: doc.lister.egendef2Navn || g.tittel } : g,
  )
}

// Lukkede risker eldes ut av synsfeltet: de som er lukket de siste dagene (90 som standard, kan endres for registeret)
// står øverst, eldre grupperes per år og er slått sammen til man åpner gruppen. Ingenting slettes.
// De eldre grupperes også på fasen de ble lukket i («Lukket i 2027 · B4 Produksjon»), ut fra fasehistorikken.
const NYLIG_LUKKET = 'Lukket siste '
export const LUKKET_UTEN_DATO = 'Lukket, uten dato'
const LUKKET_AAR = 'Lukket i '

export function lukketGruppe(r: Risk, doc: Register, dager: number, naa = Date.now()): string {
  if (r.status !== 'Lukket') return 'Åpne'
  // Risker som er lukket før appen tok vare på tidspunktet (f.eks. importert fra Excel), bruker sist endret
  const t = Date.parse(r.lukket ?? r.endret ?? '')
  if (Number.isNaN(t)) return LUKKET_UTEN_DATO
  if (naa - t <= dager * 86_400_000) return `${NYLIG_LUKKET}${dager} dager`
  const fase = faseVed(doc, new Date(t).toISOString())
  return LUKKET_AAR + new Date(t).getFullYear() + (fase ? ` · ${fase}` : '')
}

// Gruppene i «Når lukket» som er slått sammen til brukeren åpner dem: alt som er eldre enn de siste 90 dagene
export const sammenslaattSomStandard = (gruppering: string, navn: string) => gruppering === 'lukket' && (navn.startsWith(LUKKET_AAR) || navn === LUKKET_UTEN_DATO)

// Gruppen en hvilende risk står i: fasen eller dagen den våkner
export function hvileGruppe(r: Risk, doc: Register): string {
  const h = doc.hviler?.[r.id]
  return h && hvileStatus(doc, r) === 'hviler' ? 'Til ' + hvileTekst(h) : '(hviler ikke)'
}

// Grupperingen som gjelder i fanen. Lukkede-fanen har sin egen, som er «Når lukket» til brukeren velger noe annet.
// Hviler-fanen grupperes alltid etter når riskene våkner.
export function aktivGruppering(v: Visning): string {
  if (v.fane === 'hviler') return 'hvile'
  if (v.fane === 'lukkede') return v.grupperingLukkede ?? 'lukket'
  return (v.gruppering === 'lukket' && v.fane !== 'alle') || v.gruppering === 'hvile' ? '' : v.gruppering
}

// «Og deretter»: undergrupperingen gjelder bare når det er en hovedgruppering, og ikke er den samme
export function aktivUndergruppering(v: Visning): string {
  const g = aktivGruppering(v)
  const u = v.undergruppering ?? ''
  if (!g || !u || u === g || u === 'hvile' || v.fane === 'hviler') return ''
  if ((u === 'lukket' || u === 'lukketfase') && v.fane !== 'lukkede' && v.fane !== 'alle') return ''
  return u
}

// Snarveier: ferdige utvalg som appen regner ut, for å finne det som haster eller er glemt når registeret har vokst
export type Snarvei = 'frist' | 'ikkeVurdert' | 'nye' | 'utenTiltak' | 'vaaknet'
export const IKKE_VURDERT_MND = 6

const avsluttet = (status: string) => status === 'Utført' || status === 'Utføres ikke'

export const SNARVEIER: { key: Snarvei; tittel: string; forklaring: string }[] = [
  { key: 'frist', tittel: 'Frist passert', forklaring: 'Åpne risker med minst ett tiltak der fristen er passert og som ikke er utført' },
  { key: 'ikkeVurdert', tittel: `Ikke endret på ${IKKE_VURDERT_MND} mnd`, forklaring: `Åpne risker der verken risken eller tiltakene er endret de siste ${IKKE_VURDERT_MND} månedene` },
  { key: 'nye', tittel: 'Nye siden siste snapshot', forklaring: 'Risker som er opprettet etter det siste snapshotet' },
  { key: 'utenTiltak', tittel: 'Uten tiltak', forklaring: 'Åpne risker som ikke har noen tiltak' },
  { key: 'vaaknet', tittel: 'Våknet', forklaring: 'Risker som har hvilt og er tilbake blant de åpne. Merket fjernes ved å klikke på det i Nr.-kolonnen' },
]

export function iSnarvei(r: Risk, s: Snarvei, doc: Register, fra?: string, naa = new Date()): boolean {
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
    case 'vaaknet':
      return hvileStatus(doc, r) === 'vaaknet'
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

// Åpne viser ikke risker som hviler. De ligger i Hviler, og er med i Alle og Til Skarisk som før.
export function iFane(r: Risk, fane: Fane, doc: Register) {
  if (fane === 'alle') return true
  if (fane === 'skarisk') return r.tilSkarisk && r.status !== 'Lukket'
  if (fane === 'lukkede') return r.status === 'Lukket'
  const hviler = hvileStatus(doc, r) === 'hviler'
  return fane === 'hviler' ? hviler : r.status !== 'Lukket' && !hviler
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
    if (!iFane(r, v.fane, doc)) return false
    if (!iFag(r, doc, v.fag)) return false
    if (v.person && !harPerson(r, v.person)) return false
    if (v.kunStjerner && !v.stjerner?.includes(r.id)) return false
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
    if (v.filter.snarvei && !iSnarvei(r, v.filter.snarvei, doc, v.filter.snarveiFra)) return false
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

const lukketRang = (n: string) => (n === 'Åpne' ? 0 : n.startsWith(NYLIG_LUKKET) ? 1 : n === LUKKET_UTEN_DATO ? 3 : 2)

export interface Gruppe {
  navn: string
  risker: Risk[] // riskene som vises rett under overskriften (tom for en hovedgruppe med undergrupper)
  key?: string // grupperingen gruppen kommer fra
  id?: string // unik for gruppen, også når to hovedgrupper har undergrupper med samme navn
  nivaa?: 0 | 1
  forelder?: string // id til hovedgruppen
  alle?: Risk[] // alle riskene i gruppen, for antall og summer i overskriften
}

// Grupper på ett eller to nivåer. Med undergruppering kommer hver hovedgruppe først, fulgt av undergruppene sine.
export function grupperNivaa(doc: Register, risker: Risk[], key: string, under: string): Gruppe[] {
  const hoved = grupper(doc, risker, key).map((g): Gruppe => ({ ...g, key, id: g.navn, nivaa: 0 }))
  if (!key || !under) return hoved
  return hoved.flatMap((h) => [
    { ...h, risker: [], alle: h.risker },
    ...grupper(doc, h.risker, under).map((u): Gruppe => ({ ...u, key: under, id: `${h.navn}\u0000${u.navn}`, nivaa: 1, forelder: h.navn })),
  ])
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
  // Datoene i den rekkefølgen riskene våkner, så fasene
  else if (key === 'hvile') {
    const nokkel = (n: string) => {
      const h = doc.hviler?.[m.get(n)![0].id]
      return h?.til ?? (h?.fase ? '~' + h.fase : '~~')
    }
    navn.sort((a, b) => (nokkel(a) < nokkel(b) ? -1 : nokkel(a) > nokkel(b) ? 1 : 0))
  }
  // Faste grupper står i en naturlig rekkefølge (frist, farge), kvartalene med det nyeste først
  else if (g.rekkefolge) {
    const i = (n: string) => (g.rekkefolge!.indexOf(n) + 1 || 99)
    navn.sort((a, b) => i(a) - i(b))
  } else if (key === 'fase' || key === 'lukketfase') {
    // Åpne først, så fasene i samme rekkefølge som fase-listen, faser som ikke står i listen etter, og ukjent til sist
    const i = (n: string) => (n === 'Åpne' ? 0 : n.startsWith('(') ? 999 : doc.lister.faser.indexOf(n) + 1 || 500)
    navn.sort((a, b) => i(a) - i(b) || a.localeCompare(b, 'nb'))
  } else if (key === 'opprettet') navn.sort((a, b) => (a.startsWith('(') ? 1 : b.startsWith('(') ? -1 : b.localeCompare(a)))
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

// Lagrede visninger: det som bestemmer hvilke risker som vises og hvordan, med et navn.
// Søket hører til det man leter etter akkurat nå og lagres ikke. Bredder, oversikten, fagmerker, fargemarkering og kostskala er personlige vaner og følger ikke med.
export const VISNING_FELT = ['fane', 'sortering', 'filter', 'gruppering', 'grupperingLukkede', 'undergruppering', 'skjulteGrupper', 'skjulteKolonner', 'fag', 'person', 'kunStjerner', 'samletUtenKategori', 'samletEgendef', 'visEgendef2'] as const
export type VisningInnhold = Partial<Pick<Visning, (typeof VISNING_FELT)[number]>>

// Personfilteret på brukeren selv lagres som MEG, så «Mine tiltak» viser tiltakene til den som bruker visningen
export const MEG = '@meg'

export function visningInnhold(v: Visning, meg?: string): VisningInnhold {
  const { snarveiFra: _f, ...filter } = v.filter
  const ut: VisningInnhold = {
    fane: v.fane,
    sortering: v.sortering,
    filter: {
      ...filter,
      verdier: { ...filter.verdier },
      tekst: Object.fromEntries(Object.entries(filter.tekst).filter(([, t]) => t.trim())),
    },
    gruppering: v.gruppering,
    grupperingLukkede: v.grupperingLukkede,
    undergruppering: v.undergruppering || undefined,
    skjulteGrupper: v.skjulteGrupper,
    skjulteKolonner: v.skjulteKolonner,
    fag: v.fag?.length ? v.fag : undefined,
    person: v.person && meg && v.person === meg ? MEG : v.person,
    kunStjerner: v.kunStjerner || undefined,
    samletUtenKategori: v.samletUtenKategori || undefined,
    samletEgendef: v.samletEgendef?.length ? v.samletEgendef : undefined,
    visEgendef2: v.visEgendef2,
  }
  // Tomme felt tas ikke med, så sammenligningen under ikke skiller på «mangler» og «tom»
  for (const k of VISNING_FELT) if (ut[k] === undefined) delete ut[k]
  return ut
}

export function brukVisning(v: Visning, innhold: VisningInnhold, meg: string | undefined, snarveiFra?: string): Visning {
  const filter = innhold.filter ?? { verdier: {}, tekst: {} }
  return {
    ...v,
    fane: innhold.fane ?? 'aapne',
    sortering: innhold.sortering ?? [],
    filter: {
      ...filter,
      verdier: filter.verdier ?? {},
      tekst: filter.tekst ?? {},
      snarveiFra: filter.snarvei === 'nye' ? snarveiFra : undefined,
    },
    gruppering: innhold.gruppering ?? '',
    grupperingLukkede: innhold.grupperingLukkede,
    undergruppering: innhold.undergruppering,
    skjulteGrupper: innhold.skjulteGrupper ?? [],
    skjulteKolonner: innhold.skjulteKolonner ?? [],
    fag: innhold.fag ?? [],
    person: innhold.person === MEG ? meg : innhold.person,
    kunStjerner: innhold.kunStjerner,
    samletUtenKategori: innhold.samletUtenKategori,
    samletEgendef: innhold.samletEgendef,
    visEgendef2: innhold.visEgendef2,
  }
}

// Om det som vises nå, er det samme som visningen. Rekkefølgen på nøklene spiller ingen rolle.
export function likVisning(v: Visning, innhold: VisningInnhold, meg?: string): boolean {
  return stabil(visningInnhold(v, meg)) === stabil(visningInnhold(brukVisning(v, innhold, meg), meg))
}

function stabil(x: unknown): string {
  return JSON.stringify(x, (_k, verdi) => (verdi && typeof verdi === 'object' && !Array.isArray(verdi) ? Object.fromEntries(Object.entries(verdi).sort(([a], [b]) => a.localeCompare(b))) : verdi))
}

const FANE_NAVN: Record<Fane, string> = {
  aapne: 'Åpne',
  hviler: 'Hviler',
  lukkede: 'Lukkede',
  alle: 'Alle',
  skarisk: 'Til Skarisk',
}

// Kort beskrivelse av visningen, i den rekkefølgen man ser den: fane, utvalg, sortering, gruppering og kolonner
export function beskrivVisning(doc: Register, innhold: VisningInnhold): string[] {
  const ut: string[] = [`Fanen ${FANE_NAVN[innhold.fane ?? 'aapne']}`]
  const f = innhold.filter
  if (f?.snarvei) ut.push(`Snarveien «${SNARVEIER.find((s) => s.key === f.snarvei)?.tittel}»`)
  if (innhold.person) ut.push(innhold.person === MEG ? 'Der den som bruker visningen, er risikoeier eller tiltakseier' : `Bare ${innhold.person}`)
  if (innhold.kunStjerner) ut.push('Bare riskene brukeren følger (hver bruker ser sine egne stjerner)')
  if (innhold.fag?.length) ut.push(`Fag: ${innhold.fag.map((id) => (id === UTEN_FAG ? 'uten fag' : (doc.lister.fag.find((x) => x.id === id)?.navn ?? '?'))).join(', ')}`)
  for (const [k, verdier] of Object.entries(f?.verdier ?? {})) ut.push(`${kolTittel(doc, k)}: ${verdier.map((x) => x || '(tom)').join(', ')}`)
  for (const [k, t] of Object.entries(f?.tekst ?? {})) ut.push(`${kolTittel(doc, k)} inneholder «${t}»`)
  if (f?.matrise) ut.push(`Sannsynlighet ${f.matrise.s}, konsekvens ${f.matrise.k}`)
  if (innhold.sortering?.length) ut.push(`Sortert på ${innhold.sortering.map((s) => `${kolTittel(doc, s.key)} (${s.stigende ? 'stigende' : 'synkende'})`).join(', ')}`)
  const g = aktivGruppering({ ...STANDARD_VISNING, ...innhold } as Visning)
  const u = aktivUndergruppering({ ...STANDARD_VISNING, ...innhold } as Visning)
  const tittel = (k: string) => (GRUPPERINGER.find((x) => x.key === k)?.tittel ?? k).toLowerCase()
  if (g) ut.push(`Gruppert på ${tittel(g)}${u ? ` og deretter ${tittel(u)}` : ''}`)
  const skjult = (innhold.skjulteKolonner?.length ?? 0) + (innhold.skjulteGrupper?.length ?? 0)
  if (skjult)
    ut.push(
      `${innhold.skjulteKolonner?.length ? `${innhold.skjulteKolonner.length} kolonner skjult` : ''}${innhold.skjulteKolonner?.length && innhold.skjulteGrupper?.length ? ', ' : ''}${innhold.skjulteGrupper?.length ? `${innhold.skjulteGrupper.length} kolonnegrupper slått sammen` : ''}`,
    )
  return ut
}

function kolTittel(doc: Register, key: string): string {
  return KOL[key] ? KOL[key].tittel(doc).replace(/\s+/g, ' ') : key
}

// Stjerne på en eller flere risker. Uten «paa» byttes stjernen på den første, og de andre får det samme.
export function byttStjerner(v: Visning, ider: string[], paa?: boolean): Visning {
  const l = v.stjerner ?? []
  const sett = paa ?? !l.includes(ider[0])
  return { ...v, stjerner: sett ? [...l, ...ider.filter((id) => !l.includes(id))] : l.filter((id) => !ider.includes(id)) }
}
