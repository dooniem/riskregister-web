// Import fra eksisterende Riskregister-XLSM og eksport til Excel.
import * as XLSX from 'xlsx'
import type { Deltaker, Register, Risk, Tiltak } from './model'
import { DEFAULT_LISTER, FAG_FARGER, SANNSYNLIGHET, fv, kortFag, nyttRegister, uid } from './model'

const RAD_START = 7 // første datarad i arket (1-basert), som i VBA-koden

type Ark = XLSX.WorkSheet

function celle(ws: Ark, r: number, c: number): unknown {
  return ws[XLSX.utils.encode_cell({ r, c })]?.v
}
function tekst(ws: Ark, r: number, c: number): string {
  const v = celle(ws, r, c)
  if (v == null) return ''
  const s = String(v).trim()
  return s === '-' ? '' : s
}
function tall(ws: Ark, r: number, c: number): number {
  const v = celle(ws, r, c)
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const kol = (bokstav: string) => XLSX.utils.decode_col(bokstav)

function dato(ws: Ark, r: number, c: number): string {
  const v = celle(ws, r, c)
  if (typeof v === 'number' && v > 20000) {
    const d = XLSX.SSF.parse_date_code(v)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

function kolonneListe(ws: Ark | undefined, bokstav: string, fjernPrefiks = false): string[] {
  if (!ws) return []
  const c = kol(bokstav)
  const ut: string[] = []
  for (let r = 1; r < 400; r++) {
    const v = tekst(ws, r, c)
    if (!v) {
      if (r > 3 && !tekst(ws, r + 1, c)) break
      continue
    }
    ut.push(fjernPrefiks ? v.replace(/^\d+-/, '') || 'Ikke startet' : v)
  }
  return [...new Set(ut)]
}

// Leser risker fra arket «Riskregister» eller «Riskregister - Lukket». En risk går over flere rader
// (sammenslåtte celler i kolonne C), og hver rad kan ha ett tiltak i kolonne S–W.
function lesRisker(ws: Ark, lukket: boolean): Risk[] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const C = kol('C')
  const merges = ws['!merges'] ?? []
  const risker: Risk[] = []
  let r = RAD_START - 1
  while (r <= range.e.r) {
    const nr = celle(ws, r, C)
    if (nr === undefined || nr === null || nr === '') {
      r++
      continue
    }
    const m = merges.find((x) => x.s.c === C && x.s.r === r)
    let slutt = m ? m.e.r : r
    if (!m) while (slutt + 1 <= range.e.r && (celle(ws, slutt + 1, C) ?? '') === '' && tekst(ws, slutt + 1, kol('S'))) slutt++
    const tiltak: Tiltak[] = []
    for (let i = r; i <= slutt; i++) {
      const t: Tiltak = {
        id: uid(),
        tekst: tekst(ws, i, kol('S')),
        eier: tekst(ws, i, kol('T')),
        frist: dato(ws, i, kol('U')),
        beskrivelse: tekst(ws, i, kol('V')),
        // Excel-listen har nummerprefiks («2-Pågår»), og «1-» betyr ikke startet
        status: tekst(ws, i, kol('W')).replace(/^\d+-$/, 'Ikke startet').replace(/^\d+-/, ''),
      }
      if (t.tekst || t.eier || t.frist || t.beskrivelse || t.status) tiltak.push(t)
    }
    const rm = tekst(ws, r, kol('D')).toUpperCase()
    const status = tekst(ws, r, kol('I')) || (lukket ? 'Lukket' : 'Åpen')
    const tom = !tekst(ws, r, kol('E')) && !tekst(ws, r, kol('F')) && !tekst(ws, r, kol('G')) && !tiltak.length
    if (tom) {
      r = slutt + 1
      continue
    }
    risker.push({
      id: uid(),
      nr: Number(nr) || risker.length + 1,
      rm: rm === 'R' || rm === 'M' ? rm : '-',
      aarsak: tekst(ws, r, kol('E')),
      hendelse: tekst(ws, r, kol('F')),
      konsekvenser: tekst(ws, r, kol('G')),
      eier: tekst(ws, r, kol('H')),
      status: lukket ? 'Lukket' : status === 'Lukket' ? 'Lukket' : 'Åpen',
      kategori: tekst(ws, r, kol('J')),
      egendef: tekst(ws, r, kol('K')),
      sannsynlighet: parseInt(tekst(ws, r, kol('L')), 10) || 0,
      konsekvens: parseInt(tekst(ws, r, kol('M')), 10) || 0,
      bc: tall(ws, r, kol('O')),
      ml: tall(ws, r, kol('P')),
      wc: tall(ws, r, kol('Q')),
      tilSkarisk: tall(ws, r, kol('X')) === 1,
      tiltak,
      ...webKolonner(ws, r),
    })
    r = slutt + 1
  }
  return risker
}

// Kolonner webappen selv legger til i eksporten (egendefinert 2 og fag), funnet ut fra overskriften på rad 5
function webKolonne(ws: Ark, overskrift: (s: string) => boolean): number {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let c = kol('AD'); c <= range.e.c; c++) if (overskrift(tekst(ws, 4, c))) return c
  return -1
}
let webKol = { egendef2: -1, fag: -1 }
function webKolonner(ws: Ark, r: number): Partial<Risk> {
  const ut: Partial<Risk> = {}
  if (webKol.egendef2 >= 0) ut.egendef2 = tekst(ws, r, webKol.egendef2)
  if (webKol.fag >= 0) ut.fag = tekst(ws, r, webKol.fag) // fagnavn, gjøres om til id etter innlesing
  return ut
}

// Finner verdien til høyre for en ledetekst, f.eks. «Prosjektnummer :» i Deltagere-arket
function etterLedetekst(ws: Ark | undefined, ledetekst: string): string {
  if (!ws) return ''
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let r = 0; r <= Math.min(range.e.r, 30); r++)
    for (let c = 0; c <= Math.min(range.e.c, 12); c++) {
      if (tekst(ws, r, c).toLowerCase().startsWith(ledetekst.toLowerCase())) {
        for (let c2 = c + 1; c2 <= c + 8; c2++) {
          const v = tekst(ws, r, c2)
          if (v) return v
        }
        return ''
      }
    }
  return ''
}

export async function importerExcel(fil: File): Promise<Register> {
  const wb = XLSX.read(await fil.arrayBuffer(), { type: 'array', cellDates: false })
  const hoved = wb.Sheets['Riskregister']
  if (!hoved) throw new Error('Fant ikke arkfanen «Riskregister». Er dette en Riskregister-fil?')
  const reg = nyttRegister()
  const data = wb.Sheets['data']
  const del = wb.Sheets['Deltagere']

  if (data) {
    const l = reg.lister
    const kat = kolonneListe(data, 'K').filter((x) => x !== 'Kategorier')
    l.kategorier = kat.length ? kat : DEFAULT_LISTER.kategorier
    const st = kolonneListe(data, 'P', true).filter((x) => x !== 'Status tiltak')
    if (st.length) l.statusTiltak = st
    const rp = kolonneListe(data, 'U').filter((x) => x !== 'Rolle i prosjektet')
    if (rp.length) l.rollerProsjekt = rp
    const rr = kolonneListe(data, 'W').filter((x) => x !== 'Rolle i Riskgjennomgang')
    if (rr.length) l.rollerRisk = rr
    const f = kolonneListe(data, 'Y').filter((x) => x !== 'Prosjektfase')
    if (f.length) l.faser = f
    const v = kolonneListe(data, 'H').filter((x) => x !== 'Virksomhet')
    if (v.length) l.virksomhet = v
    // Første rad i AA er overskriften, navnet på kolonnen står i Riskregister!K5
    const e = kolonneListe(data, 'AA')
    if (e.length) l.egendef = e
  }
  const egendefHeader = tekst(hoved, 4, kol('K'))
  if (egendefHeader) reg.lister.egendefNavn = egendefHeader

  if (del) {
    reg.prosjekt = {
      nummer: etterLedetekst(del, 'Prosjektnummer'),
      navn: etterLedetekst(del, 'Prosjektnavn'),
      eier: etterLedetekst(del, 'Prosjekteier'),
      sjef: etterLedetekst(del, 'Prosjektsjef'),
      leder: etterLedetekst(del, 'Prosjektleder'),
      fase: etterLedetekst(del, 'Prosjektfase'),
      virksomhet: etterLedetekst(del, 'Virksomhetsområde'),
      notering: tekst(del, 7, kol('J')),
    }
    const range = XLSX.utils.decode_range(del['!ref'] ?? 'A1')
    const deltakere: Deltaker[] = []
    for (let r = 17; r <= range.e.r; r++) {
      const navn = tekst(del, r, kol('E'))
      if (navn)
        deltakere.push({ id: uid(), initialer: tekst(del, r, kol('D')), navn, rolleProsjekt: tekst(del, r, kol('J')), rolleRisk: tekst(del, r, kol('L')) })
      const d = dato(del, r, kol('O'))
      const sign = tekst(del, r, kol('P'))
      if (d || sign) reg.gjennomganger.push({ id: uid(), dato: d, signatur: sign, fasilitator: tekst(del, r, kol('R')) })
    }
    reg.deltakere = deltakere
  }

  const ac2 = tekst(hoved, 1, kol('AC'))
  const ac3 = tekst(hoved, 2, kol('AC'))
  if (ac2 || ac3) reg.excelNokkel = { ac2, ac3 }

  const lukketArk = wb.Sheets['Riskregister - Lukket']
  const egendef2Kol = webKolonne(hoved, (s) => !!s && s !== 'Fag' && !/status|eksponering/i.test(s))
  webKol = { egendef2: egendef2Kol, fag: webKolonne(hoved, (s) => s === 'Fag') }
  const aapne = lesRisker(hoved, false)
  if (lukketArk) webKol = { egendef2: egendef2Kol >= 0 ? webKolonne(lukketArk, (s) => s === tekst(hoved, 4, egendef2Kol)) : -1, fag: webKolonne(lukketArk, (s) => s === 'Fag') }
  const lukkede = lukketArk ? lesRisker(lukketArk, true) : []
  webKol = { egendef2: -1, fag: -1 }
  reg.risker = [...aapne, ...lukkede]
  if (egendef2Kol >= 0) {
    reg.lister.egendef2Aktiv = true
    reg.lister.egendef2Navn = tekst(hoved, 4, egendef2Kol)
    reg.lister.egendef2 = [...new Set(reg.risker.map((r) => r.egendef2 ?? '').filter(Boolean))]
  }
  // Fag kommer inn som navn. Lag faget hvis det ikke finnes, og bytt navnet ut med id.
  for (const r of reg.risker) {
    if (!r.fag) continue
    let f = reg.lister.fag.find((x) => x.navn.toLowerCase() === r.fag!.toLowerCase())
    if (!f) {
      f = { id: uid(), navn: r.fag, kort: kortFag(r.fag), farge: reg.lister.fag.length % FAG_FARGER.length }
      reg.lister.fag.push(f)
    }
    r.fag = f.id
  }
  // Sikre unike numre
  const brukt = new Set<number>()
  let maks = reg.risker.reduce((m, r) => Math.max(m, r.nr), 0)
  for (const r of reg.risker) {
    if (brukt.has(r.nr)) r.nr = ++maks
    brukt.add(r.nr)
  }
  if (!reg.prosjekt.navn) reg.prosjekt.navn = fil.name.replace(/\.xls[xm]?$/i, '')
  return reg
}

// ---- Eksport ----
// Eksporten har samme oppsett som originalen (Riskregister beta26): overskrifter på rad 5–6, data fra rad 7,
// samme kolonner, samme ledetekster i Deltagere og samme lister i data. Da kan filen hentes inn i Excel-registeret
// med Oppgrader-knappen (frmImport.cmdUpgrade), som finner kolonnene ut fra overskriftene og cellene ut fra ledetekstene.

// Verdiene i nedtrekkslistene i data-arket. Sannsynlighet og konsekvens bruker samme liste (data!A).
const STATUS_TILTAK_EXCEL: Record<string, string> = { 'Ikke startet': '1-', Pågår: '2-Pågår', Utført: '3-Utført', 'Utføres ikke': '3-Utføres ikke' }
const statusTiltakExcel = (reg: Register, s: string) => {
  if (!s) return ''
  if (STATUS_TILTAK_EXCEL[s]) return STATUS_TILTAK_EXCEL[s]
  const i = reg.lister.statusTiltak.indexOf(s)
  return i >= 0 ? `${i + 1}-${s}` : s
}
const nivaa = (n: number) => (n >= 1 && n <= 5 ? SANNSYNLIGHET[n - 1] : '-')
const strek = (s: string | undefined) => s || '-'

// Excel-dato som serienummer, så Excel viser den som dato
function excelDato(iso: string): number | string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000
}

// Liten hjelper for å bygge et ark celle for celle med Excel-adresser
function nyttArk() {
  const ws: Ark = {}
  const merges: XLSX.Range[] = []
  let maks = { r: 0, c: 0 }
  const sett = (adr: string, v: unknown, dato = false) => {
    if (v === undefined || v === null || v === '') return
    const p = XLSX.utils.decode_cell(adr)
    maks = { r: Math.max(maks.r, p.r), c: Math.max(maks.c, p.c) }
    if (dato && typeof v === 'number') ws[adr] = { t: 'n', v, z: 'dd.mm.yyyy' }
    else ws[adr] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) }
  }
  const flett = (omr: string) => {
    const m = XLSX.utils.decode_range(omr)
    if (m.s.r !== m.e.r || m.s.c !== m.e.c) merges.push(m)
    maks = { r: Math.max(maks.r, m.e.r), c: Math.max(maks.c, m.e.c) }
  }
  const ferdig = () => {
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: maks })
    ws['!merges'] = merges
    return ws
  }
  return { ws, sett, flett, ferdig }
}

// Kolonnene i Riskregister-arket, som i originalen
const RK = { nr: 'C', rm: 'D', aarsak: 'E', hendelse: 'F', konsekvenser: 'G', eier: 'H', status: 'I', kategori: 'J', egendef: 'K', sanns: 'L', kons: 'M', ekspo: 'N', bc: 'O', ml: 'P', wc: 'Q', fv: 'R', tiltak: 'S', teier: 'T', frist: 'U', tbeskr: 'V', tstatus: 'W', skarisk: 'X', unikId: 'AC' }
// Kolonner som bare finnes på web. Oppgrader i Excel ser bort fra dem, men webappen leser dem inn igjen.
const WEB_KOL = { egendef2: 'AH', fag: 'AI' }
const RISK_KOLONNER = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'X', 'AC', 'AH', 'AI']

// Nøkkelen Excel bruker i UnikID (AC2 & AC3): et tall og et maskinnavn. Fra Excel-importen hvis registeret kom derfra.
function excelNokkel(reg: Register) {
  if (reg.excelNokkel) return reg.excelNokkel
  let h = 0
  for (const ch of reg.registerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { ac2: String(1000 + (h % 1001)), ac3: 'WEB' }
}

function riskArk(reg: Register, risker: Risk[], lukket: boolean): Ark {
  const { sett, flett, ferdig } = nyttArk()
  const nokkel = excelNokkel(reg)
  sett('F2', lukket ? 'RISKREGISTER - Lukket' : 'RISKREGISTER')
  flett('F2:J4')
  sett('AC2', nokkel.ac2)
  sett('AC3', nokkel.ac3)
  const hode: [string, string][] = [
    ['C5', 'Nr.'], ['D5', 'R&M'], ['E5', 'Årsak\nKjente situasjonen hvor risiko/ mulighet kan skje'], ['F5', 'Hendelse som kanskje kan skje\nrisiko/ mulighet'],
    ['G5', 'Konsekvenser\nhvis det skjer'], ['H5', 'Risikoeier'], ['I5', 'Status Risk'], ['J5', 'Kategori'], ['K5', reg.lister.egendefNavn || '<egendefinert>'],
    ['L5', 'Sannsynlighet'], ['M5', 'Konsekvens'], ['N5', 'Eksponering'], ['O5', 'Mulig kost (i 1000)'], ['R5', 'Eksponering'], ['S5', 'Tiltak'],
    ['T5', 'Tiltakseier'], ['U5', 'Frist\ntiltak'], ['V5', 'Status tiltak'], ['W5', 'Status tiltak'], ['X5', 'Til Skarisk'],
    ['O6', 'BC'], ['P6', 'ML'], ['Q6', 'WC'], ['R6', 'FV'],
  ]
  for (const [adr, v] of hode) sett(adr, v)
  for (const c of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'S', 'T', 'U', 'V', 'W', 'X']) flett(`${c}5:${c}6`)
  flett('O5:Q5')
  if (reg.lister.egendef2Aktiv) sett(`${WEB_KOL.egendef2}5`, reg.lister.egendef2Navn)
  if (reg.lister.fag.length) sett(`${WEB_KOL.fag}5`, 'Fag')

  let rad = RAD_START
  for (const r of [...risker].sort((a, b) => a.nr - b.nr)) {
    // Minst tre rader per risk, som i Excel-malen
    const n = Math.max(3, r.tiltak.length)
    const ekspo = r.sannsynlighet * r.konsekvens
    sett(RK.nr + rad, r.nr)
    sett(RK.rm + rad, r.rm || '-')
    sett(RK.aarsak + rad, r.aarsak)
    sett(RK.hendelse + rad, r.hendelse)
    sett(RK.konsekvenser + rad, r.konsekvenser)
    sett(RK.eier + rad, r.eier)
    sett(RK.status + rad, lukket ? 'Lukket' : r.status || 'Åpen')
    sett(RK.kategori + rad, strek(r.kategori))
    sett(RK.egendef + rad, strek(r.egendef))
    sett(RK.sanns + rad, nivaa(r.sannsynlighet))
    sett(RK.kons + rad, nivaa(r.konsekvens))
    sett(RK.ekspo + rad, ekspo || '-')
    sett(RK.bc + rad, r.bc || 0)
    sett(RK.ml + rad, r.ml || 0)
    sett(RK.wc + rad, r.wc || 0)
    sett(RK.fv + rad, Math.round(fv(r) * 100) / 100 || 0)
    sett(RK.skarisk + rad, r.tilSkarisk ? 1 : 0)
    sett(RK.unikId + rad, `${nokkel.ac2}${nokkel.ac3}${String.fromCharCode(244)}${r.nr}`)
    if (reg.lister.egendef2Aktiv) sett(WEB_KOL.egendef2 + rad, r.egendef2)
    if (reg.lister.fag.length) sett(WEB_KOL.fag + rad, reg.lister.fag.find((f) => f.id === r.fag)?.navn)
    r.tiltak.forEach((t, i) => {
      sett(RK.tiltak + (rad + i), t.tekst)
      sett(RK.teier + (rad + i), t.eier)
      sett(RK.frist + (rad + i), t.frist ? excelDato(t.frist) : '', true)
      sett(RK.tbeskr + (rad + i), t.beskrivelse)
      sett(RK.tstatus + (rad + i), statusTiltakExcel(reg, t.status))
    })
    for (const c of RISK_KOLONNER) flett(`${c}${rad}:${c}${rad + n - 1}`)
    rad += n
  }
  const ws = ferdig()
  ws['!cols'] = Array.from({ length: 35 }, (_, i) => ({ wch: [2, 2, 6, 5, 40, 40, 40, 20, 10, 18, 14, 14, 14, 10, 9, 9, 9, 9, 45, 20, 12, 35, 14, 9][i] ?? 10 }))
  return ws
}

function deltagerArk(reg: Register): Ark {
  const { sett, flett, ferdig } = nyttArk()
  const p = reg.prosjekt
  sett('B2', 'RISIKO')
  sett('E2', 'Riskregister')
  sett('J7', 'Notering')
  flett('J7:K7')
  sett('J8', p.notering)
  flett('J8:S14')
  const felt: [string, string][] = [
    ['Prosjektnummer :', p.nummer], ['Prosjektnavn :', p.navn], ['Prosjekteier :', p.eier], ['Prosjektsjef :', p.sjef],
    ['Prosjektleder :', p.leder], ['Prosjektfase :', p.fase], ['Virksomhetsområde :', p.virksomhet],
  ]
  felt.forEach(([ledetekst, v], i) => {
    sett('C' + (8 + i), ledetekst)
    flett(`C${8 + i}:E${8 + i}`)
    sett('F' + (8 + i), v)
    flett(`F${8 + i}:H${8 + i}`)
  })
  sett('C16', 'Intressenter/Deltagere')
  flett('C16:M16')
  sett('O16', 'Historikk Riskgjennomgang')
  flett('O16:S16')
  const hode: [string, string][] = [['C17', '#'], ['D17', 'D. Initialer'], ['E17', 'Deltagere navn'], ['J17', 'Rolle i prosjektet'], ['L17', 'Rolle i Riskgjennomgang'], ['O17', 'Dato'], ['P17', 'Signatur for deltagere'], ['R17', 'Fasilitator']]
  for (const [adr, v] of hode) sett(adr, v)
  // Malen har 24 nummererte deltakerrader. Oppgrader leser nummeret i siste rad i kolonne C.
  const antall = Math.max(24, reg.deltakere.length, reg.gjennomganger.length)
  for (let i = 0; i < antall; i++) {
    const r = 18 + i
    sett('C' + r, i + 1)
    const d = reg.deltakere[i]
    if (d) {
      sett('D' + r, d.initialer)
      sett('E' + r, d.navn)
      sett('J' + r, d.rolleProsjekt)
      sett('L' + r, d.rolleRisk)
    }
    const g = reg.gjennomganger[i]
    if (g) {
      sett('O' + r, g.dato ? excelDato(g.dato) : '', true)
      sett('P' + r, g.signatur)
      sett('R' + r, g.fasilitator)
    }
    for (const omr of [`E${r}:I${r}`, `J${r}:K${r}`, `L${r}:M${r}`, `P${r}:Q${r}`, `R${r}:S${r}`]) flett(omr)
  }
  const ws = ferdig()
  ws['!cols'] = [2, 2, 5, 12, 12, 12, 12, 12, 12, 14, 14, 14, 14, 2, 12, 14, 14, 14, 14].map((w) => ({ wch: w }))
  return ws
}

// data-arket med nedtrekkslistene. Oppgrader henter kategoriene og den egendefinerte listen herfra.
function dataArk(reg: Register): Ark {
  const { sett, flett, ferdig } = nyttArk()
  const l = reg.lister
  const kolonne = (c: string, overskrift: string, verdier: (string | number)[]) => {
    sett(c + '1', overskrift)
    verdier.forEach((v, i) => sett(c + (i + 2), v))
  }
  kolonne('A', 'Sannsynlighet, i prosjektet:', [...SANNSYNLIGHET, '-'])
  flett('A1:D1')
  kolonne('F', 'Status Risk', ['Lukket', 'Åpen'])
  kolonne('H', 'Virksomhet', [...l.virksomhet, '-'])
  kolonne('K', 'Kategorier', ['-', ...l.kategorier])
  kolonne('M', 'Risk/Mulighet', ['R', 'M', '-'])
  flett('M1:N1')
  kolonne('P', 'Status tiltak', l.statusTiltak.map((s) => statusTiltakExcel(reg, s)))
  kolonne('R', 'Til Skarisk', [1, 0])
  flett('R1:S1')
  kolonne('U', 'Rolle i prosjektet', l.rollerProsjekt)
  kolonne('W', 'Rolle i Riskgjennomgang', l.rollerRisk)
  kolonne('Y', 'Prosjektfase', l.faser)
  // Overskriften må inneholde «egendefinert», ellers finner ikke Oppgrader listen
  kolonne('AA', '<egendefinert>', ['-', ...l.egendef])
  return ferdig()
}

export function skariskRader(reg: Register): unknown[][] {
  return reg.risker
    .filter((r) => r.tilSkarisk && r.status !== 'Lukket')
    .sort((a, b) => a.nr - b.nr)
    .map((r) => [r.nr, r.rm, r.aarsak, `[ID:${r.nr}] ${r.hendelse}`, r.bc, r.ml, r.wc])
}

export function lagExcelBok(reg: Register): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, deltagerArk(reg), 'Deltagere')
  XLSX.utils.book_append_sheet(wb, riskArk(reg, reg.risker.filter((r) => r.status !== 'Lukket'), false), 'Riskregister')
  XLSX.utils.book_append_sheet(wb, riskArk(reg, reg.risker.filter((r) => r.status === 'Lukket'), true), 'Riskregister - Lukket')
  const ska = XLSX.utils.aoa_to_sheet([['Nr.', 'R&M', 'Årsak', 'Hendelse', 'BC', 'ML', 'WC'], ...skariskRader(reg)])
  XLSX.utils.book_append_sheet(wb, ska, 'Poster til Skarisk')
  XLSX.utils.book_append_sheet(wb, dataArk(reg), 'data')
  // Navnene Oppgrader og resten av VBA-koden slår opp i. Egendef må finnes, ellers tolkes filen som en svært gammel versjon.
  const ark = (navn: string) => wb.SheetNames.indexOf(navn)
  wb.Workbook = {
    Names: ['Riskregister', 'Riskregister - Lukket'].flatMap((n) => [
      { Name: 'Egendef', Ref: `'${n}'!$K$5`, Sheet: ark(n) },
      { Name: 'Nr.', Ref: `'${n}'!$C$5`, Sheet: ark(n) },
      { Name: 'Sans', Ref: `'${n}'!$L$5`, Sheet: ark(n) },
      { Name: 'Skarisk', Ref: `'${n}'!$X$5`, Sheet: ark(n) },
    ]),
  }
  return wb
}

export function eksporterExcel(reg: Register) {
  const wb = lagExcelBok(reg)
  const p = reg.prosjekt
  const navn = ([p.nummer, p.navn].filter(Boolean).join(' ') || 'Riskregister').replace(/[^\w æøåÆØÅ.-]+/g, '-')
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Riskregister ${navn} ${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
