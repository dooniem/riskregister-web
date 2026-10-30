// SharePoint-lister via Microsoft Graph. Registeret er listene på ett SharePoint-område.
import { appUrl } from '../auth'
import type { BatchKall } from '../graph'
import { batch, batchFeil, graph, GraphFeil, graphJson, jsonInit } from '../graph'
import type { Element, Endring, ListeLager, Resultat } from './lager'
import type { Kolonne, ListeNavn } from './skjema'
import { LISTER } from './skjema'

export interface Omraade {
  id: string
  navn: string
  webUrl: string
}

interface GraphListe {
  id: string
  displayName: string
  lastModifiedDateTime: string
  webUrl: string
}

interface GraphElement {
  id: string
  eTag: string
  fields?: Record<string, unknown>
  createdDateTime?: string
  lastModifiedDateTime?: string
  createdBy?: { user?: { displayName?: string } }
  lastModifiedBy?: { user?: { displayName?: string } }
}

// Selve registeret. Resten er appens egne lister, som appen lager når de mangler.
const PAAKREVD: ListeNavn[] = ['risker', 'tiltak']
const VALGFRI: ListeNavn[] = ['innstillinger', 'tilstede', 'snapshots', 'snapshotdata']
// Kolonnene som knytter radene til risker og tiltak. Lages de på nytt, er de tomme, og radene kan ikke leses.
const NOKKEL: Partial<Record<ListeNavn, string[]>> = { risker: ['RiskId'], tiltak: ['RiskId', 'TiltakId'] }

// Raden i Klientinnstillinger der det ligger hvilke lister brukeren har valgt, når standardnavnene ikke finnes
const VALGTE_LISTER = 'sharepointLister'
type Valg = Partial<Record<'risker' | 'tiltak', string>> // liste-id

export interface Kandidat {
  id: string
  navn: string
  webUrl: string
  // Om listen har nøkkelkolonnene for risker og tiltak
  passer: { risker: boolean; tiltak: boolean }
}

// Registeret på området mangler Risker eller Tiltak (slettet eller omdøpt). Brukeren kan velge andre lister.
export class ListerMangler extends Error {
  readonly omraade: Omraade
  readonly mangler: ('risker' | 'tiltak')[]
  readonly funnet: Valg // listene som ble funnet
  readonly lister: Kandidat[] // alle listene på området
  constructor(omraade: Omraade, mangler: ('risker' | 'tiltak')[], funnet: Valg, lister: Kandidat[]) {
    super(
      `Fant ikke ${mangler.map((n) => `«${LISTER[n].visningsnavn}»`).join(' og ')} på «${omraade.navn}». ${mangler.length > 1 ? 'Listene' : 'Listen'} kan være slettet eller ha fått et annet navn.`,
    )
    this.omraade = omraade
    this.mangler = mangler
    this.funnet = funnet
    this.lister = lister
  }
}

export interface ManglendeKolonne {
  liste: ListeNavn
  kolonne: string
}

function shareId(url: string) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(url)))
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

// Gjør om adressen til et SharePoint-område (eller en side, liste eller mappe på området) til området selv.
// Godtar også område-id fra Graph (firma.sharepoint.com,<guid>,<guid>).
export async function finnOmraade(ref: string): Promise<Omraade> {
  const tekst = ref.trim()
  const velg = '$select=id,displayName,webUrl'
  type S = { id: string; displayName: string; webUrl: string }
  let s: S
  if (/^[\w.-]+,[0-9a-f-]{36},[0-9a-f-]{36}$/i.test(tekst)) {
    s = await graphJson<S>(`/sites/${tekst}?${velg}`)
  } else {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(tekst) ? tekst : 'https://' + tekst)
    } catch {
      throw new Error('Det ser ikke ut som en adresse. Lim inn adressen til SharePoint-området, f.eks. https://firma.sharepoint.com/sites/Prosjekt123.')
    }
    const deler = decodeURIComponent(url.pathname).split('/').filter(Boolean)
    if (/^:\w:$/.test(deler[0] ?? '')) {
      // Delingslenke («Kopier kobling»)
      s = await graphJson<S>(`/shares/${shareId(tekst)}/site?${velg}`)
    } else {
      // /sites/ og /teams/ kan ha stor forbokstav når adressen er skrevet eller limt inn for hånd
      const type = deler[0]?.toLowerCase()
      const sti = (type === 'sites' || type === 'teams') && deler[1] ? `/${type}/${encodeURIComponent(deler[1])}` : ''
      s = await graphJson<S>(sti ? `/sites/${url.hostname}:${sti}?${velg}` : `/sites/${url.hostname}?${velg}`).catch((e) => {
        if (e instanceof GraphFeil && e.status === 404) throw new Error(`Fant ikke SharePoint-området ${url.origin}${sti}. Sjekk adressen, og at du har tilgang til området.`)
        throw e
      })
    }
  }
  return { id: s.id, navn: s.displayName, webUrl: s.webUrl }
}

// Søker etter områder brukeren har tilgang til
export async function sokOmraader(tekst: string): Promise<Omraade[]> {
  type Site = { id: string; displayName?: string; name?: string; webUrl: string }
  const tilOmraader = (v: Site[]) =>
    v.filter((s) => s.displayName || s.name).map((s) => ({ id: s.id, navn: (s.displayName || s.name)!, webUrl: s.webUrl }))
  // $top og $select sammen med search gir «General exception while processing» i enkelte tenanter
  try {
    const r = await graphJson<{ value: Site[] }>(`/sites?search=${encodeURIComponent(tekst || '*')}`)
    return tilOmraader(r.value).slice(0, 50)
  } catch (e) {
    // Søket feiler også når søkeindeksen ikke er klar (f.eks. i en ny tenant). Vis da områder brukeren følger, og rotområdet.
    const fulgte = await graphJson<{ value: Site[] }>('/me/followedSites').catch(() => ({ value: [] as Site[] }))
    const rot = await graphJson<Site>('/sites/root').catch(() => null)
    const alle = tilOmraader([...(rot ? [rot] : []), ...fulgte.value])
    const t = tekst.toLowerCase()
    const treff = alle.filter((o) => !t || o.navn.toLowerCase().includes(t) || o.webUrl.toLowerCase().includes(t))
    if (treff.length) return treff
    throw new Error(`Søket i SharePoint feilet (${e instanceof Error ? e.message : String(e)}). Lim inn adressen til området i stedet.`)
  }
}

async function hentLister(siteId: string): Promise<GraphListe[]> {
  const ut: GraphListe[] = []
  let neste: string | undefined = `/sites/${siteId}/lists?$select=id,displayName,lastModifiedDateTime,webUrl&$top=200`
  while (neste) {
    const side: { value: GraphListe[]; '@odata.nextLink'?: string } = await graphJson(neste)
    ut.push(...side.value)
    neste = side['@odata.nextLink']
  }
  return ut
}

function kolonneDef(k: Kolonne) {
  const felles = { name: k.navn, ...(k.indeksert ? { indexed: true } : {}) }
  switch (k.type) {
    case 'tekst':
      return { ...felles, text: { maxLength: 255 } }
    case 'langtekst':
      return { ...felles, text: { allowMultipleLines: true, textType: 'plain', linesForEditing: 6 } }
    case 'tall':
      return { ...felles, number: {} }
    case 'janei':
      return { ...felles, boolean: {} }
  }
}

async function opprettListe(siteId: string, navn: ListeNavn): Promise<GraphListe> {
  const def = LISTER[navn]
  return graphJson<GraphListe>(
    `/sites/${siteId}/lists`,
    jsonInit('POST', { displayName: def.visningsnavn, description: def.beskrivelse, columns: def.kolonner.map(kolonneDef), list: { template: 'genericList' } }),
  ).catch((e) => {
    if (e instanceof GraphFeil && e.status === 403)
      throw new Error(
        'Du (eller appen) har ikke lov til å lage lister på dette området. Du må være eier av området, og appen må ha tillatelsen Sites.Manage.All (eller rollen «manage» med Sites.Selected).',
      )
    throw e
  })
}

// Henter navnene på kolonnene i listene (internnavn), og finner dem appen bruker som mangler
async function finnManglende(siteId: string, lister: Partial<Record<ListeNavn, GraphListe>>): Promise<ManglendeKolonne[]> {
  const navn = (Object.keys(lister) as ListeNavn[]).filter((n) => lister[n])
  const svar = await batch(navn.map((n) => ({ method: 'GET', url: `/sites/${siteId}/lists/${lister[n]!.id}/columns?$select=name&$top=500` })))
  const ut: ManglendeKolonne[] = []
  navn.forEach((n, i) => {
    const s = svar[i]
    if (s.status !== 200) return // Usikkert, så la heller lagringen si fra
    const fins = new Set(((s.body as { value?: { name: string }[] })?.value ?? []).map((k) => k.name.toLowerCase()))
    for (const k of LISTER[n].kolonner) if (!fins.has(k.navn.toLowerCase())) ut.push({ liste: n, kolonne: k.navn })
  })
  return ut
}

// Lister på området som kan brukes som risker og tiltak, ut fra kolonnene
async function finnKandidater(siteId: string, alle: GraphListe[]): Promise<Kandidat[]> {
  const lister = alle.filter((l) => !/\/_catalogs\//i.test(l.webUrl))
  const svar = await batch(lister.map((l) => ({ method: 'GET', url: `/sites/${siteId}/lists/${l.id}/columns?$select=name&$top=500` })))
  return lister
    .map((l, i) => {
      const k = new Set(((svar[i].body as { value?: { name: string }[] })?.value ?? []).map((x) => x.name.toLowerCase()))
      // Snapshotdata har også RiskId, men er ikke en riskliste
      const risk = k.has('riskid') && !k.has('snapshotid')
      return { id: l.id, navn: l.displayName, webUrl: l.webUrl, passer: { risker: risk && !k.has('tiltakid'), tiltak: risk && k.has('tiltakid') } }
    })
    .sort((a, b) => Number(b.passer.risker || b.passer.tiltak) - Number(a.passer.risker || a.passer.tiltak) || a.navn.localeCompare(b.navn, 'nb'))
}

async function lesValg(siteId: string, innst: GraphListe | undefined): Promise<{ valg: Valg; radId?: string }> {
  if (!innst) return { valg: {} }
  const r = await graphJson<{ value: GraphElement[] }>(`/sites/${siteId}/lists/${innst.id}/items?$expand=fields&$top=500`).catch(() => ({ value: [] }))
  const rad = r.value.find((i) => i.fields?.Title === VALGTE_LISTER)
  try {
    return { valg: rad ? JSON.parse(String(rad.fields?.Verdi ?? '{}')) : {}, radId: rad?.id }
  } catch {
    return { valg: {}, radId: rad?.id }
  }
}

const listeTekst = (m: ManglendeKolonne[]) => m.map((k) => `«${k.kolonne}» i «${LISTER[k.liste].visningsnavn}»`).join(', ')

const tilElement = (i: GraphElement): Element => ({
  id: i.id,
  etag: i.eTag,
  felt: i.fields ?? {},
  opprettet: i.createdDateTime,
  opprettetAv: i.createdBy?.user?.displayName,
  endret: i.lastModifiedDateTime,
  endretAv: i.lastModifiedBy?.user?.displayName,
})

export class GraphLister implements ListeLager {
  readonly type = 'sharepoint' as const
  readonly omraade: Omraade
  private lister: Partial<Record<ListeNavn, GraphListe>>
  // Kolonner appen bruker som er slettet fra listene (f.eks. i SharePoint i nettleseren). Disse feltene lagres ikke.
  private manglende: ManglendeKolonne[]

  private constructor(omraade: Omraade, lister: Partial<Record<ListeNavn, GraphListe>>, manglende: ManglendeKolonne[] = []) {
    this.omraade = omraade
    this.lister = lister
    this.manglende = manglende
  }

  get tittel() {
    return this.omraade.navn
  }
  get webUrl() {
    return this.omraade.webUrl
  }

  private static finn(alle: GraphListe[]) {
    const lister: Partial<Record<ListeNavn, GraphListe>> = {}
    for (const navn of Object.keys(LISTER) as ListeNavn[]) {
      const navnene = [LISTER[navn].visningsnavn, ...(LISTER[navn].tidligereNavn ?? [])].map((x) => x.toLowerCase())
      const l = alle.find((x) => navnene.includes(x.displayName.toLowerCase()))
      if (l) lister[navn] = l
    }
    return lister
  }

  // Åpner registeret på et område. Lister som kom til i senere versjoner av appen, lages hvis brukeren har lov.
  static async aapne(ref: string): Promise<GraphLister> {
    const omraade = await finnOmraade(ref)
    const alle = await hentLister(omraade.id)
    const lister = GraphLister.finn(alle)
    // Lister brukeren har valgt i stedet for standardnavnene. Valget gjelder så lenge listen finnes.
    const { valg } = await lesValg(omraade.id, lister.innstillinger)
    for (const n of PAAKREVD) {
      const l = alle.find((x) => x.id === valg[n as keyof Valg])
      if (l) lister[n] = l
    }
    const mangler = PAAKREVD.filter((n) => !lister[n]) as ('risker' | 'tiltak')[]
    if (mangler.length) {
      const kandidater = await finnKandidater(omraade.id, alle)
      if (mangler.length === PAAKREVD.length && !kandidater.some((k) => k.passer.risker || k.passer.tiltak))
        throw new Error(`Området «${omraade.navn}» har ikke noe riskregister ennå. Bruk «Sett opp riskregister på et område» på startsiden.`)
      throw new ListerMangler(omraade, mangler, { risker: lister.risker?.id, tiltak: lister.tiltak?.id }, kandidater)
    }
    for (const n of VALGFRI) if (!lister[n]) lister[n] = await opprettListe(omraade.id, n).catch(() => undefined)
    const manglende = await finnManglende(omraade.id, lister)
    const nokler = manglende.filter((k) => NOKKEL[k.liste]?.includes(k.kolonne))
    if (nokler.length)
      throw new Error(
        `Riskregisteret på «${omraade.navn}» mangler kolonnen ${listeTekst(nokler)}. Den knytter radene til riskene, så registeret kan ikke åpnes uten den. En slettet kolonne havner ikke i papirkurven, så kontakt eieren av området eller IT, som kan gjenopprette området fra sikkerhetskopi.`,
      )
    return new GraphLister(omraade, lister, manglende)
  }

  // Lagrer hvilke lister som skal brukes som risker og tiltak (i Klientinnstillinger), og åpner registeret
  static async velgLister(omraade: Omraade, valg: Required<Valg>): Promise<GraphLister> {
    const lister = GraphLister.finn(await hentLister(omraade.id))
    const innst = lister.innstillinger ?? (await opprettListe(omraade.id, 'innstillinger'))
    const { radId } = await lesValg(omraade.id, innst)
    const felt = { Title: VALGTE_LISTER, Verdi: JSON.stringify(valg) }
    const sti = `/sites/${omraade.id}/lists/${innst.id}/items`
    await graphJson(radId ? `${sti}/${radId}/fields` : sti, jsonInit(radId ? 'PATCH' : 'POST', radId ? felt : { fields: felt })).catch((e) => {
      if (e instanceof GraphFeil && e.status === 403) throw new Error('Du har ikke lov til å endre listene på dette området. Be eieren av området om å velge listene.')
      throw e
    })
    return GraphLister.aapne(omraade.webUrl)
  }

  // Lager listene for et nytt register. Det kan bare være ett register per område.
  static async opprett(ref: string): Promise<GraphLister> {
    const omraade = await finnOmraade(ref)
    const alle = await hentLister(omraade.id)
    const lister = GraphLister.finn(alle)
    const { valg } = await lesValg(omraade.id, lister.innstillinger)
    if (lister.risker || alle.some((l) => l.id === valg.risker)) throw new Error(`Området «${omraade.navn}» har allerede et riskregister. Det kan bare være ett register per område.`)
    for (const n of Object.keys(LISTER) as ListeNavn[]) lister[n] ??= await opprettListe(omraade.id, n)
    return new GraphLister(omraade, lister)
  }

  manglendeKolonner() {
    return this.manglende
  }

  // Lager de manglende kolonnene på nytt, tomme. Krever at brukeren kan endre listene.
  async opprettKolonner() {
    for (const k of [...this.manglende]) {
      const def = LISTER[k.liste].kolonner.find((x) => x.navn === k.kolonne)!
      await graphJson(`${this.sti(k.liste)}/columns`, jsonInit('POST', kolonneDef(def))).catch((e) => {
        if (e instanceof GraphFeil && e.status === 403) throw new Error('Du har ikke lov til å endre listene på dette området. Be eieren av området om å trykke på knappen, eller om å lage kolonnene.')
        throw e
      })
      this.manglende = this.manglende.filter((x) => x !== k)
    }
  }

  har(liste: ListeNavn) {
    return !!this.lister[liste]
  }

  listeUrl(liste: ListeNavn) {
    return this.lister[liste]?.webUrl
  }

  private sti(liste: ListeNavn) {
    const l = this.lister[liste]
    if (!l) throw new Error(`Listen «${LISTER[liste].visningsnavn}» finnes ikke på området.`)
    return `/sites/${this.omraade.id}/lists/${l.id}`
  }

  async sistEndret(lister: ListeNavn[]) {
    const alle = await hentLister(this.omraade.id)
    return lister.map((n) => alle.find((l) => l.id === this.lister[n]?.id)?.lastModifiedDateTime ?? '').join('|')
  }

  async hentAlle(liste: ListeNavn, filter?: { kolonne: string; verdi: string }) {
    const ut: Element[] = []
    const f = filter ? `&$filter=fields/${filter.kolonne} eq '${encodeURIComponent(filter.verdi.replace(/'/g, "''"))}'` : ''
    let neste: string | undefined = `${this.sti(liste)}/items?$expand=fields&$top=500${f}`
    while (neste) {
      const side: { value: GraphElement[]; '@odata.nextLink'?: string } = await graphJson(neste, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } })
      ut.push(...side.value.map(tilElement))
      neste = side['@odata.nextLink']
    }
    return ut
  }

  async skriv(endringer: Endring[]): Promise<Resultat[]> {
    if (!endringer.length) return []
    // Felt i kolonner som mangler, sendes ikke, så resten av endringen blir lagret
    const uten = <T extends Record<string, unknown>>(liste: ListeNavn, felt: T) => {
      const borte = this.manglende.filter((k) => k.liste === liste).map((k) => k.kolonne)
      return borte.length ? Object.fromEntries(Object.entries(felt).filter(([k]) => !borte.includes(k))) : felt
    }
    const kall: BatchKall[] = endringer.map((e) => {
      const sti = this.sti(e.liste)
      if (e.type === 'ny') return { method: 'POST', url: `${sti}/items`, body: { fields: uten(e.liste, e.felt) } }
      if (e.type === 'endre') return { method: 'PATCH', url: `${sti}/items/${e.id}/fields`, body: uten(e.liste, e.felt), headers: e.etag ? { 'If-Match': e.etag } : undefined }
      return { method: 'DELETE', url: `${sti}/items/${e.id}` }
    })
    const svar = await batch(kall)
    return svar.map((s, i): Resultat => {
      const e = endringer[i]
      if (s.status >= 200 && s.status < 300) {
        if (e.type === 'ny') return { ok: true, element: tilElement(s.body as GraphElement) }
        if (e.type === 'endre') return { ok: true, etag: (s.body as Record<string, string> | undefined)?.['@odata.etag'] }
        return { ok: true }
      }
      if (e.type === 'slett' && s.status === 404) return { ok: true }
      // 412: raden er endret av andre siden vi hentet den. 404 ved endring: raden er slettet av andre.
      if (s.status === 412 || s.status === 409 || (e.type === 'endre' && s.status === 404)) return { ok: false, konflikt: true }
      // Kolonnen er slettet mens registeret var åpent. Neste lagring hopper over den, og brukeren får beskjed.
      const borte = /Field '([^']+)' is not recognized/i.exec((s.body as { error?: { message?: string } } | undefined)?.error?.message ?? '')?.[1]
      if (s.status === 400 && borte && e.type !== 'slett') {
        if (!this.manglende.some((k) => k.liste === e.liste && k.kolonne === borte)) this.manglende = [...this.manglende, { liste: e.liste, kolonne: borte }]
        return { ok: false, konflikt: false, feil: new GraphFeil(400, `Kolonnen «${borte}» finnes ikke lenger i listen «${LISTER[e.liste].visningsnavn}» i SharePoint. Endringen lagres uten den ved neste forsøk.`) }
      }
      return { ok: false, konflikt: false, feil: batchFeil(s) }
    })
  }

  slettVedLukk(liste: ListeNavn, id: string) {
    void graph(`${this.sti(liste)}/items/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {})
  }

  // Standard dokumentbibliotek på området, for import og eksport av Excel-filer
  async dokumenter(): Promise<{ driveId: string; mappeId: string }> {
    const d = await graphJson<{ id: string }>(`/sites/${this.omraade.id}/drive?$select=id`)
    const rot = await graphJson<{ id: string }>(`/drives/${d.id}/root?$select=id`)
    return { driveId: d.id, mappeId: rot.id }
  }
}

// Lenke som åpner registeret på området direkte
// Rotområdet (https://firma.sharepoint.com uten /sites/…) er startsiden for hele tenanten, ikke et prosjektområde
export function erRotomraade(adresse: string) {
  try {
    return /\.sharepoint\.com$/i.test(new URL(adresse).hostname) && new URL(adresse).pathname.replace(/\/+$/, '') === ''
  } catch {
    return false
  }
}

export function omraadeLenke(webUrl: string) {
  return `${appUrl()}?site=${encodeURIComponent(webUrl)}`
}
