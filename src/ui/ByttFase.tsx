import { useEffect, useMemo, useState } from 'react'
import type { Register } from '../model'
import { hvileStatus, hvileTekst } from '../model'
import type { Op } from '../ops'
import type { Snapshots } from '../store/backend'
import { Modal, ModalTittel } from './Modal'

interface Props {
  doc: Register
  snapshots?: Snapshots
  endre: (...ops: Op[]) => void
  lukk: () => void
  melding: (tekst: string) => void
}

// Hvile settes i registeret (høyreklikk › Hvil risken…), der hver gruppe kan få sin egen tid
type Valg = 'behold' | 'lukk'
const VALG: { key: Valg; tittel: string }[] = [
  { key: 'behold', tittel: 'Behold' },
  { key: 'lukk', tittel: 'Lukk' },
]
const STEG = ['Milepæl-snapshot', 'Åpne risker', 'Ny fase']
const iDag = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD i lokal tid

// Mer › Bytt fase: tar et milepæl-snapshot av registeret slik det er nå, går gjennom de åpne riskene (behold eller lukk)
// og setter ny fase. Byttet lagres i fasehistorikken, så appen vet hvilken fase hver risk ble opprettet og lukket i.
export function ByttFaseDialog({ doc, snapshots, endre, lukk, melding }: Props) {
  const gammel = doc.prosjekt.fase
  const [steg, setSteg] = useState(0)
  const [taSnapshot, setTaSnapshot] = useState(!!snapshots)
  const [navn, setNavn] = useState(`Sluttstatus ${gammel || 'før fasebytte'}`)
  const [tar, setTar] = useState<{ ferdig: number; totalt: number } | null>(null)
  const [snapshotId, setSnapshotId] = useState<string>()
  const [feil, setFeil] = useState('')

  const aapne = useMemo(() => doc.risker.filter((r) => r.status !== 'Lukket').sort((a, b) => a.nr - b.nr), [doc.risker])
  const [valg, setValg] = useState<Record<string, Valg>>({})
  const [merket, setMerket] = useState<string[]>([])
  const [kategori, setKategori] = useState('')
  const kategorier = useMemo(() => [...new Set(aapne.map((r) => r.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [aapne])
  const synlige = aapne.filter((r) => !kategori || r.kategori === kategori)
  const valgFor = (id: string): Valg => valg[id] ?? 'behold'
  const sett = (ider: string[], v: Valg) => setValg((x) => ({ ...x, ...Object.fromEntries(ider.map((id) => [id, v])) }))
  const lukkes = aapne.filter((r) => valgFor(r.id) === 'lukk')
  const beholdes = aapne.length - lukkes.length

  // Neste fase i listen foreslås, ellers den første som ikke er den gamle
  const faser = doc.lister.faser
  const [fase, setFase] = useState(() => faser[faser.indexOf(gammel) + 1] ?? faser.find((f) => f !== gammel) ?? '')
  const [dato, setDato] = useState(iDag)
  const ny = !!fase.trim() && !faser.includes(fase.trim())
  // Risker som hviler til fasen det byttes til, og som ikke får et nytt valg her
  const vaakner = aapne.filter((r) => valgFor(r.id) === 'behold' && hvileStatus(doc, r) === 'hviler' && !!fase.trim() && doc.hviler?.[r.id]?.fase === fase.trim())

  // Advarer hvis fanen lukkes mens snapshotet lagres
  useEffect(() => {
    if (!tar) return
    const f = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [tar])

  const taSnapshotOgFortsett = async () => {
    if (!snapshots || !taSnapshot || snapshotId) return setSteg(1)
    setFeil('')
    setTar({ ferdig: 0, totalt: doc.risker.length })
    try {
      const s = await snapshots.ta(navn.trim() || `Sluttstatus ${gammel}`, `Tatt ved fasebytte${gammel ? ` fra ${gammel}` : ''}`, doc, (ferdig, totalt) => setTar({ ferdig, totalt }))
      endre({ t: 'setMilepael', snapshotId: s.id, paa: true })
      setSnapshotId(s.id)
      setSteg(1)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setTar(null)
    }
  }

  const fullfor = () => {
    if (!fase.trim()) return setFeil('Velg den nye fasen eller skriv et navn.')
    if (fase.trim() === gammel) return setFeil(`Prosjektet er allerede i fasen «${gammel}».`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return setFeil('Velg datoen den nye fasen gjelder fra.')
    endre(
      ...lukkes.map((r): Op => ({ t: 'setRisk', riskId: r.id, felt: 'status', verdi: 'Lukket', fra: r.status })),
      // Et eget fasenavn legges til i fase-listen, så det kan velges i prosjektinfo og ved neste bytte
      ...(ny ? [{ t: 'setListe', key: 'faser', verdi: [...faser, fase.trim()] } as Op] : []),
      { t: 'byttFase', fase: fase.trim(), dato, snapshotId },
    )
    melding(
      `Prosjektet er nå i fasen «${fase.trim()}».${lukkes.length ? ` ${lukkes.length} ${lukkes.length === 1 ? 'risk er' : 'risker er'} lukket.` : ''}${vaakner.length ? ` ${vaakner.length} ${vaakner.length === 1 ? 'risk' : 'risker'} våknet.` : ''}`,
    )
    lukk()
  }

  return (
    <Modal className="bred fasebytte" lukk={tar ? undefined : lukk}>
      <header>
        <ModalTittel>Bytt fase{gammel ? ` fra ${gammel}` : ''}</ModalTittel>
        <button className="ikonknapp" onClick={lukk} disabled={!!tar} aria-label="Lukk" title={tar ? 'Vent til snapshotet er lagret' : 'Lukk'}>
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <ol className="fasebytte-steg">
          {STEG.map((t, i) => (
            <li key={t} className={i === steg ? 'aktiv' : i < steg ? 'ferdig' : ''} aria-current={i === steg ? 'step' : undefined}>
              <span className="steg-nr">{i < steg ? '✓' : i + 1}</span> {t}
            </li>
          ))}
        </ol>

        {steg === 0 && (
          <div className="skjema">
            <p>
              Ta et snapshot av registeret slik det er nå, før riskene gjennomgås. Det merkes som milepæl, så det står øverst i snapshotlisten og kan brukes til å se hva som har
              skjedd siden.
            </p>
            {snapshots ? (
              <>
                <label className="avkrysning">
                  <input type="checkbox" checked={taSnapshot} disabled={!!tar} onChange={(e) => setTaSnapshot(e.target.checked)} />
                  Ta milepæl-snapshot
                </label>
                {taSnapshot && (
                  <label className="felt">
                    <span>Navn på snapshotet</span>
                    <input value={navn} disabled={!!tar} onChange={(e) => setNavn(e.target.value)} />
                  </label>
                )}
              </>
            ) : (
              <p className="liten">Snapshots er ikke tilgjengelig for dette registeret, så fasen byttes uten snapshot.</p>
            )}
            {tar && (
              <div className="snapshot-fremdrift" role="status" aria-live="polite">
                <div className="liten">{tar.ferdig >= tar.totalt ? 'Gjør ferdig snapshotet…' : `Lagrer riskene … ${tar.ferdig} av ${tar.totalt}`}</div>
                <progress max={tar.totalt + 1} value={tar.ferdig >= tar.totalt ? tar.totalt + 1 : tar.ferdig} aria-label="Fremdrift" />
              </div>
            )}
          </div>
        )}

        {steg === 1 && (
          <div className="fasebytte-risker">
            <p>
              Velg hva som skal skje med de {aapne.length} åpne riskene. Lukkede risker blir liggende under Lukkede med historikken sin. Merk flere for å velge for alle samtidig.
            </p>
            <div className="fasebytte-verktoy">
              {merket.length > 0 ? (
                <>
                  <span>{merket.length} merket:</span>
                  {VALG.map((x) => (
                    <button key={x.key} className="knapp liten" onClick={() => sett(merket, x.key)}>
                      {x.tittel}
                    </button>
                  ))}
                </>
              ) : (
                <span className="liten">Ingen merket</span>
              )}
              {kategorier.length > 1 && (
                <label className="velg fasebytte-kategori">
                  Kategori
                  <select value={kategori} onChange={(e) => (setKategori(e.target.value), setMerket([]))}>
                    <option value="">Alle</option>
                    {kategorier.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="fasebytte-tabell">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Merk alle"
                        checked={synlige.length > 0 && synlige.every((r) => merket.includes(r.id))}
                        onChange={(e) => setMerket(e.target.checked ? synlige.map((r) => r.id) : [])}
                      />
                    </th>
                    <th>Nr.</th>
                    <th>Hendelse</th>
                    <th>Kategori</th>
                    <th>Risikoeier</th>
                    <th>Valg</th>
                  </tr>
                </thead>
                <tbody>
                  {synlige.map((r) => {
                    const v = valgFor(r.id)
                    const m = merket.includes(r.id)
                    return (
                      <tr key={r.id} className={(m ? 'merket' : '') + (v === 'lukk' ? ' lukkes' : '')}>
                        <td>
                          <input type="checkbox" aria-label={`Merk risk ${r.nr}`} checked={m} onChange={(e) => setMerket((x) => (e.target.checked ? [...x, r.id] : x.filter((id) => id !== r.id)))} />
                        </td>
                        <td className="tall">{r.nr}</td>
                        <td>
                          {r.hendelse || r.aarsak || <span className="liten">(uten tekst)</span>}
                          {hvileStatus(doc, r) === 'hviler' && <span className="hvile-merke" title="Hviler allerede. Behold lar hvilen stå.">hviler til {hvileTekst(doc.hviler![r.id])}</span>}
                        </td>
                        <td>{r.kategori}</td>
                        <td>{r.eier}</td>
                        <td>
                          <div className="segment" role="radiogroup" aria-label={`Valg for risk ${r.nr}`}>
                            {VALG.map((x) => (
                              <button key={x.key} role="radio" aria-checked={v === x.key} className={v === x.key ? 'valgt' : ''} onClick={() => sett([r.id], x.key)}>
                                {x.tittel}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="liten">
              {beholdes} beholdes · {lukkes.length} lukkes. Risker som skal hvile, setter du etterpå i registeret med høyreklikk › Hvil risken…
            </p>
          </div>
        )}

        {steg === 2 && (
          <div className="skjema">
            <label className="felt">
              <span>Ny fase</span>
              {/* Forslagene kommer fra fase-listen under Lister og valg, men fasen kan også få et eget navn */}
              <input list="fasebytte-faser" value={fase} onChange={(e) => setFase(e.target.value)} placeholder="Velg fra listen eller skriv et eget navn" />
              <datalist id="fasebytte-faser">
                {faser
                  .filter((f) => f !== gammel)
                  .map((f) => (
                    <option key={f} value={f} />
                  ))}
              </datalist>
              <span className="liten">
                {ny
                  ? `«${fase.trim()}» er et nytt navn. Det legges til i fase-listen (Prosjekt › Lister og valg) når du bytter fase.`
                  : 'Velg en fase fra listen, eller skriv et nytt navn. Et nytt navn legges til i fase-listen når du bytter fase.'}
              </span>
            </label>
            <label className="felt">
              <span>Gjelder fra</span>
              <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} style={{ maxWidth: 200 }} />
            </label>
            <div className="fasebytte-oppsummering">
              <b>Dette skjer når du bytter fase:</b>
              <ul>
                {snapshotId && <li>Milepælen «{navn.trim()}» er lagret.</li>}
                <li>
                  {lukkes.length ? `${lukkes.length} ${lukkes.length === 1 ? 'risk' : 'risker'} lukkes` : 'Ingen risker lukkes'}, {beholdes} beholdes.
                </li>
                {vaakner.length > 0 && (
                  <li>
                    {vaakner.length} {vaakner.length === 1 ? 'risk' : 'risker'} som hviler til «{fase.trim()}», våkner og kommer tilbake under Åpne.
                  </li>
                )}
                <li>
                  Fasen i prosjektinfo endres {gammel ? `fra «${gammel}» ` : ''}til «{fase || '…'}».
                </li>
              </ul>
            </div>
          </div>
        )}

        {feil && <div className="banner feil">{feil}</div>}
        <div className="knapperad">
          {steg > 0 && (
            <button className="knapp" onClick={() => (setFeil(''), setSteg(steg - 1))}>
              Tilbake
            </button>
          )}
          {steg === 0 && (
            <button className="knapp primær" disabled={!!tar} onClick={() => void taSnapshotOgFortsett()}>
              {snapshots && taSnapshot && !snapshotId ? (tar ? 'Tar snapshot…' : 'Ta snapshot og gå videre') : 'Gå videre'}
            </button>
          )}
          {steg === 1 && (
            <button className="knapp primær" onClick={() => setSteg(2)}>
              Neste: velg fase
            </button>
          )}
          {steg === 2 && (
            <button className="knapp primær" onClick={fullfor}>
              Bytt fase
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
