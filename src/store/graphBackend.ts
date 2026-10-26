// SharePoint-lagring via Microsoft Graph med delegerte tilganger.
// Registeret er en mappe med register.json. Tilstedeværelse ligger som én liten fil per bruker i undermappen _tilstede,
// slik at brukere aldri skriver til samme fil samtidig.
import type { Register } from '../model'
import type { Bruker } from '../ops'
import { appUrl, token } from './auth'
import type { Backend, LagreSvar, Tilstede, Versjon } from './backend'

const GRAPH = 'https://graph.microsoft.com/v1.0'
export const REGISTERFIL = 'register.json'
const TILSTEDEMAPPE = '_tilstede'

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
  try {
    const j = await r.json()
    return j?.error?.message ?? `Feil fra SharePoint (${r.status})`
  } catch {
    return `Feil fra SharePoint (${r.status})`
  }
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
  parentReference: { driveId: string; id: string; path?: string }
  '@microsoft.graph.downloadUrl'?: string
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
    item = await graphJson<DriveItem>(`/shares/${shareId(ref.trim())}/driveItem`)
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
  const medHjem: Register = { ...doc, hjem: { driveId: p.driveId, itemId: p.mappeId } }
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
  kanSkrive = true
  readonly bruker: Bruker
  readonly tittel: string
  readonly plassering: Plassering
  private filId = ''
  private tilstedeMappeId = ''
  private tilstedeCache = new Map<string, { eTag: string; t: Tilstede }>()

  private constructor(p: Plassering, bruker: Bruker) {
    this.plassering = p
    this.bruker = bruker
    this.tittel = p.mappeNavn
  }

  static async aapne(ref: string, bruker: Bruker): Promise<GraphBackend> {
    const p = await finnPlassering(ref)
    const b = new GraphBackend(p, bruker)
    const fil = await graphJson<DriveItem>(`/drives/${p.driveId}/items/${p.mappeId}:/${REGISTERFIL}`).catch((e) => {
      if (e instanceof GraphFeil && e.status === 404) throw new Error(`Mappen «${p.mappeNavn}» inneholder ikke noe riskregister (${REGISTERFIL}).`)
      throw e
    })
    b.filId = fil.id
    return b
  }

  hjem() {
    return { driveId: this.plassering.driveId, itemId: this.plassering.mappeId }
  }

  private get filSti() {
    return `/drives/${this.plassering.driveId}/items/${this.filId}`
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
    const r = await graph(this.filSti + '/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': hvisEtag },
      body: JSON.stringify(doc, null, 1),
    })
    if (r.status === 412 || r.status === 409) return { ok: false, konflikt: true }
    if (r.status === 403) {
      this.kanSkrive = false
      throw new GraphFeil(403, 'Du har bare lesetilgang til dette registeret.')
    }
    if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
    const item = (await r.json()) as DriveItem
    return { ok: true, etag: item.eTag }
  }

  private async tilstedeMappe(): Promise<string> {
    if (this.tilstedeMappeId) return this.tilstedeMappeId
    const sti = `/drives/${this.plassering.driveId}/items/${this.plassering.mappeId}`
    const r = await graph(`${sti}:/${TILSTEDEMAPPE}`)
    if (r.ok) {
      this.tilstedeMappeId = ((await r.json()) as DriveItem).id
    } else {
      const ny = await graphJson<DriveItem>(`${sti}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: TILSTEDEMAPPE, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
      })
      this.tilstedeMappeId = ny.id
    }
    return this.tilstedeMappeId
  }

  async publiserTilstede(t: Tilstede) {
    if (!this.kanSkrive) return
    const mappe = await this.tilstedeMappe()
    await graph(`/drives/${this.plassering.driveId}/items/${mappe}:/${t.brukerId}.json:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    })
  }

  async hentTilstede(): Promise<Tilstede[]> {
    const mappe = await this.tilstedeMappe()
    const liste = await graphJson<{ value: DriveItem[] }>(`/drives/${this.plassering.driveId}/items/${mappe}/children?$top=200`)
    const naa = Date.now()
    const ut: Tilstede[] = []
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
    return ut
  }

  async fjernTilstede() {
    if (!this.tilstedeMappeId) return
    await graph(`/drives/${this.plassering.driveId}/items/${this.tilstedeMappeId}:/${this.bruker.id}.json`, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {})
  }
}
