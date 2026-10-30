import type { Register, Risk, Tiltak } from '../model'
import type { Bruker } from '../ops'
import type { ListeLager } from './lister/lager'

export interface Versjon {
  doc: Register
  etag: string
}

export interface Tilstede {
  brukerId: string
  navn: string
  farge: string
  riskId?: string // risken brukeren står på
  kolonne?: string
  tiltakId?: string
  laas?: { riskId: string; siden: number } // risken brukeren redigerer
  ts: number
}

// Et snapshot er registeret slik det var på et gitt tidspunkt, til å sammenligne med senere
export interface SnapshotInfo {
  id: string
  navn: string
  tidspunkt: string // ISO-tid
  tattAv: string
  antallRisker: number
  kommentar: string
}

export interface Snapshots {
  liste(): Promise<SnapshotInfo[]>
  ta(navn: string, kommentar: string, doc: Register): Promise<SnapshotInfo>
  hent(id: string): Promise<{ info: SnapshotInfo; doc: Register }>
  slett(id: string): Promise<void>
}

export type LagreSvar = { ok: true; etag: string } | { ok: false; konflikt: true }

// Feil i listene som appen ikke kan rette selv uten at brukeren bestemmer
export interface Avvik {
  // Innstillinger i Klientinnstillinger som ikke kan leses. De vises med standardverdi og skrives ikke over.
  innstillinger: string[]
  // Risker med samme RiskId i flere rader (f.eks. kopiert i SharePoint). Den eldste raden brukes.
  doble: { riskId: string; nr: number; tittel: string; kopier: { radId: string; risk: Risk }[] }[] // kopier: radene som ikke brukes
  // Tiltak som peker på en risk som ikke finnes (slettet i SharePoint)
  forelderlose: { riskId: string; tiltak: Tiltak[] }[]
}

export interface Backend {
  readonly type: 'demo' | 'sharepoint'
  readonly bruker: Bruker
  readonly tittel: string // vises i toppen, f.eks. navnet på SharePoint-området
  readonly webUrl?: string // området i SharePoint
  readonly pollMs: number
  readonly hjerteslagMs: number
  // Endringer som kommer tettere enn dette samles i én lagring
  readonly samleMs?: number
  kanSkrive: boolean
  hent(): Promise<Versjon>
  sjekk(): Promise<string> // gjeldende etag, billig kall
  lagre(doc: Register, hvisEtag: string): Promise<LagreSvar>
  publiserTilstede(t: Tilstede): Promise<void>
  hentTilstede(): Promise<Tilstede[]>
  fjernTilstede(): Promise<void>
  // Beskjed om at noe er endret, slik at klienten kan hente med en gang
  lytt?(cb: () => void): () => void
  // Det som ser feil ut i listene etter redigering direkte i SharePoint
  readonly avvik?: Avvik
  // Listene registeret ligger i (for rådatavisningen)
  readonly lager?: ListeLager
  readonly snapshots?: Snapshots
  // Satt når det som vises er et snapshot og ikke registeret slik det er nå
  readonly snapshot?: SnapshotInfo
}

export const FARGER = ['#d9480f', '#2b8a3e', '#1971c2', '#ae3ec9', '#e8590c', '#0c8599', '#c2255c', '#5f3dc4', '#66a80f', '#f08c00']

export function fargeFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return FARGER[h % FARGER.length]
}

export const TILSTEDE_UTLOP_MS = 25_000
