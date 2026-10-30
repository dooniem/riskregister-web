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

const PAAKREVD: ListeNavn[] = ['risker', 'tiltak', 'innstillinger']
const VALGFRI: ListeNavn[] = ['tilstede', 'snapshots', 'snapshotdata']

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
      const sti = deler[0] === 'sites' || deler[0] === 'teams' ? '/' + deler.slice(0, 2).map(encodeURIComponent).join('/') : ''
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
  const r = await graphJson<{ value: { id: string; displayName: string; webUrl: string }[] }>(`/sites?search=${encodeURIComponent(tekst || '*')}&$select=id,displayName,webUrl&$top=30`)
  return r.value.filter((s) => s.displayName).map((s) => ({ id: s.id, navn: s.displayName, webUrl: s.webUrl }))
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

  private constructor(omraade: Omraade, lister: Partial<Record<ListeNavn, GraphListe>>) {
    this.omraade = omraade
    this.lister = lister
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
      const l = alle.find((x) => x.displayName.toLowerCase() === LISTER[navn].visningsnavn.toLowerCase())
      if (l) lister[navn] = l
    }
    return lister
  }

  // Åpner registeret på et område. Lister som kom til i senere versjoner av appen, lages hvis brukeren har lov.
  static async aapne(ref: string): Promise<GraphLister> {
    const omraade = await finnOmraade(ref)
    const lister = GraphLister.finn(await hentLister(omraade.id))
    const mangler = PAAKREVD.filter((n) => !lister[n])
    if (mangler.length === PAAKREVD.length) throw new Error(`Området «${omraade.navn}» har ikke noe riskregister ennå. Bruk «Sett opp riskregister på et område» på startsiden.`)
    if (mangler.length) throw new Error(`Riskregisteret på «${omraade.navn}» mangler listene ${mangler.map((n) => `«${LISTER[n].visningsnavn}»`).join(', ')}.`)
    for (const n of VALGFRI) if (!lister[n]) lister[n] = await opprettListe(omraade.id, n).catch(() => undefined)
    return new GraphLister(omraade, lister)
  }

  // Lager listene for et nytt register. Det kan bare være ett register per område.
  static async opprett(ref: string): Promise<GraphLister> {
    const omraade = await finnOmraade(ref)
    const lister = GraphLister.finn(await hentLister(omraade.id))
    if (lister.risker) throw new Error(`Området «${omraade.navn}» har allerede et riskregister. Det kan bare være ett register per område.`)
    for (const n of Object.keys(LISTER) as ListeNavn[]) lister[n] ??= await opprettListe(omraade.id, n)
    return new GraphLister(omraade, lister)
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
    const kall: BatchKall[] = endringer.map((e) => {
      const sti = this.sti(e.liste)
      if (e.type === 'ny') return { method: 'POST', url: `${sti}/items`, body: { fields: e.felt } }
      if (e.type === 'endre') return { method: 'PATCH', url: `${sti}/items/${e.id}/fields`, body: e.felt, headers: e.etag ? { 'If-Match': e.etag } : undefined }
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
export function omraadeLenke(webUrl: string) {
  return `${appUrl()}?site=${encodeURIComponent(webUrl)}`
}
