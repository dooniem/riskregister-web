import { useEffect, useMemo, useState } from 'react'
import type { Fag, Register, Risk } from '../model'
import type { PrefixValg } from '../model'
import { FAG_FARGER, brukPrefixValg, harDelregisterMerke, uid, utenDelregisterMerke } from '../model'
import type { Bruker, Op } from '../ops'
import type { Kobling } from './Personer'
import { KoblingListe, SokFeil, finnKoblinger, usePersoner } from './Personer'
import { Modal, ModalTittel } from './Modal'

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

  const finnes = useMemo(() => new Set(doc.risker.map(nokkel).filter((k) => k !== '|')), [doc])
  const [prefix, setPrefix] = useState<PrefixValg>('behold')
  const alle = brukPrefixValg(kilde.risker, prefix, filnavn).filter((r) => r.aarsak || r.hendelse || r.tiltak.some((t) => t.tekst))
  const like = alle.filter((r) => finnes.has(nokkel(r)))
  const antLukket = alle.filter((r) => r.status === 'Lukket').length
  const valgte = alle.filter((r) => (lukkede || r.status !== 'Lukket') && !(hoppOver && finnes.has(nokkel(r))))
  const navnFinnes = new Set(doc.deltakere.map((d) => d.navn.toLowerCase().trim()))
  const nyeDeltakere = kilde.deltakere.filter((d) => !navnFinnes.has(d.navn.toLowerCase().trim()))

  // Prøv å finne de nye deltakerne i organisasjonen ut fra navnet
  const personer = usePersoner()
  const [koblinger, setKoblinger] = useState<Kobling[] | null>(null)
  const [koble, setKoble] = useState<Set<string>>(new Set())
  const [koblingFeil, setKoblingFeil] = useState<unknown>(null)
  const [runde, setRunde] = useState(0)
  useEffect(() => {
    if (!personer || !nyeDeltakere.length) return
    let aktiv = true
    setKoblingFeil(null)
    finnKoblinger(personer.katalog, nyeDeltakere)
      .then((k) => {
        if (!aktiv) return
        setKoblinger(k)
        setKoble(new Set(k.filter((x) => x.person).map((x) => x.deltaker.id)))
      })
      .catch((e) => aktiv && setKoblingFeil(e))
    return () => {
      aktiv = false
    }
  }, [personer, kilde, runde])

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
    if (deltakere)
      for (const d of nyeDeltakere) {
        const k = koblinger?.find((x) => x.deltaker.id === d.id)
        const epost = k?.person && koble.has(d.id) ? k.person.epost : d.epost
        ops.push({ t: 'upsertDeltaker', deltaker: { ...d, id: uid(), epost } })
      }
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
    <Modal lukk={lukk}>
      <header>
        <ModalTittel>Legg til risker fra Excel</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
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
              <span>Importer lukkede risker (de legges til i fanen «Lukkede»)</span>
            </label>
          )}
          <DelregisterValg risker={kilde.risker} filnavn={filnavn} valg={prefix} setValg={setPrefix} />
          {nyeDeltakere.length > 0 && (
            <label className="avkrysning">
              <input type="checkbox" checked={deltakere} onChange={(e) => setDeltakere(e.target.checked)} />
              <span>
                Legg til {nyeDeltakere.length} {nyeDeltakere.length === 1 ? 'ny deltaker' : 'nye deltakere'}
                <small> ({nyeDeltakere.map((d) => d.navn).join(', ')})</small>
              </span>
            </label>
          )}
          {deltakere && nyeDeltakere.length > 0 && personer && (
            <div className="importkobling">
              {koblingFeil != null ? (
                <SokFeil feil={koblingFeil} katalog={personer.katalog} igjen={() => setRunde((r) => r + 1)} />
              ) : !koblinger ? (
                <span className="liten">Leter etter deltakerne i organisasjonen…</span>
              ) : (
                <>
                  {koblinger.some((k) => k.person) && <span className="liten">Funnet i organisasjonen. Kryss av for å koble deltakeren til brukeren:</span>}
                  <KoblingListe koblinger={koblinger} valgt={koble} setValgt={setKoble} />
                </>
              )}
            </div>
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
    </Modal>
  )
}

// Hva som skal skje med prefixet «[Filnavn #ID | dato]» først i årsaken, som viser hvor risken kom fra
export function DelregisterValg({ risker, filnavn, valg, setValg }: { risker: Risk[]; filnavn: string; valg: PrefixValg; setValg: (v: PrefixValg) => void }) {
  const merket = risker.filter(harDelregisterMerke)
  const eksempel = merket[0] && (merket[0].aarsak.match(/^\[[^\]]*\]/) ?? merket[0].hendelse.match(/^\[[^\]]*\]/))?.[0]
  const nytt = `[${filnavn.replace(/\.[^.]*$/, '')} #nr | ${new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: '2-digit' })}]`
  const risk = (n: number) => `${n} ${n === 1 ? 'risk' : 'risker'}`
  const radio = (v: PrefixValg, tittel: string, hint: string) => (
    <label className="avkrysning">
      <input type="radio" name="prefix" checked={valg === v} onChange={() => setValg(v)} />
      <span>
        {tittel}
        <small> {hint}</small>
      </span>
    </label>
  )
  return (
    <div className="felt prefixvalg">
      <span>Prefix riskene for å identifisere kilden</span>
      {radio('behold', 'Behold urørt / keep existing', merket.length ? 'Prefix som finnes, blir stående, og ingen nye legges til.' : 'Ingen prefix legges til.')}
      {merket.length < risker.length &&
        radio(
          'legg-til',
          `Legg til prefix på ${risk(risker.length - merket.length)}`,
          `Risker uten prefix får «${nytt}» først i årsaken.${merket.length ? ' Risker som allerede har prefix, beholder sitt.' : ''}`,
        )}
      {merket.length > 0 && radio('fjern', `Fjern prefix fra ${risk(merket.length)}`, `Prefixet, f.eks. «${eksempel}», fjernes, mens beskrivelsen består. Det tas vare på som kilde i høyreklikk-infoen.`)}
    </div>
  )
}
