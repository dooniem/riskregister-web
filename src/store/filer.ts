// Filer i SharePoint (eller en liksom-SharePoint i demomodus) for import og eksport av Excel-filer.
// Nettleserens egen fildialog kan ikke åpnes i en bestemt SharePoint-mappe, så appen viser mappen selv via Graph.
import { eksempelRegister } from '../eksempel'
import { lagExcelBok } from '../excel'
import type { Register, Risk } from '../model'
import { uid } from '../model'
import * as XLSX from 'xlsx'

export interface FilElement {
  id: string
  navn: string
  mappe: boolean
  endret?: string
  storrelse?: number
  sted?: string // mappen filen ligger i, vises i søkeresultater
}

export interface FilMappe {
  id: string
  navn: string
  forelder?: string // id, mangler i roten av biblioteket
}

export interface FilKilde {
  readonly navn: string // vises øverst i velgeren
  readonly demo?: boolean
  start(): Promise<FilMappe>
  mappe(id: string): Promise<FilMappe>
  liste(mappeId: string): Promise<FilElement[]>
  sok(tekst: string): Promise<FilElement[]>
  hent(id: string): Promise<ArrayBuffer>
  // Lagrer filen i mappen. Finnes navnet fra før, får den nye filen et ledig navn. Returnerer navnet som ble brukt.
  lagre(mappeId: string, navn: string, data: ArrayBuffer): Promise<string>
}

export const erExcel = (navn: string) => /\.xls[xm]$/i.test(navn)

// ---- Demo ----
// En liten mappestruktur i minnet, slik den kunne sett ut på et prosjektområde. Filene lages fra registeret som er åpent,
// slik at importen kan vise både nye risker og risker som finnes fra før. Alt forsvinner når siden lastes på nytt.

interface DemoNode {
  id: string
  navn: string
  forelder?: string
  mappe: boolean
  data?: ArrayBuffer
  endret: string
}

const noder = new Map<string, DemoNode>()
let registerMappe = ''

const dagerSiden = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

function node(navn: string, forelder: string | undefined, mappe: boolean, data?: ArrayBuffer, endret = dagerSiden(1)) {
  const n: DemoNode = { id: uid(), navn, forelder, mappe, data, endret }
  noder.set(n.id, n)
  return n.id
}

const bok = (reg: Register) => XLSX.write(lagExcelBok(reg), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

const nyRisk = (r: Partial<Risk> & Pick<Risk, 'aarsak' | 'hendelse'>): Risk => ({
  id: uid(), nr: 0, rm: 'R', konsekvenser: '', eier: '', status: 'Åpen', kategori: 'UE', egendef: '', sannsynlighet: 3, konsekvens: 3,
  bc: 0, ml: 0, wc: 0, tilSkarisk: false, tiltak: [], ...r,
})

// Et delregister som en underentreprenør har fylt ut: to risker fra hovedregisteret (som de fikk med) og tre nye
function delregister(hoved: Register, firma: string, nye: Risk[]): ArrayBuffer {
  const reg: Register = structuredClone(hoved)
  reg.prosjekt = { ...reg.prosjekt, notering: `Delregister fylt ut av ${firma}` }
  reg.deltakere = [{ id: uid(), initialer: firma.slice(0, 2).toUpperCase(), navn: `Kontaktperson ${firma}`, rolleProsjekt: 'Kompetanseressurs', rolleRisk: 'Tiltakseier' }]
  reg.gjennomganger = []
  const fraHoved = hoved.risker.filter((r) => r.status !== 'Lukket').slice(0, 2)
  const maks = hoved.risker.reduce((m, r) => Math.max(m, r.nr), 0)
  reg.risker = [...fraHoved, ...nye.map((r, i) => ({ ...r, nr: maks + i + 1 }))]
  return bok(reg)
}

function byggDemo(doc: Register) {
  noder.clear()
  const rot = node('Dokumenter', undefined, true)
  registerMappe = node('Riskregister', rot, true)
  node('register.json', registerMappe, false, new ArrayBuffer(0), dagerSiden(0))
  node('Åpne Riskregister.url', registerMappe, false, new ArrayBuffer(0), dagerSiden(30))
  node('_historikk', registerMappe, true)
  const ue = node('Risikovurderinger fra UE', rot, true)
  const t = (tekst: string, eier: string) => [{ id: uid(), tekst, eier, frist: '', beskrivelse: '', status: 'Ikke startet' }]
  node('Delregister grunnarbeider – Grunn og Graving AS.xlsx', ue, false, delregister(doc, 'Grunn og Graving AS', [
    nyRisk({ aarsak: 'Høy grunnvannstand i byggegropen', hendelse: 'Behov for større lensepumper og avskjærende drenering', konsekvenser: 'Merkostnad og forsinket utgraving', sannsynlighet: 3, konsekvens: 3, tiltak: t('Mål grunnvannstand ukentlig fra oppstart', 'Grunn og Graving AS') }),
    nyRisk({ aarsak: 'Ukjente kabler og rør i grunnen', hendelse: 'Graveskade på eksisterende infrastruktur', konsekvenser: 'Stans i arbeidet, krav fra netteier', sannsynlighet: 2, konsekvens: 4, tiltak: t('Bestill påvisning før graving', 'Grunn og Graving AS') }),
    nyRisk({ rm: 'M', aarsak: 'Overskuddsmasser kan brukes på nabotomt', hendelse: 'Redusert massetransport', konsekvenser: 'Lavere kostnad og utslipp', sannsynlighet: 3, konsekvens: 2, tiltak: t('Avklare med nabo og kommune', 'Ola Hansen') }),
  ]), dagerSiden(2))
  node('Delregister elektro – Lys og Kraft AS.xlsx', ue, false, delregister(doc, 'Lys og Kraft AS', [
    nyRisk({ aarsak: 'Lang leveringstid på hovedtavle', hendelse: 'Tavla kommer etter planlagt montasjestart', konsekvenser: 'Forsinket idriftsettelse', sannsynlighet: 4, konsekvens: 3, tiltak: t('Bestill tavle før detaljprosjektering er ferdig', 'Lys og Kraft AS') }),
  ]), dagerSiden(5))
  const gammel = eksempelRegister('Nytt kontorbygg')
  node('Riskregister beta26 – Nytt kontorbygg.xlsx', rot, false, bok(gammel), dagerSiden(60))
  node('Møtereferater', rot, true)
}

export class DemoFiler implements FilKilde {
  readonly navn = 'Demo av SharePoint-mappe'
  readonly demo = true
  constructor(doc?: Register) {
    if (!noder.size) byggDemo(doc ?? eksempelRegister())
  }
  private finn(id: string) {
    const n = noder.get(id)
    if (!n) throw new Error('Fant ikke filen.')
    return n
  }
  async start() {
    return this.mappe(registerMappe)
  }
  async mappe(id: string) {
    const n = this.finn(id)
    return { id: n.id, navn: n.navn, forelder: n.forelder }
  }
  async liste(mappeId: string) {
    return [...noder.values()].filter((n) => n.forelder === mappeId).map((n) => this.element(n))
  }
  async sok(tekst: string) {
    const q = tekst.toLowerCase()
    return [...noder.values()].filter((n) => !n.mappe && n.navn.toLowerCase().includes(q)).map((n) => ({ ...this.element(n), sted: noder.get(n.forelder ?? '')?.navn }))
  }
  async hent(id: string) {
    const n = this.finn(id)
    if (!n.data) throw new Error('Filen er tom.')
    return n.data
  }
  async lagre(mappeId: string, navn: string, data: ArrayBuffer) {
    const brukt = new Set([...noder.values()].filter((n) => n.forelder === mappeId).map((n) => n.navn.toLowerCase()))
    let ledig = navn
    for (let i = 1; brukt.has(ledig.toLowerCase()); i++) ledig = navn.replace(/(\.\w+)$/, ` ${i}$1`)
    node(ledig, mappeId, false, data, new Date().toISOString())
    return ledig
  }
  private element(n: DemoNode): FilElement {
    return { id: n.id, navn: n.navn, mappe: n.mappe, endret: n.endret, storrelse: n.data?.byteLength }
  }
}
