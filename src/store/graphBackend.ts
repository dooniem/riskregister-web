// SharePoint-lagring via Microsoft Graph med delegerte tilganger.
// Registeret er en mappe med register.json. Tilstedeværelse ligger som små filer per bruker i undermappen _tilstede,
// slik at brukere aldri skriver til samme fil samtidig.
//
// Versjonstak: Hver lagring blir en ny versjon av filen i SharePoint. I biblioteker med delversjoner (0.1, 0.2 …)
// nekter SharePoint å lagre når en fil har nådd 511 delversjoner. Derfor får ingen fil leve lenge nok til å nå det:
// etter ROTER_ETTER lagringer flyttes register.json til _historikk med dato i navnet, og en ny register.json lages.
// Bare de HISTORIKK_ANTALL nyeste arkivfilene beholdes, de eldre slettes. Tilstedefilene byttes ut etter
// TILSTEDE_ROTER_ETTER skrivinger. Det virker uansett hvordan biblioteket er satt opp, uten noe fra IT eller brukerne.
import type { Register } from '../model'
import type { Bruker } from '../ops'
import { appUrl, token } from './auth'
import type { Backend, LagreSvar, Tilstede, Versjon } from './backend'

const GRAPH = 'https://graph.microsoft.com/v1.0'
export const REGISTERFIL = 'register.json'
const TILSTEDEMAPPE = '_tilstede'
const HISTORIKKMAPPE = '_historikk'
const ROTER_ETTER = 400
const HISTORIKK_ANTALL = 3
const TILSTEDE_ROTER_ETTER = 400
const oktId = Math.random().toString(36).slice(2, 8)
const idag = () => new Date().toLocaleDateString('sv-SE') // ÅÅÅÅ-MM-DD i lokal tid

export class GraphFeil extends Error {
  status: number
  constructor(status: number, melding: string) {
    super(melding)
    this.status = status
  }
}

async function graph(sti: string, init: RequestInit = {}): Promise<Response> {
  const t = await token()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${t}`)
  for (let forsok = 0; ; forsok++) {
    const r = await fetch(sti.startsWith('http') ? sti : GRAPH + sti, { ...init, headers })
    // Struping fra SharePoint: vent det Graph ber om og prøv igjen
    if ((r.status === 429 || r.status === 503) && forsok < 4) {
      const sek = Number(r.headers.get('Retry-After')) || 2 ** forsok
      await new Promise((res) => setTimeout(res, sek * 1000))
      continue
    }
    return r
  }
}

async function graphJson<T>(sti: string, init?: RequestInit): Promise<T> {
  const r = await graph(sti, init)
  if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
  return r.json()
}

async function feiltekst(r: Response) {
  if (r.status === 401) return 'Innloggingen er utløpt. Last siden på nytt.'
  if (r.status === 403) return 'Du har ikke tilgang til dette registeret i SharePoint.'
  if (r.status === 404) return 'Fant ikke registeret. Er lenken riktig, og har du tilgang?'
  if (r.status === 423) return 'SharePoint har låst register.json (den er sjekket ut eller åpnet av et annet program). Sjekk inn filen i SharePoint, eller be IT slå av krav om utsjekking i biblioteket.'
  let melding = ''
  try {
    const j = await r.json()
    melding = j?.error?.message ?? ''
  } catch {
    // ingen feiltekst i svaret
  }
  if (/version/i.test(melding)) return `SharePoint vil ikke lagre flere versjoner av register.json (${melding}). Publiser en hovedversjon av filen i SharePoint.`
  return melding || `Feil fra SharePoint (${r.status})`
}

// Gjør en vanlig SharePoint-lenke om til en share-id for /shares-endepunktet
function shareId(url: string) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(url)))
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

interface DriveItem {
  id: string
  name: string
  eTag: string
  webUrl: string
  folder?: unknown
  file?: unknown
  lastModifiedDateTime: string
  createdDateTime?: string
  parentReference: { driveId: string; id: string; path?: string }
  '@microsoft.graph.downloadUrl'?: string
}

// Reserve når /shares-oppslaget ikke virker, f.eks. med tillatelsen Sites.Selected:
// finn området, så biblioteket og så mappen ut fra selve adressen. Virker med adressen fra nettleserens adresselinje
// (https://firma.sharepoint.com/sites/Prosjekt/Delte dokumenter/Riskregister) og med visningslenker som har ?id=.
// Delingslenker (…/:f:/s/…) kan ikke tolkes slik.
async function finnViaAdresse(ref: string, opprinneligFeil: unknown): Promise<DriveItem> {
  let url: URL
  try {
    url = new URL(ref)
  } catch {
    throw opprinneligFeil
  }
  const id = url.searchParams.get('id')
  const sti = decodeURIComponent(id ?? url.pathname).replace(/\/+$/, '')
  const deler = sti.split('/').filter(Boolean)
  if (/^:\w:$/.test(deler[0] ?? ''))
    throw new Error('Delingslenker kan ikke brukes med denne tilkoblingen. Åpne mappen i SharePoint og kopier adressen fra nettleserens adresselinje i stedet.')
  const omraadeSti = deler[0] === 'sites' || deler[0] === 'teams' ? '/' + deler.slice(0, 2).join('/') : ''
  const site = await graphJson<{ id: string }>(`/sites/${url.hostname}:${omraadeSti || '/'}`).catch(() => {
    throw opprinneligFeil
  })
  const drives = await graphJson<{ value: { id: string; webUrl: string }[] }>(`/sites/${site.id}/drives?$select=id,webUrl`)
  const full = `${url.origin}${sti}`.toLowerCase()
  // Lengste treff vinner, i tilfelle et bibliotek heter det samme som starten på et annet
  const drive = drives.value
    .map((d) => ({ ...d, sti: decodeURIComponent(d.webUrl).replace(/\/+$/, '').toLowerCase() }))
    .filter((d) => full === d.sti || full.startsWith(d.sti + '/'))
    .sort((a, b) => b.sti.length - a.sti.length)[0]
  if (!drive) throw opprinneligFeil
  const rest = `${url.origin}${sti}`.slice(drive.sti.length).replace(/^\/+/, '')
  return graphJson<DriveItem>(rest ? `/drives/${drive.id}/root:/${rest.split('/').map(encodeURIComponent).join('/')}` : `/drives/${drive.id}/root`)
}

export interface Plassering {
  driveId: string
  mappeId: string
  mappeNavn: string
  webUrl: string
}

// Finner mappen et register ligger i, ut fra en lenke (mappe eller register.json) eller drive:<driveId>:<itemId>
export async function finnPlassering(ref: string): Promise<Plassering> {
  let item: DriveItem
  if (ref.startsWith('drive:')) {
    const [, driveId, itemId] = ref.split(':')
    item = await graphJson<DriveItem>(`/drives/${driveId}/items/${itemId}`)
  } else {
    item = await graphJson<DriveItem>(`/shares/${shareId(ref.trim())}/driveItem`).catch((e) => finnViaAdresse(ref.trim(), e))
  }
  if (item.folder) return { driveId: item.parentReference.driveId, mappeId: item.id, mappeNavn: item.name, webUrl: item.webUrl }
  const forelder = await graphJson<DriveItem>(`/drives/${item.parentReference.driveId}/items/${item.parentReference.id}`)
  return { driveId: forelder.parentReference.driveId, mappeId: forelder.id, mappeNavn: forelder.name, webUrl: forelder.webUrl }
}

export function appLenke(p: Plassering) {
  return `${appUrl()}?reg=${encodeURIComponent(`drive:${p.driveId}:${p.mappeId}`)}`
}

// Oppretter en ny mappe med register.json og en snarvei som åpner appen
export async function opprettRegisterISharePoint(forelderRef: string, mappenavn: string, doc: Register): Promise<Plassering> {
  const forelder = await finnPlassering(forelderRef)
  const mappe = await graphJson<DriveItem>(`/drives/${forelder.driveId}/items/${forelder.mappeId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: mappenavn, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  }).catch((e) => {
    if (e instanceof GraphFeil && e.status === 409) throw new Error(`Det finnes allerede en mappe som heter «${mappenavn}» her.`)
    throw e
  })
  const p: Plassering = { driveId: forelder.driveId, mappeId: mappe.id, mappeNavn: mappe.name, webUrl: mappe.webUrl }
  const medHjem: Register = { ...doc, hjem: { driveId: p.driveId, itemId: p.mappeId }, lagring: { antall: 1, dato: idag() } }
  await graphJson(`/drives/${p.driveId}/items/${p.mappeId}:/${REGISTERFIL}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(medHjem, null, 1),
  })
  const snarvei = `[InternetShortcut]\r\nURL=${appLenke(p)}\r\n`
  await graphJson(`/drives/${p.driveId}/items/${p.mappeId}:/${encodeURIComponent('Åpne Riskregister.url')}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: snarvei,
  })
  return p
}

export class GraphBackend implements Backend {
  readonly type = 'sharepoint' as const
  readonly pollMs = 3000
  readonly hjerteslagMs = 10000
  readonly samleMs = 5000
  kanSkrive = true
  readonly bruker: Bruker
  readonly tittel: string
  readonly plassering: Plassering
  private tilstedeMappeId = ''
  private historikkMappeId = ''
  private tilstedeCache = new Map<string, { eTag: string; t: Tilstede }>()
  private tilstedeSkrivinger = 0
  private tilstedeFil = ''
  private ryddet = false

  private constructor(p: Plassering, bruker: Bruker) {
    this.plassering = p
    this.bruker = bruker
    this.tittel = p.mappeNavn
  }

  static async aapne(ref: string, bruker: Bruker): Promise<GraphBackend> {
    const p = await finnPlassering(ref)
    const b = new GraphBackend(p, bruker)
    await graphJson<DriveItem>(b.filSti).catch((e) => {
      if (e instanceof GraphFeil && e.status === 404) throw new Error(`Mappen «${p.mappeNavn}» inneholder ikke noe riskregister (${REGISTERFIL}).`)
      throw e
    })
    return b
  }

  hjem() {
    return { driveId: this.plassering.driveId, itemId: this.plassering.mappeId }
  }

  // Filen adresseres med sti, ikke id, fordi register.json byttes ut når den arkiveres
  private get mappeSti() {
    return `/drives/${this.plassering.driveId}/items/${this.plassering.mappeId}`
  }
  private get filSti() {
    return `${this.mappeSti}:/${REGISTERFIL}:`
  }

  async hent(): Promise<Versjon> {
    const item = await graphJson<DriveItem>(this.filSti)
    const url = item['@microsoft.graph.downloadUrl']
    const r = url ? await fetch(url, { cache: 'no-store' }) : await graph(this.filSti + '/content')
    if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
    return { doc: await r.json(), etag: item.eTag }
  }

  async sjekk(): Promise<string> {
    const item = await graphJson<DriveItem>(this.filSti + '?$select=eTag')
    return item.eTag
  }

  async lagre(doc: Register, hvisEtag: string): Promise<LagreSvar> {
    const teller = doc.lagring ?? { antall: 0, dato: idag() }
    if (teller.antall >= ROTER_ETTER) return this.arkiverOgLagre(doc, hvisEtag, teller.dato)
    const r = await graph(this.filSti + '/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': hvisEtag },
      body: JSON.stringify({ ...doc, lagring: { antall: teller.antall + 1, dato: teller.dato } }, null, 1),
    })
    // Har filen likevel nådd versjonstaket (f.eks. lagret mye fra en eldre versjon av appen), arkiveres den med en gang
    if (!r.ok && r.status !== 412 && r.status !== 409 && /version/i.test(await r.clone().text())) return this.arkiverOgLagre(doc, hvisEtag, teller.dato)
    return this.lagreSvar(r)
  }

  // Flytter register.json til _historikk og lager en ny register.json med innholdet som skal lagres.
  // Flyttingen krever at filen ikke er endret av andre (If-Match). Har noen lagret i mellomtiden, blir det en vanlig konflikt.
  private async arkiverOgLagre(doc: Register, hvisEtag: string, fraDato: string): Promise<LagreSvar> {
    const tid = new Date().toLocaleTimeString('sv-SE').slice(0, 5).replace(':', '.')
    const flytt = await graph(`${this.filSti}?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': hvisEtag },
      body: JSON.stringify({ name: `register ${fraDato} til ${idag()} ${tid}.json`, parentReference: { id: await this.historikkMappe() } }),
    })
    if (flytt.status === 412 || flytt.status === 409 || flytt.status === 404) return { ok: false, konflikt: true }
    if (!flytt.ok) throw new GraphFeil(flytt.status, await feiltekst(flytt))
    const arkivert = (await flytt.json()) as DriveItem
    const r = await graph(`${this.filSti}/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...doc, lagring: { antall: 1, dato: idag() } }, null, 1),
    }).catch((e) => e as Error)
    // Klarte vi ikke å lage den nye filen, flyttes den gamle tilbake så registeret ikke blir borte
    if (r instanceof Error || (!r.ok && r.status !== 409)) {
      await graph(`/drives/${this.plassering.driveId}/items/${arkivert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: REGISTERFIL, parentReference: { id: this.plassering.mappeId } }),
      }).catch(() => {})
      if (r instanceof Error) throw r
    }
    if (r.ok) void this.ryddHistorikk()
    return this.lagreSvar(r)
  }

  // Beholder bare de HISTORIKK_ANTALL nyeste arkivfilene, regnet etter når filen ble opprettet.
  // Slettede filer havner i papirkurven i SharePoint og kan hentes tilbake derfra en tid.
  private async ryddHistorikk() {
    try {
      const mappe = await this.historikkMappe()
      const liste = await graphJson<{ value: DriveItem[] }>(`/drives/${this.plassering.driveId}/items/${mappe}/children?$select=id,name,createdDateTime&$top=200`)
      const arkiv = liste.value.filter((it) => /^register .*\.json$/.test(it.name)).sort((a, b) => (b.createdDateTime ?? '').localeCompare(a.createdDateTime ?? ''))
      for (const it of arkiv.slice(HISTORIKK_ANTALL)) await graph(`/drives/${this.plassering.driveId}/items/${it.id}`, { method: 'DELETE' })
    } catch {
      // Rydding er ikke kritisk. Det prøves igjen neste gang registeret arkiveres.
    }
  }

  private async lagreSvar(r: Response): Promise<LagreSvar> {
    if (r.status === 412 || r.status === 409) return { ok: false, konflikt: true }
    if (r.status === 403) {
      this.kanSkrive = false
      throw new GraphFeil(403, 'Du har bare lesetilgang til dette registeret.')
    }
    if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
    const item = (await r.json()) as DriveItem
    return { ok: true, etag: item.eTag }
  }

  // Finner eller lager en undermappe i registermappen
  private async undermappe(navn: string): Promise<string> {
    const r = await graph(`${this.mappeSti}:/${navn}`)
    if (r.ok) return ((await r.json()) as DriveItem).id
    const ny = await graphJson<DriveItem>(`${this.mappeSti}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: navn, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
    })
    return ny.id
  }

  private async tilstedeMappe(): Promise<string> {
    this.tilstedeMappeId ||= await this.undermappe(TILSTEDEMAPPE)
    return this.tilstedeMappeId
  }

  private async historikkMappe(): Promise<string> {
    this.historikkMappeId ||= await this.undermappe(HISTORIKKMAPPE)
    return this.historikkMappeId
  }

  // Hver økt skriver til sin egen fil, og bytter til en ny fil etter TILSTEDE_ROTER_ETTER skrivinger
  // slik at ingen tilstedefil samler opp mange versjoner. Den forrige filen slettes.
  async publiserTilstede(t: Tilstede) {
    if (!this.kanSkrive) return
    const mappe = await this.tilstedeMappe()
    const navn = `${t.brukerId}~${oktId}~${Math.floor(this.tilstedeSkrivinger++ / TILSTEDE_ROTER_ETTER)}.json`
    await graph(`/drives/${this.plassering.driveId}/items/${mappe}:/${navn}:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    })
    if (this.tilstedeFil && this.tilstedeFil !== navn) void this.slettTilstedefil(this.tilstedeFil)
    this.tilstedeFil = navn
  }

  private async slettTilstedefil(navn: string, keepalive = false) {
    await graph(`/drives/${this.plassering.driveId}/items/${this.tilstedeMappeId}:/${navn}`, { method: 'DELETE', keepalive }).catch(() => {})
  }

  async hentTilstede(): Promise<Tilstede[]> {
    const mappe = await this.tilstedeMappe()
    const liste = await graphJson<{ value: DriveItem[] }>(`/drives/${this.plassering.driveId}/items/${mappe}/children?$top=200`)
    const naa = Date.now()
    const ut: Tilstede[] = []
    // Én gang per økt: rydd bort tilstedefiler fra økter som ble avsluttet uten å slette filen sin
    if (!this.ryddet) {
      this.ryddet = true
      for (const it of liste.value) if (naa - Date.parse(it.lastModifiedDateTime) > 3_600_000) void this.slettTilstedefil(it.name)
    }
    await Promise.all(
      liste.value.map(async (it) => {
        // Hopp over filer som ikke er endret siden sist, og gamle filer fra brukere som har gått
        if (naa - Date.parse(it.lastModifiedDateTime) > 60_000) return
        const c = this.tilstedeCache.get(it.name)
        if (c && c.eTag === it.eTag) return ut.push(c.t)
        const url = it['@microsoft.graph.downloadUrl']
        if (!url) return
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) return
        const t = (await r.json()) as Tilstede
        this.tilstedeCache.set(it.name, { eTag: it.eTag, t })
        ut.push(t)
      }),
    )
    // Samme bruker i flere faner: vis den nyeste
    const nyest = new Map<string, Tilstede>()
    for (const t of ut) if ((nyest.get(t.brukerId)?.ts ?? 0) < t.ts) nyest.set(t.brukerId, t)
    return [...nyest.values()]
  }

  async fjernTilstede() {
    if (!this.tilstedeMappeId || !this.tilstedeFil) return
    await this.slettTilstedefil(this.tilstedeFil, true)
    this.tilstedeFil = ''
  }
}
