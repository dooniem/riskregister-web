// Hvile: hjelpefunksjoner for å sette risker til å hvile til en dato eller en fase
import type { Hvile, Register } from './model'
import { hvileStatus, iDag } from './model'

// Valget i dialogen før det blir en Hvile: til en dato eller til prosjektet når en fase
export interface HvileValg {
  type: 'dato' | 'fase'
  til: string
  fase: string
}

export const omMnd = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('sv-SE')
}

// Neste fase i listen er det mest sannsynlige valget
export function standardHvile(doc: Register): HvileValg {
  const f = doc.lister.faser
  return { type: 'dato', til: omMnd(3), fase: f[f.indexOf(doc.prosjekt.fase) + 1] ?? f.find((x) => x !== doc.prosjekt.fase) ?? '' }
}

// Feilmelding, eller tom når valget kan brukes. «kommendeFase» er fasen prosjektet byttes til i Bytt fase.
export function sjekkHvile(doc: Register, v: HvileValg, kommendeFase?: string): string {
  if (v.type === 'dato') return /^\d{4}-\d{2}-\d{2}$/.test(v.til) && v.til > iDag() ? '' : 'Velg en dato etter i dag.'
  const f = v.fase.trim()
  if (!f) return 'Velg fasen risken skal våkne i.'
  if (f === (kommendeFase ?? doc.prosjekt.fase)) return `Prosjektet er ${kommendeFase ? 'da' : 'allerede'} i fasen «${f}», så risken ville våknet med en gang.`
  return ''
}

export function tilHvile(v: HvileValg): Hvile {
  return v.type === 'dato' ? { til: v.til, satt: new Date().toISOString() } : { fase: v.fase.trim(), satt: new Date().toISOString() }
}

// Faser risker venter på som prosjektet trolig aldri kommer til: de står ikke i fase-listen, eller kommer før fasen prosjektet er i nå
export function usikreFaser(doc: Register): string[] {
  const f = doc.lister.faser
  const naa = f.indexOf(doc.prosjekt.fase)
  const ut = new Set<string>()
  for (const r of doc.risker) {
    const h = doc.hviler?.[r.id]
    if (!h?.fase || hvileStatus(doc, r) !== 'hviler') continue
    const i = f.indexOf(h.fase)
    if (i < 0 || (naa >= 0 && i < naa)) ut.add(h.fase)
  }
  return [...ut]
}

