import { useState } from 'react'

const EGET = '\u0000eget'

// Rullegardin med fasene, og «Eget navn…» som viser et tekstfelt.
// Erstatter <input list>, som bare viste forslag som passet med det som allerede sto i feltet (altså én fase).
export function FaseVelger({ faser, verdi, sett, etikett, egetHint }: { faser: string[]; verdi: string; sett: (v: string) => void; etikett: string; egetHint: string }) {
  const [eget, setEget] = useState(() => !!verdi.trim() && !faser.includes(verdi.trim()))
  return (
    <div className="fase-velger">
      <select
        aria-label={etikett}
        value={eget ? EGET : faser.includes(verdi) ? verdi : ''}
        onChange={(e) => {
          if (e.target.value === EGET) {
            setEget(true)
            sett('')
          } else {
            setEget(false)
            sett(e.target.value)
          }
        }}
      >
        {!eget && !faser.includes(verdi) && (
          <option value="" disabled>
            Velg fase
          </option>
        )}
        {faser.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
        <option value={EGET}>Eget navn…</option>
      </select>
      {eget && <input autoFocus aria-label={`${etikett}, eget navn`} value={verdi} onChange={(e) => sett(e.target.value)} placeholder={egetHint} />}
    </div>
  )
}
