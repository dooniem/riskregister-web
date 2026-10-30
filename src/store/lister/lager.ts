// Felles grensesnitt for lister: SharePoint-lister via Graph, eller liksomlister i nettleseren i demomodus.
// Resten av appen bruker bare dette, så demo og SharePoint går gjennom nøyaktig samme kode for lagring.
import type { Felt, ListeNavn } from './skjema'

export interface Element {
  id: string // radens id i listen
  etag: string
  felt: Record<string, unknown>
  opprettet?: string
  opprettetAv?: string
  endret?: string
  endretAv?: string
}

export type Endring =
  | { type: 'ny'; liste: ListeNavn; felt: Felt }
  // Med etag lagres endringen bare hvis raden ikke er endret av andre siden den ble hentet
  | { type: 'endre'; liste: ListeNavn; id: string; etag?: string; felt: Felt }
  | { type: 'slett'; liste: ListeNavn; id: string }

export type Resultat = { ok: true; element?: Element; etag?: string } | { ok: false; konflikt: true } | { ok: false; konflikt: false; feil: Error }

export interface ListeLager {
  readonly type: 'demo' | 'sharepoint'
  readonly tittel: string // navnet på området
  readonly webUrl?: string // området i SharePoint
  // Billig sjekk av om noe er endret i listene. Endres når en rad legges til, endres eller slettes.
  sistEndret(lister: ListeNavn[]): Promise<string>
  hentAlle(liste: ListeNavn, filter?: { kolonne: string; verdi: string }): Promise<Element[]>
  skriv(endringer: Endring[]): Promise<Resultat[]>
  // Om listen finnes (eldre registre kan mangle listene for snapshots)
  har(liste: ListeNavn): boolean
  // Sletter en rad mens siden lukkes (tilstedeværelse)
  slettVedLukk(liste: ListeNavn, id: string): void
  // Adressen til listen i SharePoint, for lenker i rådatavisningen
  listeUrl?(liste: ListeNavn): string | undefined
  // Beskjed om at noe er endret, slik at klienten kan hente med en gang
  lytt?(cb: () => void): () => void
}
