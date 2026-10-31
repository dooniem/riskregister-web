import { useEffect, useState } from 'react'
import type { Element, ListeLager } from '../store/lister/lager'
import type { ListeNavn } from '../store/lister/skjema'
import { LISTER } from '../store/lister/skjema'
import { Modal, ModalTittel } from './Modal'

const kort = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

// Viser radene i listene slik de ligger i SharePoint (eller i liksomlistene i demomodus). Til testing og feilsøking.
export function RaadataDialog({ lager, lukk }: { lager: ListeLager; lukk: () => void }) {
  const lister = (Object.keys(LISTER) as ListeNavn[]).filter((l) => lager.har(l))
  const [liste, setListe] = useState<ListeNavn>('risker')
  const [rader, setRader] = useState<Element[] | null>(null)
  const [feil, setFeil] = useState('')

  useEffect(() => {
    let aktiv = true
    setRader(null)
    setFeil('')
    lager
      .hentAlle(liste)
      .then((r) => aktiv && setRader(r))
      .catch((e) => aktiv && setFeil(e instanceof Error ? e.message : String(e)))
    return () => {
      aktiv = false
    }
  }, [lager, liste])

  const kolonner = ['Title', ...LISTER[liste].kolonner.map((k) => k.navn)]
  const url = lager.listeUrl?.(liste)
  return (
    <Modal className="bred" lukk={lukk}>
      <header>
        <ModalTittel>Rådata i listene</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <nav className="faner">
          {lister.map((l) => (
            <button key={l} className={l === liste ? 'valgt' : ''} onClick={() => setListe(l)}>
              {LISTER[l].visningsnavn.replace(/^Riskregister /, '')}
            </button>
          ))}
        </nav>
        <p className="liten">
          {LISTER[liste].visningsnavn}: {LISTER[liste].beskrivelse}{' '}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              Åpne listen i SharePoint
            </a>
          ) : (
            lager.type === 'demo' && 'I demomodus ligger listene i nettleseren.'
          )}
        </p>
        {feil && <div className="banner feil">{feil}</div>}
        {!rader && !feil && <p>Henter…</p>}
        {rader && (
          <div className="raadata">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {kolonner.map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                  <th>Endret</th>
                  <th>Endret av</th>
                </tr>
              </thead>
              <tbody>
                {rader.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    {kolonner.map((k) => (
                      <td key={k} title={String(r.felt[k] ?? '')}>
                        {kort(r.felt[k])}
                      </td>
                    ))}
                    <td>{r.endret ? new Date(r.endret).toLocaleString('nb-NO') : ''}</td>
                    <td>{r.endretAv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="liten">{rader.length} rader</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
