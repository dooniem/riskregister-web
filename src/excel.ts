// Import fra eksisterende Riskregister-XLSM og eksport til Excel.
import * as XLSX from 'xlsx'
import type { Deltaker, Register, Risk, Tiltak } from './model'
import { DEFAULT_LISTER, fv, nyttRegister, uid } from './model'

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
        status: tekst(ws, i, kol('W')).replace(/^\d+-/, ''),
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
    })
    r = slutt + 1
  }
  return risker
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
    const e = kolonneListe(data, 'AA')
    if (e.length) {
      l.egendefNavn = e[0]
      l.egendef = e.slice(1)
    }
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

  const aapne = lesRisker(hoved, false)
  const lukkede = wb.Sheets['Riskregister - Lukket'] ? lesRisker(wb.Sheets['Riskregister - Lukket'], true) : []
  reg.risker = [...aapne, ...lukkede]
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
const HODE = ['Nr.', 'R&M', 'Årsak', 'Hendelse', 'Konsekvenser', 'Risikoeier', 'Status risk', 'Kategori', '', 'Sannsynlighet', 'Konsekvens', 'Eksponering', 'BC', 'ML', 'WC', 'FV', 'Tiltak', 'Tiltakseier', 'Frist tiltak', 'Status tiltak (beskrivelse)', 'Status tiltak', 'Til Skarisk']

function riskArk(reg: Register, risker: Risk[]): Ark {
  const hode = [...HODE]
  hode[8] = reg.lister.egendefNavn
  if (reg.lister.egendef2Aktiv) hode.push(reg.lister.egendef2Navn)
  if (reg.lister.fag.length) hode.push('Fag')
  const rader: unknown[][] = [hode]
  const merges: XLSX.Range[] = []
  for (const r of [...risker].sort((a, b) => a.nr - b.nr)) {
    const n = Math.max(1, r.tiltak.length)
    const start = rader.length
    for (let i = 0; i < n; i++) {
      const t = r.tiltak[i]
      const riskdel =
        i === 0
          ? [r.nr, r.rm, r.aarsak, r.hendelse, r.konsekvenser, r.eier, r.status, r.kategori, r.egendef, r.sannsynlighet || '', r.konsekvens || '', r.sannsynlighet * r.konsekvens || '', r.bc, r.ml, r.wc, Math.round(fv(r))]
          : Array(16).fill('')
      const rad = [...riskdel, t?.tekst ?? '', t?.eier ?? '', t?.frist ?? '', t?.beskrivelse ?? '', t?.status ?? '', i === 0 ? (r.tilSkarisk ? 1 : 0) : '']
      // Egendefinert kolonne 2 finnes ikke i Excel-malen, så den legges sist for at filen fortsatt kan importeres
      if (reg.lister.egendef2Aktiv) rad.push(i === 0 ? (r.egendef2 ?? '') : '')
      if (reg.lister.fag.length) rad.push(i === 0 ? (reg.lister.fag.find((f) => f.id === r.fag)?.navn ?? '') : '')
      rader.push(rad)
    }
    if (n > 1) for (const c of [...Array(16).keys(), ...Array.from({ length: hode.length - 21 }, (_, i) => 21 + i)]) merges.push({ s: { r: start, c }, e: { r: start + n - 1, c } })
  }
  const ws = XLSX.utils.aoa_to_sheet(rader)
  ws['!merges'] = merges
  ws['!cols'] = [6, 5, 40, 40, 40, 20, 10, 18, 14, 14, 14, 10, 9, 9, 9, 9, 45, 20, 12, 35, 14, 9].map((w) => ({ wch: w }))
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: hode.length - 1 } }) }
  return ws
}

export function skariskRader(reg: Register): unknown[][] {
  return reg.risker
    .filter((r) => r.tilSkarisk && r.status !== 'Lukket')
    .sort((a, b) => a.nr - b.nr)
    .map((r) => [r.nr, r.rm, r.aarsak, `[ID:${r.nr}] ${r.hendelse}`, r.bc, r.ml, r.wc])
}

export function eksporterExcel(reg: Register) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, riskArk(reg, reg.risker.filter((r) => r.status !== 'Lukket')), 'Riskregister')
  XLSX.utils.book_append_sheet(wb, riskArk(reg, reg.risker.filter((r) => r.status === 'Lukket')), 'Riskregister - Lukket')
  const p = reg.prosjekt
  const del = XLSX.utils.aoa_to_sheet([
    ['Prosjektnummer', p.nummer],
    ['Prosjektnavn', p.navn],
    ['Prosjekteier', p.eier],
    ['Prosjektsjef', p.sjef],
    ['Prosjektleder', p.leder],
    ['Prosjektfase', p.fase],
    ['Virksomhetsområde', p.virksomhet],
    ['Notering', p.notering],
    [],
    ['#', 'Initialer', 'Navn', 'Rolle i prosjektet', 'Rolle i riskgjennomgang'],
    ...reg.deltakere.map((d, i) => [i + 1, d.initialer, d.navn, d.rolleProsjekt, d.rolleRisk]),
    [],
    ['Dato', 'Signatur for deltakere', 'Fasilitator'],
    ...reg.gjennomganger.map((g) => [g.dato, g.signatur, g.fasilitator]),
  ])
  XLSX.utils.book_append_sheet(wb, del, 'Deltagere')
  const ska = XLSX.utils.aoa_to_sheet([['Nr.', 'R&M', 'Årsak', 'Hendelse', 'BC', 'ML', 'WC'], ...skariskRader(reg)])
  XLSX.utils.book_append_sheet(wb, ska, 'Poster til Skarisk')
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
