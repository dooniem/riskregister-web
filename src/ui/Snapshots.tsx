import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Register } from '../model'
import type { Op } from '../ops'
import type { RiskEndring } from '../sammenlign'
import { sammenlign } from '../sammenlign'
import type { SnapshotInfo, Snapshots } from '../store/backend'
import { Modal, ModalTittel } from './Modal'

interface Props {
  snapshots: Snapshots
  doc: Register // registeret slik det er nå
  kanSkrive: boolean
  lukk: () => void
  melding: (tekst: string) => void
  aapneRisk: (riskId: string) => void
  // Gjør snapshotet til det registeret sammenlignes med (endringer i tall og piler i matrisen)
  aktiver: (s: { info: SnapshotInfo; doc: Register }) => void
  start?: { info: SnapshotInfo; doc: Register } // vis endringslisten for dette snapshotet med en gang
  endre?: (...ops: Op[]) => void // merker snapshots som milepæl (lagres i registeret)
}

// Milepælene først, så de andre. Begge med det nyeste øverst (listen kommer sortert på tid).
function sorterSnapshots(liste: SnapshotInfo[], milepaeler: string[] = []) {
  return [...liste.filter((s) => milepaeler.includes(s.id)), ...liste.filter((s) => !milepaeler.includes(s.id))]
}

const tid = (iso: string) => (iso ? new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const dagensNavn = () => `Snapshot ${new Date().toLocaleDateString('nb-NO')}`

// Lenke som åpner et snapshot skrivebeskyttet i samme visning som registeret
export function snapshotLenke(id: string) {
  const p = new URLSearchParams(window.location.search)
  p.set('snapshot', id)
  p.delete('ny')
  return '?' + p.toString()
}

export function SnapshotDialog({ snapshots, doc, kanSkrive, lukk, melding, aapneRisk, aktiver, start, endre }: Props) {
  const milepaeler = doc.milepaeler ?? []
  const [milepael, setMilepael] = useState(false)
  const [liste, setListe] = useState<SnapshotInfo[] | null>(null)
  const [navn, setNavn] = useState(dagensNavn)
  const [kommentar, setKommentar] = useState('')
  const [jobber, setJobber] = useState('')
  const [feil, setFeil] = useState('')
  // Mens et snapshot lagres: hvor mange risker som er skrevet. Dialogen kan ikke lukkes så lenge.
  const [tar, setTar] = useState<{ ferdig: number; totalt: number } | null>(null)
  const [nyId, setNyId] = useState('') // snapshotet som nettopp ble tatt, markeres i listen
  const [valgt, setValgt] = useState<{ info: SnapshotInfo; doc: Register } | null>(start ?? null)

  const jobb = async (tekst: string, f: () => Promise<void>) => {
    setFeil('')
    setJobber(tekst)
    try {
      await f()
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setJobber('')
    }
  }

  const hentListe = () => jobb('Henter snapshots…', async () => setListe(await snapshots.liste()))
  useEffect(() => {
    void hentListe()
  }, [snapshots])

  // Advarer hvis fanen lukkes eller lastes på nytt mens snapshotet lagres
  const lagrer = !!tar
  useEffect(() => {
    if (!lagrer) return
    const f = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [lagrer])

  const lukkHvisLov = lagrer ? undefined : lukk

  return (
    <Modal className="bred" lukk={lukkHvisLov}>
      <header>
        <ModalTittel>{valgt ? `Endringer siden «${valgt.info.navn}»` : 'Snapshots'}</ModalTittel>
        <button className="ikonknapp" onClick={lukk} disabled={!!tar} aria-label="Lukk" title={tar ? 'Vent til snapshotet er lagret' : 'Lukk'}>
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        {valgt ? (
          <>
            <button className="lenkeknapp" onClick={() => setValgt(null)}>
              ◂ Tilbake til snapshots
            </button>
            <SammenligningVisning fra={valgt.doc} til={doc} info={valgt.info} aapneRisk={(id) => (aapneRisk(id), lukk())} />
          </>
        ) : (
          <>
            <p className="liten">
              Et snapshot tar vare på registeret slik det er nå, slik at du senere kan se hva som er endret siden, f.eks. siden forrige gjennomgang. Velg «Sammenlign» for å
              se endringer i BC, ML, WC og FV i tabellen og oversikten, og piler i risikomatrisen. Snapshotene ligger i listene «Riskregister Snapshots» og «Riskregister
              Snapshotdata».
            </p>
            {kanSkrive && tar && <SnapshotFremdrift navn={navn} {...tar} />}
            {kanSkrive && !tar && (
              <form
                className="snapshot-ny"
                onSubmit={(e) => {
                  e.preventDefault()
                  setNyId('')
                  setTar({ ferdig: 0, totalt: doc.risker.length })
                  void jobb('Tar snapshot…', async () => {
                    try {
                      const s = await snapshots.ta(navn.trim() || dagensNavn(), kommentar.trim(), doc, (ferdig, totalt) => setTar({ ferdig, totalt }))
                      if (milepael) endre?.({ t: 'setMilepael', snapshotId: s.id, paa: true })
                      melding(`${milepael ? 'Milepælen' : 'Snapshot'} «${s.navn}» er lagret med ${s.antallRisker} risker.`)
                      setNavn(dagensNavn())
                      setKommentar('')
                      setMilepael(false)
                      setNyId(s.id)
                      setListe(await snapshots.liste())
                    } finally {
                      setTar(null)
                    }
                  })
                }}
              >
                <label className="felt">
                  <span>Navn</span>
                  <input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. Gjennomgang 12.11" />
                </label>
                <label className="felt">
                  <span>Kommentar (valgfritt)</span>
                  <input value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
                </label>
                {endre && (
                  <label className="avkrysning" title="Milepæler står øverst i listen og kan ikke slettes uten å fjerne merket først">
                    <input type="checkbox" checked={milepael} onChange={(e) => setMilepael(e.target.checked)} />
                    Merk som milepæl
                  </label>
                )}
                <button className="knapp primær" disabled={!!jobber}>
                  Ta snapshot nå
                </button>
              </form>
            )}
            {jobber && !tar && <p className="liten">{jobber}</p>}
            {feil && <div className="banner feil">{feil}</div>}
            {liste && liste.length === 0 && <p>Ingen snapshots ennå.</p>}
            {liste && liste.length > 0 && (
              <table className="snapshotliste">
                <thead>
                  <tr>
                    <th>Navn</th>
                    <th>Tatt</th>
                    <th>Av</th>
                    <th>Risker</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorterSnapshots(liste, milepaeler).map((s, i, alle) => {
                    const erMilepael = milepaeler.includes(s.id)
                    // Overskrift over de vanlige snapshotene når det finnes milepæler over dem
                    const skille = !erMilepael && i > 0 && milepaeler.includes(alle[i - 1].id)
                    return (
                    <Fragment key={s.id}>
                    {skille && (
                      <tr className="snapshot-skille">
                        <th colSpan={5}>Andre snapshots</th>
                      </tr>
                    )}
                    <tr className={(s.id === nyId ? 'snapshot-nytt' : '') + (erMilepael ? ' milepael' : '')}>
                      <td>
                        {erMilepael && <span className="milepael-merke">Milepæl</span>}
                        <b>{s.navn}</b>
                        {s.id === nyId && <span className="snapshot-merke">✓ Nettopp lagret</span>}
                        {s.kommentar && <div className="liten">{s.kommentar}</div>}
                      </td>
                      <td>{tid(s.tidspunkt)}</td>
                      <td>{s.tattAv}</td>
                      <td className="tall">{s.antallRisker}</td>
                      <td className="handlinger">
                        <button
                          className="knapp liten primær"
                          disabled={!!jobber}
                          onClick={() =>
                            void jobb('Henter snapshotet…', async () => {
                              aktiver(await snapshots.hent(s.id))
                              lukk()
                            })
                          }
                        >
                          Sammenlign
                        </button>
                        <button className="knapp liten" disabled={!!jobber} onClick={() => void jobb('Henter snapshotet…', async () => setValgt(await snapshots.hent(s.id)))}>
                          Endringsliste
                        </button>
                        <a className="knapp liten" href={snapshotLenke(s.id)} target="_blank" rel="noreferrer" title="Åpner snapshotet skrivebeskyttet i en ny fane">
                          Åpne
                        </a>
                        {kanSkrive && endre && (
                          <button
                            className="lenkeknapp"
                            disabled={!!jobber}
                            title={erMilepael ? 'Snapshotet blir et vanlig snapshot igjen' : 'Milepæler står øverst og kan ikke slettes uten å fjerne merket først'}
                            onClick={() => endre({ t: 'setMilepael', snapshotId: s.id, paa: !erMilepael })}
                          >
                            {erMilepael ? 'Fjern milepæl' : 'Merk som milepæl'}
                          </button>
                        )}
                        {kanSkrive && (
                          <button
                            className="lenkeknapp fare"
                            disabled={!!jobber || erMilepael}
                            title={erMilepael ? 'Fjern milepælmerket først for å slette snapshotet' : undefined}
                            onClick={() => {
                              if (confirm(`Slette snapshotet «${s.navn}»?`))
                                void jobb('Sletter…', async () => {
                                  await snapshots.slett(s.id)
                                  setListe(await snapshots.liste())
                                })
                            }}
                          >
                            Slett
                          </button>
                        )}
                      </td>
                    </tr>
                    </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// Vises i stedet for skjemaet mens snapshotet lagres
function SnapshotFremdrift({ navn, ferdig, totalt }: { navn: string; ferdig: number; totalt: number }) {
  const sist = ferdig >= totalt // riskene er lagret, bare snapshot-raden gjenstår
  return (
    <div className="snapshot-fremdrift" role="status" aria-live="polite">
      <div className="snapshot-fremdrift-topp">
        <span className="spinner" aria-hidden="true" />
        <div>
          <b>Tar snapshot «{navn.trim() || dagensNavn()}»…</b>
          <div className="liten">{sist ? 'Gjør ferdig snapshotet…' : `Lagrer riskene … ${ferdig} av ${totalt}`}</div>
        </div>
      </div>
      <progress max={totalt + 1} value={sist ? totalt + 1 : ferdig} aria-label="Fremdrift" />
      <p className="liten">Dette kan ta litt tid for store registre. Ikke lukk vinduet før snapshotet er lagret.</p>
    </div>
  )
}

const TYPE: Record<RiskEndring['type'], string> = { ny: 'Ny', endret: 'Endret', fjernet: 'Slettet' }
const fmt = (n: number) => n.toLocaleString('nb-NO', { maximumFractionDigits: 1 })
const diff = (a: number, b: number) => (b - a === 0 ? '' : (b > a ? '+' : '') + fmt(b - a))

function SammenligningVisning({ fra, til, info, aapneRisk }: { fra: Register; til: Register; info: SnapshotInfo; aapneRisk: (id: string) => void }) {
  const s = useMemo(() => sammenlign(fra, til), [fra, til])
  const [vis, setVis] = useState<'alle' | RiskEndring['type']>('alle')
  const antall = (t: RiskEndring['type']) => s.risker.filter((r) => r.type === t).length
  const rader: [string, number, number][] = [
    ['Åpne risker', s.fra.aapne, s.til.aapne],
    ['Lukkede risker', s.fra.lukkede, s.til.lukkede],
    ['Sum eksponering (åpne)', s.fra.eksponering, s.til.eksponering],
    ['Sum forventningsverdi (åpne)', s.fra.fv, s.til.fv],
  ]
  const synlige = s.risker.filter((r) => vis === 'alle' || r.type === vis)
  const naa = new Set(til.risker.map((r) => r.id))
  return (
    <div className="sammenligning">
      <table className="summer">
        <thead>
          <tr>
            <th />
            <th>{tid(info.tidspunkt)}</th>
            <th>Nå</th>
            <th>Endring</th>
          </tr>
        </thead>
        <tbody>
          {rader.map(([navn, a, b]) => (
            <tr key={navn}>
              <th>{navn}</th>
              <td>{fmt(a)}</td>
              <td>{fmt(b)}</td>
              <td>{diff(a, b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav className="faner">
        {(
          [
            ['alle', 'Alle endringer', s.risker.length],
            ['ny', 'Nye', antall('ny')],
            ['endret', 'Endrede', antall('endret')],
            ['fjernet', 'Slettede', antall('fjernet')],
          ] as const
        ).map(([k, t, n]) => (
          <button key={k} className={vis === k ? 'valgt' : ''} onClick={() => setVis(k)}>
            {t} <span className="teller">{n}</span>
          </button>
        ))}
      </nav>
      {s.risker.length === 0 && <p>Ingen endringer siden snapshotet ble tatt.</p>}
      {s.uendret > 0 && vis === 'alle' && <p className="liten">{s.uendret} risker er uendret.</p>}
      {synlige.map((r) => (
        <div key={r.risk.id} className={'endring-kort ' + r.type}>
          <div className="endring-topp">
            <span className="endring-merke">{TYPE[r.type]}</span>
            <b>Risk {r.risk.nr}</b> {r.risk.hendelse || r.risk.aarsak}
            {naa.has(r.risk.id) && (
              <button className="lenkeknapp" onClick={() => aapneRisk(r.risk.id)}>
                Vis risken
              </button>
            )}
          </div>
          {r.endringer.length > 0 && (
            <table className="endringer">
              <tbody>
                {r.endringer.map((e, i) => (
                  <tr key={i}>
                    <th>{e.felt}</th>
                    <td className="fra">{e.fra || '–'}</td>
                    <td className="pil">→</td>
                    <td className="til">{e.til || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
