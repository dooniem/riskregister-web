// Søk etter personer i organisasjonen, så deltakere kan kobles til ekte brukere.
// SharePoint: Microsoft Graph /users (delegert User.ReadBasic.All). Demo: en oppdiktet organisasjon.
import { tokenFor } from './auth'
import { GRAPH, feilmelding } from './graph'
import { demoEpost } from '../model'

export interface Person {
  navn: string
  epost: string
  stilling?: string
}

export interface Katalog {
  sok(tekst: string): Promise<Person[]>
  // Ber brukeren om samtykke til søket (popupvindu). Kalles fra et klikk.
  samtykke?(): Promise<void>
}

const SCOPE = ['User.ReadBasic.All']

export class GraphKatalog implements Katalog {
  async samtykke() {
    await tokenFor(SCOPE, true)
  }

  async sok(tekst: string): Promise<Person[]> {
    const t = tekst.replace(/["\\]/g, '').trim()
    if (!t) return []
    const sok = encodeURIComponent(`"displayName:${t}" OR "mail:${t}"`)
    const r = await fetch(`${GRAPH}/users?$search=${sok}&$select=displayName,mail,userPrincipalName,jobTitle&$top=15`, {
      headers: { Authorization: `Bearer ${await tokenFor(SCOPE)}`, ConsistencyLevel: 'eventual' },
    })
    if (r.status === 403) throw new Error('Søk i organisasjonen krever tillatelsen User.ReadBasic.All i appregistreringen.')
    if (!r.ok) throw new Error(feilmelding(r.status))
    const j = (await r.json()) as { value: { displayName?: string; mail?: string; userPrincipalName?: string; jobTitle?: string }[] }
    return j.value.filter((u) => u.displayName).map((u) => ({ navn: u.displayName!, epost: u.mail || u.userPrincipalName || '', stilling: u.jobTitle || undefined }))
  }
}

// Oppdiktet organisasjon for demoen. De sju første er deltakere i eksempelregisteret.
const DEMO: [string, string][] = [
  ['Kari Nordmann', 'Prosjektsjef'],
  ['Ola Hansen', 'Prosjektleder'],
  ['Ingrid Berg', 'Prosjekteringsleder'],
  ['Per Larsen', 'Innkjøper'],
  ['Siri Moe', 'HMS-leder'],
  ['Anders Johansen', 'Prosjektøkonom'],
  ['Tone Solberg', 'Arbeidsleder'],
  ['Lars Bakken', 'Anleggsleder'],
  ['Marte Lie', 'Kvalitetsleder'],
  ['Jonas Haugen', 'Prosjekteringsleder'],
  ['Emma Strand', 'Kontraktsjef'],
  ['Henrik Dahl', 'Bas'],
  ['Nora Eide', 'Miljørådgiver'],
  ['Erik Lund', 'Prosjektingeniør'],
  ['Ida Pedersen', 'Prosjektingeniør'],
  ['Mats Aas', 'Byggeleder'],
  ['Hanne Berg', 'Controller'],
]

export const DEMO_PERSONER: Person[] = DEMO.map(([navn, stilling]) => ({ navn, epost: demoEpost(navn), stilling }))

export class DemoKatalog implements Katalog {
  async sok(tekst: string): Promise<Person[]> {
    const t = tekst.trim().toLowerCase()
    if (!t) return []
    await new Promise((r) => setTimeout(r, 150))
    return DEMO_PERSONER.filter((p) => p.navn.toLowerCase().split(/\s+/).some((d) => d.startsWith(t)) || p.navn.toLowerCase().startsWith(t) || p.epost.startsWith(t))
  }
}

// Finner personen i organisasjonen med nøyaktig samme navn (uten hensyn til store/små bokstaver).
// Brukes ved import fra Excel. Gir null når det er ingen eller flere treff.
export async function finnPerson(katalog: Katalog, navn: string): Promise<{ person: Person | null; flere: boolean }> {
  const n = navn.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return { person: null, flere: false }
  const treff = (await katalog.sok(navn.trim())).filter((p) => p.navn.toLowerCase().replace(/\s+/g, ' ') === n)
  return { person: treff.length === 1 ? treff[0] : null, flere: treff.length > 1 }
}
