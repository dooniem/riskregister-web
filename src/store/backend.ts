import type { Register } from '../model'
import type { Bruker } from '../ops'

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

export type LagreSvar = { ok: true; etag: string } | { ok: false; konflikt: true }

export interface Backend {
  readonly type: 'demo' | 'sharepoint'
  readonly bruker: Bruker
  readonly tittel: string // vises i toppen, f.eks. mappesti
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
  // Lokasjonen registeret ligger på (for å oppdage kopier)
  hjem?(): { driveId: string; itemId: string } | undefined
}

export const FARGER = ['#d9480f', '#2b8a3e', '#1971c2', '#ae3ec9', '#e8590c', '#0c8599', '#c2255c', '#5f3dc4', '#66a80f', '#f08c00']

export function fargeFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return FARGER[h % FARGER.length]
}

export const TILSTEDE_UTLOP_MS = 25_000
