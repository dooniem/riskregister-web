// Mapper og filer i SharePoint (dokumentbiblioteker) for import og eksport av Excel-filer
import { graph, GraphFeil, graphJson, feiltekst } from './graph'
import type { FilElement, FilKilde, FilMappe } from './filer'

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

// Finner en mappe ut fra en lenke (til mappen eller en fil i den) eller drive:<driveId>:<itemId>
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

// Mapper og filer i SharePoint for import og eksport. Starter i en gitt mappe og kan gå opp til roten av biblioteket.
export class GraphFiler implements FilKilde {
  readonly navn = 'SharePoint'
  private driveId = ''
  private startId = ''
  private klar: Promise<void>
  // Tar mappen filvelgeren skal starte i, eller et løfte om den (f.eks. dokumentbiblioteket på et område)
  constructor(p: { driveId: string; mappeId: string } | Promise<{ driveId: string; mappeId: string }>) {
    this.klar = Promise.resolve(p).then((x) => {
      this.driveId = x.driveId
      this.startId = x.mappeId
    })
  }
  static async fraLenke(ref: string) {
    return new GraphFiler(await finnPlassering(ref))
  }
  private get drive() {
    return `/drives/${this.driveId}`
  }
  async start() {
    await this.klar
    return this.mappe(this.startId)
  }
  async mappe(id: string): Promise<FilMappe> {
    await this.klar
    const i = await graphJson<DriveItem & { root?: unknown }>(`${this.drive}/items/${id}?$select=id,name,parentReference,root`)
    // Roten av biblioteket har ikke forelder-id. Navnet på roten er alltid «root», så vis «Dokumenter» i stedet.
    return { id: i.id, navn: i.root ? 'Dokumenter' : i.name, forelder: i.root ? undefined : i.parentReference.id }
  }
  async liste(mappeId: string) {
    await this.klar
    const ut: FilElement[] = []
    let neste: string | undefined = `${this.drive}/items/${mappeId}/children?$top=200&$select=id,name,folder,file,size,lastModifiedDateTime`
    while (neste && ut.length < 1000) {
      const side: { value: (DriveItem & { size?: number })[]; '@odata.nextLink'?: string } = await graphJson(neste)
      ut.push(...side.value.map((i) => ({ id: i.id, navn: i.name, mappe: !!i.folder, endret: i.lastModifiedDateTime, storrelse: i.size })))
      neste = side['@odata.nextLink']
    }
    return ut
  }
  async sok(tekst: string) {
    await this.klar
    const q = tekst.replace(/'/g, "''")
    const svar = await graphJson<{ value: (DriveItem & { size?: number })[] }>(`${this.drive}/root/search(q='${encodeURIComponent(q)}')?$top=100`)
    return svar.value
      .filter((i) => !i.folder)
      .map((i) => ({ id: i.id, navn: i.name, mappe: false, endret: i.lastModifiedDateTime, storrelse: i.size, sted: decodeURIComponent(i.parentReference.path?.split('root:')[1] ?? '').replace(/^\//, '') || 'Dokumenter' }))
  }
  async hent(id: string) {
    await this.klar
    const r = await graph(`${this.drive}/items/${id}/content`)
    if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
    return r.arrayBuffer()
  }
  async lagre(mappeId: string, navn: string, data: ArrayBuffer) {
    await this.klar
    const i = await graphJson<DriveItem>(`${this.drive}/items/${mappeId}:/${encodeURIComponent(navn)}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    })
    return i.name
  }
}
