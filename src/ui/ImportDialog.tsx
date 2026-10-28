import { useMemo, useState } from 'react'
import type { Fag, Register, Risk } from '../model'
import { FAG_FARGER, harDelregisterMerke, uid, utenDelregisterMerke } from '../model'
import type { Bruker, Op } from '../ops'

interface Props {
  doc: Register
  kilde: Register // registeret som ble lest fra Excel-filen
  filnavn: string
  bruker: Bruker
  endre: (...ops: Op[]) => void
  ferdig: (tekst: string) => void
  lukk: () => void
}

// Samme risk regnes som lik hvis årsak og hendelse er like (uten hensyn til store/små bokstaver, mellomrom og delregister-merket)
const nokkel = (r: Risk) => [utenDelregisterMerke(r).aarsak, utenDelregisterMerke(r).hendelse].map((s) => s.toLowerCase().replace(/\s+/g, ' ').trim()).join('|')

// Legger risker fra en Excel-fil (f.eks. et delregister fra en underentreprenør) til i registeret som er åpent
export function ImportDialog({ doc, kilde, filnavn, bruker, endre, ferdig, lukk }: Props) {
  const [hoppOver, setHoppOver] = useState(true)
  const [lukkede, setLukkede] = useState(false)
  const [deltakere, setDeltakere] = useState(true)
  const [fjernMerke, setFjernMerke] = useState(true)

  const finnes = useMemo(() => new Set(doc.risker.map(nokkel).filter((k) => k !== '|')), [doc])
  const merket = kilde.risker.filter(harDelregisterMerke).length
  const alle = kilde.risker.map((r) => (fjernMerke ? utenDelregisterMerke(r) : r)).filter((r) => r.aarsak || r.hendelse || r.tiltak.some((t) => t.tekst))
  const like = alle.filter((r) => finnes.has(nokkel(r)))
  const antLukket = alle.filter((r) => r.status === 'Lukket').length
  const valgte = alle.filter((r) => (lukkede || r.status !== 'Lukket') && !(hoppOver && finnes.has(nokkel(r))))
  const navnFinnes = new Set(doc.deltakere.map((d) => d.navn.toLowerCase().trim()))
  const nyeDeltakere = kilde.deltakere.filter((d) => !navnFinnes.has(d.navn.toLowerCase().trim()))

  const importer = () => {
    const ops: Op[] = []
    const l = doc.lister
    // Fag, egendefinert og kategorier som ikke finnes i registeret legges til i listene
    const fag: Fag[] = [...l.fag]
    const fagId = new Map<string, string>()
    for (const f of kilde.lister.fag) {
      if (!valgte.some((r) => r.fag === f.id)) continue
      let finnesFag = fag.find((x) => x.navn.toLowerCase() === f.navn.toLowerCase())
      if (!finnesFag) fag.push((finnesFag = { ...f, id: uid(), farge: fag.length % FAG_FARGER.length }))
      fagId.set(f.id, finnesFag.id)
    }
    if (fag.length !== l.fag.length) ops.push({ t: 'setListe', key: 'fag', verdi: fag })
    const utvid = (key: 'egendef' | 'kategorier' | 'egendef2', verdier: (string | undefined)[]) => {
      const nye = [...new Set(verdier.filter((v): v is string => !!v && v !== '-' && !l[key].includes(v)))]
      if (nye.length) ops.push({ t: 'setListe', key, verdi: [...l[key], ...nye] })
    }
    utvid('egendef', valgte.map((r) => r.egendef))
    utvid('kategorier', valgte.map((r) => r.kategori))
    if (l.egendef2Aktiv) utvid('egendef2', valgte.map((r) => r.egendef2))
    if (deltakere) for (const d of nyeDeltakere) ops.push({ t: 'upsertDeltaker', deltaker: { ...d, id: uid() } })
    const naa = new Date().toISOString()
    for (const r of [...valgte].sort((a, b) => a.nr - b.nr))
      ops.push({
        t: 'addRisk',
        risk: {
          ...structuredClone(r),
          id: uid(),
          fag: r.fag ? fagId.get(r.fag) : undefined,
          tiltak: r.tiltak.map((t) => ({ ...t, id: uid() })),
          opprettet: naa,
          opprettetAv: `${bruker.navn}, importert fra ${filnavn}`,
        },
      })
    const fra = Math.max(doc.nesteNr ?? 1, doc.risker.reduce((m, x) => Math.max(m, x.nr), 0) + 1)
    endre(...ops)
    ferdig(
      valgte.length
        ? `La til ${valgte.length} ${valgte.length === 1 ? 'risk' : 'risker'} fra «${filnavn}» (nr. ${fra}${valgte.length > 1 ? `–${fra + valgte.length - 1}` : ''}). Ctrl+Z angrer.`
        : 'Ingen risker ble lagt til.',
    )
  }

  return (
    <div className="modal-bakgrunn" onMouseDown={(e) => e.target === e.currentTarget && lukk()}>
      <div className="modal">
        <header>
          <h2>Legg til risker fra Excel</h2>
          <button className="ikonknapp" onClick={lukk}>
            ✕
          </button>
        </header>
        <div className="modal-innhold skjema">
          <p>
            «{filnavn}» har <strong>{alle.length}</strong> {alle.length === 1 ? 'risk' : 'risker'}
            {antLukket > 0 && ` (${antLukket} lukket)`}. De legges til etter de som finnes i registeret og får nye numre.
          </p>
          <div className="felt">
            {like.length > 0 && (
              <label className="avkrysning">
                <input type="checkbox" checked={hoppOver} onChange={(e) => setHoppOver(e.target.checked)} />
                <span>
                  Hopp over {like.length} {like.length === 1 ? 'risk' : 'risker'} som finnes fra før
                  <small> (samme årsak og hendelse, f.eks. fordi delregisteret ble laget fra dette registeret)</small>
                </span>
              </label>
            )}
            {antLukket > 0 && (
              <label className="avkrysning">
                <input type="checkbox" checked={lukkede} onChange={(e) => setLukkede(e.target.checked)} />
                <span>Ta med lukkede risker</span>
              </label>
            )}
            {merket > 0 && <DelregisterValg antall={merket} eksempel={kilde.risker.find(harDelregisterMerke)!} fjern={fjernMerke} setFjern={setFjernMerke} />}
            {nyeDeltakere.length > 0 && (
              <label className="avkrysning">
                <input type="checkbox" checked={deltakere} onChange={(e) => setDeltakere(e.target.checked)} />
                <span>
                  Legg til {nyeDeltakere.length} {nyeDeltakere.length === 1 ? 'ny deltaker' : 'nye deltakere'}
                  <small> ({nyeDeltakere.map((d) => d.navn).join(', ')})</small>
                </span>
              </label>
            )}
          </div>
          {valgte.length > 0 && (
            <ul className="importliste">
              {valgte.map((r) => (
                <li key={r.id}>
                  <span className="liten">{r.status === 'Lukket' ? 'Lukket' : r.rm === 'M' ? 'Mulighet' : 'Risk'}</span> {r.hendelse || r.aarsak || '(uten tekst)'}
                </li>
              ))}
            </ul>
          )}
          <div className="knapperad">
            <button className="knapp" onClick={lukk}>
              Avbryt
            </button>
            <button className="knapp primær" disabled={!valgte.length} onClick={importer}>
              Legg til {valgte.length} {valgte.length === 1 ? 'risk' : 'risker'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Valget om å fjerne prefixet «[Delregister #ID | dato]» som Excel-registeret legger først i årsaken på importerte risker
export function DelregisterValg({ antall, eksempel, fjern, setFjern }: { antall: number; eksempel: Risk; fjern: boolean; setFjern: (v: boolean) => void }) {
  const merke = (eksempel.aarsak.match(/^\[[^\]]*\]/) ?? eksempel.hendelse.match(/^\[[^\]]*\]/))?.[0]
  return (
    <label className="avkrysning">
      <input type="checkbox" checked={fjern} onChange={(e) => setFjern(e.target.checked)} />
      <span>
        Fjern delregister-prefix fra {antall} {antall === 1 ? 'risk' : 'risker'}
        <small> Prefixet, f.eks. «{merke}», fjernes, mens beskrivelsen består. Prefixet tas vare på som kilde i høyreklikk-infoen.</small>
      </span>
    </label>
  )
}
