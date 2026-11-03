import { useState } from 'react'
import { LAAS_NEDTELLING_S, type Register } from '../model'
import type { LaasBrudd, Tilstede } from '../store/backend'
import { Modal, ModalTittel } from './Modal'

// Tidspunktet låsen går ut, f.eks. «tirsdag 3. november kl. 08:00». Året tas med når det ikke er i år.
export function visTid(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

const p2 = (n: number) => String(n).padStart(2, '0')
// Verdien et <input type="date"> bruker: «2026-11-03»
const datoVerdi = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

// Klokkeslettene i nedtrekkslisten, hvert kvarter med 24-timersklokke (et vanlig tidsfelt viser AM/PM i engelske nettlesere)
const KLOKKESLETT = Array.from({ length: 96 }, (_, i) => `${p2(Math.floor(i / 4))}:${p2((i % 4) * 15)}`)

// Forslaget er neste morgen kl. 08:00
function imorgen() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

// Låser registeret for redigering. Tidspunktet er påkrevd, så registeret aldri blir låst for alltid.
// Låsen trer i kraft etter en nedtelling, så de som er inne i registeret, rekker å fullføre.
export function LaasDialog({ lukk, laas, andre, doc }: { lukk: () => void; laas: (til: string) => void; andre: Tilstede[]; doc: Register }) {
  const [dato, setDato] = useState(() => datoVerdi(imorgen()))
  const [klokke, setKlokke] = useState('08:00')
  const [feil, setFeil] = useState<string | null>(null)

  const valgt = new Date(`${dato}T${klokke}`)
  const gyldig = dato && !isNaN(valgt.getTime()) ? valgt : null

  const bekreft = () => {
    const tid = new Date(`${dato}T${klokke}`)
    if (!dato || isNaN(tid.getTime())) return setFeil('Velg dato og klokkeslett for når registeret skal åpne igjen.')
    if (tid.getTime() <= Date.now() + LAAS_NEDTELLING_S * 1000) return setFeil('Tidspunktet må være frem i tid.')
    laas(tid.toISOString())
  }

  const nr = (riskId: string) => doc.risker.find((r) => r.id === riskId)?.nr

  return (
    <Modal className="laas-dialog" lukk={lukk}>
      <header>
        <ModalTittel>Lås riskregister</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <form
        className="modal-innhold skjema"
        onSubmit={(e) => {
          e.preventDefault()
          bekreft()
        }}
      >
        <p>
          Ingen kan endre registeret mens det er låst, heller ikke du. Alle kan fortsatt lese, søke, skrive ut og eksportere. Du kan låse opp før tiden.
        </p>
        <div className="felt">
          <span id="laas-aapner">Åpner igjen</span>
          <div className="laas-tid" role="group" aria-labelledby="laas-aapner">
            <input type="date" aria-label="Dato" required autoFocus value={dato} min={datoVerdi(new Date())} onChange={(e) => (setDato(e.target.value), setFeil(null))} />
            <select aria-label="Klokkeslett" value={klokke} onChange={(e) => (setKlokke(e.target.value), setFeil(null))}>
              {KLOKKESLETT.map((k) => (
                <option key={k} value={k}>
                  kl. {k}
                </option>
              ))}
            </select>
          </div>
          <small>
            {gyldig ? `Registeret åpner av seg selv ${visTid(gyldig.toISOString())}.` : 'Registeret åpner av seg selv på dette tidspunktet.'}
          </small>
        </div>
        <div className="laas-andre">
          {andre.length ? (
            <>
              <span>Inne i registeret nå:</span>
              <ul>
                {andre.map((t) => (
                  <li key={t.brukerId}>
                    {t.navn}
                    {t.laas && <b> redigerer risk {nr(t.laas.riskId) ?? ''} akkurat nå</b>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span>Ingen andre er inne i registeret nå.</span>
          )}
          <small>
            Låsen trer i kraft etter {LAAS_NEDTELLING_S} sekunder. Alle brukere vil se en nedtelling, så de rekker å fullføre det de holder på med. Du kan avbryte låsingen så lenge nedtellingen går.
          </small>
        </div>
        {feil && <div className="banner feil">{feil}</div>}
        <div className="knapperad">
          <button type="button" className="knapp" onClick={lukk}>
            Avbryt
          </button>
          <button type="submit" className="knapp primær">
            Lås riskregister
          </button>
        </div>
      </form>
    </Modal>
  )
}

type Brudd = LaasBrudd['endringer']

// Én linje som oppsummerer endringene, uansett hvor mange de er: «3 risker er endret direkte i SharePoint mens registeret er låst, av Per Larsen og Ola Hansen.»
export function bruddTekst(endringer: Brudd, tilstand: string) {
  const navn = [...new Set(endringer.map((e) => e.av).filter(Boolean))] as string[]
  const hvem = navn.length > 3 ? `${navn.slice(0, 3).join(', ')} og ${navn.length - 3} til` : navn.length > 1 ? `${navn.slice(0, -1).join(', ')} og ${navn.at(-1)}` : navn[0]
  const antall = endringer.length === 1 ? '1 risk er' : `${endringer.length} risker er`
  const hva = endringer.some((e) => e.hva === 'slettet') ? 'endret eller slettet' : 'endret'
  return `${antall} ${hva} direkte i SharePoint mens registeret ${tilstand}${hvem ? `, av ${hvem}` : ''}.`
}

const HVA = { risk: 'Risken endret', tiltak: 'Tiltak endret', slettet: 'Slettet' }

// Alle endringene som er gjort i SharePoint mens registeret var låst, én linje per risk, nyeste først
export function BruddDialog({ endringer, visHistorikk, lukk }: { endringer: Brudd; visHistorikk?: (riskId: string) => void; lukk: () => void }) {
  const tid = (iso?: string) => (iso ? new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '')
  return (
    <Modal className="brudd-dialog" lukk={lukk}>
      <header>
        <ModalTittel>Endret i SharePoint mens registeret var låst</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <p>
          Disse riskene er endret direkte i listene i SharePoint, utenfor appen. {visHistorikk && 'Åpne historikken for å se hva som ble endret.'} SharePoint lagrer ikke hvem
          som sletter en rad.
        </p>
        <table className="brudd-tabell">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Hva</th>
              <th>Av</th>
              <th>Når</th>
              {visHistorikk && <th />}
            </tr>
          </thead>
          <tbody>
            {endringer.map((e) => (
              <tr key={e.riskId}>
                <td>
                  <b>{e.nr}</b> {e.tittel}
                </td>
                <td>{HVA[e.hva]}</td>
                <td>{e.av ?? 'Ukjent'}</td>
                <td>{tid(e.tid)}</td>
                {visHistorikk && (
                  <td>
                    {e.hva !== 'slettet' && (
                      <button className="lenkeknapp" onClick={() => visHistorikk(e.riskId)}>
                        Historikk
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
