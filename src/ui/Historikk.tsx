import { createContext, useEffect, useMemo, useState } from 'react'
import type { HistorikkPost } from '../historikk'
import { lagHistorikk } from '../historikk'
import type { Register } from '../model'
import type { RadHistorikk } from '../store/backend'
import { Modal, ModalTittel } from './Modal'

// Åpner historikken til en risk. null når registeret ikke har historikk (f.eks. et snapshot).
export const HistorikkKontekst = createContext<((riskId: string) => void) | null>(null)

const tid = (iso: string) =>
  new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Props {
  riskId: string
  doc: Register
  hent: (riskId: string) => Promise<RadHistorikk[]>
  lukk: () => void
}

export function HistorikkDialog({ riskId, doc, hent, lukk }: Props) {
  const [rader, setRader] = useState<RadHistorikk[] | null>(null)
  const [feil, setFeil] = useState('')
  const [vis, setVis] = useState<'alle' | 'risk' | 'tiltak'>('alle')
  const r = doc.risker.find((x) => x.id === riskId)

  useEffect(() => {
    let aktiv = true
    hent(riskId).then(
      (h) => aktiv && setRader(h),
      (e) => aktiv && setFeil(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      aktiv = false
    }
  }, [riskId, hent])

  const poster = useMemo(() => (rader ? lagHistorikk(rader, doc) : []), [rader, doc])
  const synlige = poster.filter((p) => vis === 'alle' || p.hva === vis)
  const antall = (h: HistorikkPost['hva']) => poster.filter((p) => p.hva === h).length

  return (
    <Modal className="bred historikk" lukk={lukk}>
      <header>
        <ModalTittel>Historikk for risk {r?.nr ?? ''}</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        {r && <p className="historikk-risk">{r.hendelse || r.aarsak || 'Uten navn'}</p>}
        {feil && <div className="banner feil">Klarte ikke å hente historikken. {feil}</div>}
        {!rader && !feil && (
          <p className="liten historikk-laster">
            <span className="spinner liten" aria-hidden="true" /> Henter historikk…
          </p>
        )}
        {rader && (
          <>
            <nav className="faner">
              {(
                [
                  ['alle', 'Alle', poster.length],
                  ['risk', 'Risken', antall('risk')],
                  ['tiltak', 'Tiltak', antall('tiltak')],
                ] as const
              ).map(([k, t, n]) => (
                <button key={k} className={vis === k ? 'valgt' : ''} aria-pressed={vis === k} onClick={() => setVis(k)}>
                  {t} <span className="teller">{n}</span>
                </button>
              ))}
            </nav>
            {synlige.length === 0 && <p>Ingen endringer å vise.</p>}
            <ol className="historikk-liste">
              {synlige.map((p, i) => (
                <li key={i} className={'historikk-post ' + p.hva}>
                  <div className="historikk-topp">
                    <span className={'historikk-merke ' + p.hva}>{p.hva === 'risk' ? 'Risk' : 'Tiltak'}</span>
                    <b>{p.av || 'Ukjent'}</b>
                    <span className="liten">{tid(p.tid)}</span>
                  </div>
                  {p.tiltak && p.type !== 'endret' && <div className="historikk-tiltak">«{p.tiltak}»</div>}
                  {p.tiltak && p.type === 'endret' && !p.endringer.some((e) => e.felt === 'Tiltak') && <div className="historikk-tiltak">«{p.tiltak}»</div>}
                  {p.type === 'opprettet' && <div className="liten">{p.hva === 'risk' ? 'Opprettet risken' : 'La til tiltaket'}</div>}
                  {p.type === 'eldste' && <div className="liten">Eldste lagrede utgave. Eldre endringer er ikke tatt vare på.</div>}
                  {p.endringer.length > 0 && (
                    <dl className="historikk-endringer">
                      {p.endringer.map((e) => (
                        <div key={e.felt}>
                          <dt>{e.felt}</dt>
                          <dd>
                            {e.fra ? <del>{e.fra}</del> : <span className="tom">tom</span>}
                            <span className="pil" aria-label="endret til">
                              →
                            </span>
                            {e.til ? <ins>{e.til}</ins> : <span className="tom">tom</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ol>
            <p className="liten">
              Historikken hentes fra versjonshistorikken i SharePoint-listene. Endringer i tiltak som senere er slettet, vises ikke. SharePoint tar vare på et begrenset
              antall utgaver per rad.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
