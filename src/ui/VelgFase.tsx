import { useState } from 'react'
import type { Register } from '../model'
import type { Op } from '../ops'

// Registre uten prosjektfase (f.eks. lister IT har laget, eller registre fra før fasen ble valgt ved oppretting):
// den første som kan skrive, blir bedt om å velge fasen. Fasen settes direkte, uten fasebytte og snapshot.
export function VelgFaseBanner({ doc, endre }: { doc: Register; endre: (...ops: Op[]) => void }) {
  const faser = doc.lister.faser
  const [fase, setFase] = useState(faser[0] ?? '')
  const [senere, setSenere] = useState(() => {
    try {
      return sessionStorage.getItem(`rr-fase-senere:${doc.registerId}`) === '1'
    } catch {
      return false
    }
  })
  if (senere || doc.prosjekt.fase || !faser.length) return null
  const utsett = () => {
    setSenere(true)
    try {
      sessionStorage.setItem(`rr-fase-senere:${doc.registerId}`, '1')
    } catch {
      /* ignorer */
    }
  }
  return (
    <div className="banner info velg-fase" role="status">
      <span>Hvilken fase er prosjektet i? Fasen brukes når risker lukkes, hviler til en fase og ved «Bytt fase».</span>
      <select aria-label="Prosjektfase" value={fase} onChange={(e) => setFase(e.target.value)}>
        {faser.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <button className="knapp primær" disabled={!fase} onClick={() => endre({ t: 'setProsjekt', felt: 'fase', verdi: fase })}>
        Sett fase
      </button>
      <button className="lenkeknapp" onClick={utsett}>
        Senere
      </button>
    </div>
  )
}
