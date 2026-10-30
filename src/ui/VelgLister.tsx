import { useState } from 'react'
import type { ListerMangler } from '../store/lister/graphLister'
import { GraphLister } from '../store/lister/graphLister'
import { LISTER } from '../store/lister/skjema'

// Når Risker eller Tiltak ikke finnes med standardnavnet: vis listene på området og la brukeren velge hvilke appen skal bruke
export function VelgLister({ feil, aapnet, tilbake }: { feil: ListerMangler; aapnet: (lager: GraphLister) => Promise<void>; tilbake: () => void }) {
  const forslag = (n: 'risker' | 'tiltak') => feil.funnet[n] ?? (feil.lister.filter((k) => k.passer[n]).length === 1 ? feil.lister.find((k) => k.passer[n])!.id : '')
  const [valg, setValg] = useState({ risker: forslag('risker'), tiltak: forslag('tiltak') })
  const [jobber, setJobber] = useState(false)
  const [melding, setMelding] = useState('')
  const andre = feil.lister.filter((k) => !k.passer.risker && !k.passer.tiltak)

  const bruk = async () => {
    setJobber(true)
    setMelding('')
    try {
      await aapnet(await GraphLister.velgLister(feil.omraade, valg))
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e))
      setJobber(false)
    }
  }

  const velger = (n: 'risker' | 'tiltak') => {
    const passer = feil.lister.filter((k) => k.passer[n])
    return (
      <label className="felt">
        <span>Liste som skal brukes for {n === 'risker' ? 'risker' : 'tiltak'}</span>
        <select value={valg[n]} onChange={(e) => setValg({ ...valg, [n]: e.target.value })} disabled={!passer.length}>
          {!valg[n] && <option value="">{passer.length ? 'Velg en liste' : 'Ingen lister passer'}</option>}
          {passer.map((k) => (
            <option key={k.id} value={k.id}>
              {k.navn}
            </option>
          ))}
        </select>
        {feil.mangler.includes(n) ? (
          <small>Standardnavnet er «{LISTER[n].visningsnavn}», som ikke finnes. Bare lister med kolonnene {n === 'risker' ? 'RiskId' : 'RiskId og TiltakId'} kan velges.</small>
        ) : (
          <small>Funnet med standardnavnet «{LISTER[n].visningsnavn}».</small>
        )}
      </label>
    )
  }

  return (
    <div className="sentrert">
      <div className="kort velglister">
        <h2>Fant ikke listene for registeret</h2>
        <p>{feil.message} Velg hvilke lister appen skal bruke. Valget lagres på området, så det gjelder for alle, også om listene får nytt navn senere.</p>
        <div className="skjema">
          {velger('risker')}
          {velger('tiltak')}
        </div>
        {andre.length > 0 && (
          <details>
            <summary className="liten">Andre lister på området ({andre.length}), som ikke har kolonnene registeret trenger</summary>
            <ul className="liten">
              {andre.map((k) => (
                <li key={k.id}>
                  <a href={k.webUrl} target="_blank" rel="noreferrer">
                    {k.navn}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
        {melding && <div className="banner feil">{melding}</div>}
        <div className="knapperad">
          <button className="knapp primær" disabled={jobber || !valg.risker || !valg.tiltak || valg.risker === valg.tiltak} onClick={() => void bruk()}>
            {jobber ? 'Åpner…' : 'Bruk disse listene'}
          </button>
          <button className="knapp" onClick={tilbake}>
            Til startsiden
          </button>
        </div>
      </div>
    </div>
  )
}
