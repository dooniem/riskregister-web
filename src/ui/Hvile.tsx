import { useState } from 'react'
import type { HvileValg } from '../hvile'
import { omMnd, sjekkHvile, standardHvile, tilHvile } from '../hvile'
import type { Register, Risk } from '../model'
import { hvileTekst } from '../model'
import type { Op } from '../ops'
import { FaseVelger } from './FaseVelger'
import { Modal, ModalTittel } from './Modal'

// Velger for dato eller fase. Brukes både i Hvil-dialogen og i Bytt fase.
export function HvileFelt({ doc, verdi, sett }: { doc: Register; verdi: HvileValg; sett: (v: HvileValg) => void }) {
  // Bare fasene etter den prosjektet er i nå. En fase som er passert, ville aldri vekket risken.
  const alle = doc.lister.faser
  const naa = alle.indexOf(doc.prosjekt.fase)
  const faser = naa >= 0 ? alle.slice(naa + 1) : alle.filter((f) => f !== doc.prosjekt.fase)
  const ukjent = verdi.type === 'fase' && !!verdi.fase.trim() && !doc.lister.faser.includes(verdi.fase.trim())
  return (
    <div className="hvile-felt">
      <div className="segment" role="radiogroup" aria-label="Hvil til">
        {(['dato', 'fase'] as const).map((x) => (
          <button key={x} type="button" role="radio" aria-checked={verdi.type === x} className={verdi.type === x ? 'valgt' : ''} onClick={() => sett({ ...verdi, type: x })}>
            {x === 'dato' ? 'Til en dato' : 'Til en fase'}
          </button>
        ))}
      </div>
      {verdi.type === 'dato' ? (
        <div className="hvile-dato">
          <input type="date" aria-label="Våkner" value={verdi.til} min={omMnd(0)} onChange={(e) => sett({ ...verdi, til: e.target.value })} />
          {[1, 3, 6, 12].map((n) => (
            <button key={n} type="button" className={'knapp liten' + (verdi.til === omMnd(n) ? ' valgt' : '')} onClick={() => sett({ ...verdi, til: omMnd(n) })}>
              {n === 12 ? '1 år' : `${n} mnd`}
            </button>
          ))}
        </div>
      ) : (
        <>
          <FaseVelger faser={faser} verdi={verdi.fase} sett={(fase) => sett({ ...verdi, fase })} etikett="Fase" egetHint="Skriv fasenavnet" />
          <span className="liten">
            {ukjent
              ? `«${verdi.fase.trim()}» står ikke i fase-listen. Risken våkner bare hvis prosjektet byttes til akkurat dette navnet.`
              : !faser.length
              ? 'Prosjektet er i den siste fasen i fase-listen. Velg en dato, eller skriv et eget navn.'
              : 'Risken våkner når prosjektet bytter til fasen, med Mer › Bytt fase eller i prosjektinfo.'}
          </span>
        </>
      )}
    </div>
  )
}

interface Props {
  doc: Register
  risker: Risk[]
  endre: (...ops: Op[]) => void
  melding: (tekst: string) => void
  lukk: () => void
}

// Hvil til…: skjuler åpne risker fra Åpne frem til en dato eller en fase. Riskene er fortsatt åpne og ligger under Hviler.
export function HvileDialog({ doc, risker, endre, melding, lukk }: Props) {
  const [valg, setValg] = useState(() => standardHvile(doc))
  const [feil, setFeil] = useState('')
  const enkel = risker.length === 1
  const hvil = () => {
    const f = sjekkHvile(doc, valg)
    if (f) return setFeil(f)
    const h = tilHvile(valg)
    endre(...risker.map((r): Op => ({ t: 'setHvile', riskId: r.id, hvile: h, fra: doc.hviler?.[r.id] ?? null })))
    melding(`${enkel ? `Risk ${risker[0].nr} hviler` : `${risker.length} risker hviler`} til ${hvileTekst(h)} og ligger under «Hviler».`)
    lukk()
  }
  return (
    <Modal className="hvile-dialog" lukk={lukk}>
      <header>
        <ModalTittel>{enkel ? `Hvil risk ${risker[0].nr}` : `Hvil ${risker.length} risker`}</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold skjema">
        <p>
          {enkel ? 'Risken' : 'Riskene'} forsvinner fra Åpne og legges under Hviler til de våkner. De er fortsatt åpne, og er med i Alle og Til Skarisk. Når de våkner, merkes de «Våknet» i Åpne.
        </p>
        <HvileFelt doc={doc} verdi={valg} sett={(v) => (setValg(v), setFeil(''))} />
        {feil && <div className="banner feil">{feil}</div>}
        <div className="knapperad">
          <button className="knapp" onClick={lukk}>
            Avbryt
          </button>
          <button className="knapp primær" onClick={hvil}>
            {enkel ? 'Hvil risken' : `Hvil ${risker.length} risker`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
