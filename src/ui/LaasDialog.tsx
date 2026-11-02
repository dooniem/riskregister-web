import { useState } from 'react'
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
  })
}

// Verdien et <input type="datetime-local"> bruker: lokal tid uten tidssone, «2026-11-03T08:00»
const lokal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Forslaget er neste morgen kl. 08:00
function imorgen() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d
}

// Låser registeret for redigering. Tidspunktet er påkrevd, så registeret aldri blir låst for alltid.
export function LaasDialog({ lukk, laas }: { lukk: () => void; laas: (til: string) => void }) {
  const [til, setTil] = useState(() => lokal(imorgen()))
  const [feil, setFeil] = useState<string | null>(null)

  const bekreft = () => {
    const tid = new Date(til)
    if (!til || isNaN(tid.getTime())) return setFeil('Velg dato og klokkeslett for når registeret skal åpne igjen.')
    if (tid.getTime() <= Date.now()) return setFeil('Tidspunktet må være frem i tid.')
    laas(tid.toISOString())
  }

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
        <p>Ingen kan endre registeret mens det er låst, heller ikke du. Alle kan fortsatt lese, søke, skrive ut og eksportere. Du kan låse opp før tiden.</p>
        <label className="felt">
          <span>Åpner igjen</span>
          <input
            type="datetime-local"
            required
            autoFocus
            value={til}
            min={lokal(new Date())}
            onChange={(e) => (setTil(e.target.value), setFeil(null))}
          />
          <small>Registeret åpner av seg selv på dette tidspunktet.</small>
        </label>
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
