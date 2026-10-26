// Endringer lagres som små operasjoner. Ved lagring legges de oppå siste versjon
// fra SharePoint, slik at to brukere som endrer ulike risker aldri overskriver hverandre.
import type { Deltaker, Gjennomgang, Hjem, Lister, Prosjekt, Register, Risk, Tiltak } from './model'
import { migrer } from './model'

export type RiskFelt = Exclude<keyof Risk, 'id' | 'nr' | 'tiltak' | 'endret' | 'endretAv'>
export type TiltakFelt = Exclude<keyof Tiltak, 'id'>

export type Op =
  | { t: 'setRisk'; riskId: string; felt: RiskFelt; verdi: unknown; fra: unknown }
  | { t: 'setTiltak'; riskId: string; tiltakId: string; felt: TiltakFelt; verdi: unknown; fra: unknown }
  | { t: 'addRisk'; risk: Risk; beholdNr?: boolean }
  | { t: 'deleteRisk'; riskId: string }
  | { t: 'addTiltak'; riskId: string; tiltak: Tiltak; etter?: string }
  | { t: 'deleteTiltak'; riskId: string; tiltakId: string }
  | { t: 'setProsjekt'; felt: keyof Prosjekt; verdi: string }
  | { t: 'upsertDeltaker'; deltaker: Deltaker }
  | { t: 'deleteDeltaker'; id: string }
  | { t: 'upsertGjennomgang'; gjennomgang: Gjennomgang }
  | { t: 'deleteGjennomgang'; id: string }
  | { t: 'setListe'; key: keyof Lister; verdi: Lister[keyof Lister] }
  | { t: 'setHjem'; hjem: Hjem }
  | { t: 'erstatt'; doc: Register }

export interface Konflikt {
  riskNr: number
  felt: string
  deres: unknown
  min: unknown
}

export interface Bruker {
  id: string
  navn: string
}

function merk(r: Risk, bruker: Bruker) {
  r.endret = new Date().toISOString()
  r.endretAv = bruker.navn
}

// Bruker operasjonen på doc (muterer). Returnerer en konflikt hvis feltet er endret av andre.
// Felt som mangler (eldre registre) regnes som tomme, så de ikke gir falske konflikter
const lik = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')

export function brukOp(doc: Register, op: Op, bruker: Bruker): Konflikt | null {
  switch (op.t) {
    case 'setRisk': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      if (!r) return null
      const naa = r[op.felt]
      const konflikt = !lik(naa, op.fra) && !lik(naa, op.verdi) ? { riskNr: r.nr, felt: op.felt, deres: naa, min: op.verdi } : null
      ;(r as unknown as Record<string, unknown>)[op.felt] = op.verdi
      merk(r, bruker)
      return konflikt
    }
    case 'setTiltak': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      const t = r?.tiltak.find((x) => x.id === op.tiltakId)
      if (!r || !t) return null
      const naa = t[op.felt]
      const konflikt = !lik(naa, op.fra) && !lik(naa, op.verdi) ? { riskNr: r.nr, felt: 'tiltak.' + op.felt, deres: naa, min: op.verdi } : null
      ;(t as unknown as Record<string, unknown>)[op.felt] = op.verdi
      merk(r, bruker)
      return konflikt
    }
    case 'addRisk': {
      if (doc.risker.some((x) => x.id === op.risk.id)) return null
      const risk = structuredClone(op.risk)
      const neste = Math.max(doc.nesteNr ?? 1, doc.risker.reduce((m, x) => Math.max(m, x.nr), 0) + 1)
      if (!op.beholdNr || doc.risker.some((x) => x.nr === risk.nr)) risk.nr = neste
      doc.nesteNr = Math.max(neste, risk.nr + 1)
      merk(risk, bruker)
      doc.risker.push(risk)
      return null
    }
    case 'deleteRisk':
      doc.risker = doc.risker.filter((x) => x.id !== op.riskId)
      return null
    case 'addTiltak': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      if (!r || r.tiltak.some((x) => x.id === op.tiltak.id)) return null
      const i = op.etter ? r.tiltak.findIndex((x) => x.id === op.etter) : -1
      r.tiltak.splice(i >= 0 ? i + 1 : r.tiltak.length, 0, structuredClone(op.tiltak))
      merk(r, bruker)
      return null
    }
    case 'deleteTiltak': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      if (!r) return null
      r.tiltak = r.tiltak.filter((x) => x.id !== op.tiltakId)
      merk(r, bruker)
      return null
    }
    case 'setProsjekt':
      doc.prosjekt[op.felt] = op.verdi
      return null
    case 'upsertDeltaker': {
      const i = doc.deltakere.findIndex((x) => x.id === op.deltaker.id)
      if (i >= 0) doc.deltakere[i] = { ...op.deltaker }
      else doc.deltakere.push({ ...op.deltaker })
      return null
    }
    case 'deleteDeltaker':
      doc.deltakere = doc.deltakere.filter((x) => x.id !== op.id)
      return null
    case 'upsertGjennomgang': {
      const i = doc.gjennomganger.findIndex((x) => x.id === op.gjennomgang.id)
      if (i >= 0) doc.gjennomganger[i] = { ...op.gjennomgang }
      else doc.gjennomganger.push({ ...op.gjennomgang })
      return null
    }
    case 'deleteGjennomgang':
      doc.gjennomganger = doc.gjennomganger.filter((x) => x.id !== op.id)
      return null
    case 'setListe':
      ;(doc.lister as unknown as Record<string, unknown>)[op.key] = op.verdi
      return null
    case 'setHjem':
      doc.hjem = op.hjem
      return null
    case 'erstatt': {
      const ny = migrer(op.doc)
      Object.assign(doc, ny)
      return null
    }
  }
}

export function brukAlle(base: Register, ops: Op[], bruker: Bruker): { doc: Register; konflikter: Konflikt[] } {
  const doc = structuredClone(base)
  const konflikter: Konflikt[] = []
  for (const op of ops) {
    const k = brukOp(doc, op, bruker)
    if (k) konflikter.push(k)
  }
  return { doc, konflikter }
}
