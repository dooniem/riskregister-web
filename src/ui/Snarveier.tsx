import { Fragment } from 'react'
import { Modal, ModalTittel } from './Modal'

// Oversikten over tastatursnarveiene. Åpnes med ? (utenfor tekstfelt).
const GRUPPER: [string, [string[], string][]][] = [
  [
    'Overalt',
    [
      [['/'], 'Gå til søkefeltet'],
      [['Alt', 'N'], 'Ny risk'],
      [['?'], 'Vis denne oversikten'],
    ],
  ],
  [
    'I søkefeltet',
    [
      [['Enter'], 'Gå til første treff i tabellen'],
      [['Esc'], 'Tøm søket (trykk igjen for å gå ut av feltet)'],
    ],
  ],
  [
    'I tabellen',
    [
      [['Piltaster'], 'Flytt mellom cellene (Tab og Shift+Tab bortover)'],
      [['Enter'], 'Rediger cellen (eller begynn å skrive)'],
      [['Ctrl', 'Enter'], 'Nytt tiltak under'],
      [['Alt', '↓'], 'Åpne listen i en nedtrekkscelle'],
      [['Delete'], 'Tøm cellen'],
      [['Ctrl', 'C'], 'Kopier, og Ctrl+V for å lime inn'],
      [['Ctrl', 'Z'], 'Angre'],
      [['Esc'], 'Avbryt redigering'],
    ],
  ],
]

export function SnarveierDialog({ lukk }: { lukk: () => void }) {
  return (
    <Modal className="snarveier" lukk={lukk}>
      <header>
        <ModalTittel>Tastatursnarveier</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        {GRUPPER.map(([tittel, rader]) => (
          <section key={tittel}>
            <h3>{tittel}</h3>
            <dl className="snarvei-liste">
              {rader.map(([taster, tekst]) => (
                <Fragment key={tekst}>
                  <dt>
                    {taster.map((t, i) => (
                      <Fragment key={t}>
                        {i > 0 && '+'}
                        <kbd>{t}</kbd>
                      </Fragment>
                    ))}
                  </dt>
                  <dd>{tekst}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
