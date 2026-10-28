import { useState } from 'react'
import type { KopiValg, Register } from '../model'
import { kopierRegister, nyttRegister } from '../model'
import { appUrl } from '../store/auth'
import { demoFinnes, opprettDemo } from '../store/demoBackend'
import { appLenke, opprettRegisterISharePoint } from '../store/graphBackend'

interface Props {
  kilde?: Register // registeret det kopieres fra, eller et importert register
  importert?: boolean
  backendType: 'demo' | 'sharepoint'
  lukk: () => void
}

// Oppretter et nytt register, tomt eller som kopi av et eksisterende (valgfritt hva som følger med)
export function NyttRegisterDialog({ kilde, importert, backendType, lukk }: Props) {
  const [navn, setNavn] = useState(importert ? kilde?.prosjekt.navn ?? '' : '')
  const [mappe, setMappe] = useState('')
  const [mappenavn, setMappenavn] = useState('Riskregister')
  const [hvor, setHvor] = useState<'demo' | 'sharepoint'>(backendType)
  const [behold, setBehold] = useState<KopiValg['behold']>({
    lister: true,
    prosjektinfo: !!importert,
    deltakere: !!importert,
    risker: !!importert,
    lukkede: !!importert,
  })
  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState('')
  const [ferdig, setFerdig] = useState<{ lenke: string; nettside?: string } | null>(null)

  const opprett = async () => {
    setFeil('')
    if (!navn.trim()) return setFeil('Gi registeret et navn.')
    const doc = kilde ? kopierRegister(kilde, { navn: navn.trim(), behold }) : nyttRegister(navn.trim())
    if (importert && kilde) doc.prosjekt = { ...doc.prosjekt, nummer: behold.prosjektinfo ? kilde.prosjekt.nummer : '' }
    setJobber(true)
    try {
      if (hvor === 'demo') {
        let n = navn.trim()
        for (let i = 2; demoFinnes(n); i++) n = `${navn.trim()} (${i})`
        opprettDemo(n, doc)
        setFerdig({ lenke: `${appUrl()}?demo=${encodeURIComponent(n)}` })
      } else {
        if (!mappe.trim()) throw new Error('Lim inn lenken til mappen i SharePoint der registeret skal ligge.')
        const p = await opprettRegisterISharePoint(mappe.trim(), mappenavn.trim() || 'Riskregister', doc)
        setFerdig({ lenke: appLenke(p), nettside: p.webUrl })
      }
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setJobber(false)
    }
  }

  const avkrysning = (k: keyof KopiValg['behold'], t: string, hint?: string) => (
    <label className="avkrysning">
      <input type="checkbox" checked={behold[k]} onChange={(e) => setBehold((b) => ({ ...b, [k]: e.target.checked }))} />
      <span>
        {t}
        {hint && <small> {hint}</small>}
      </span>
    </label>
  )

  return (
    <div className="modal-bakgrunn" onMouseDown={(e) => e.target === e.currentTarget && lukk()}>
      <div className="modal">
        <header>
          <h2>{importert ? 'Importer fra Excel' : kilde ? 'Lag nytt register fra dette' : 'Nytt register'}</h2>
          <button className="ikonknapp" onClick={lukk}>
            ✕
          </button>
        </header>
        {ferdig ? (
          <div className="modal-innhold">
            <p>Registeret er opprettet.</p>
            {ferdig.nettside && (
              <p>
                Mappen i SharePoint:{' '}
                <a href={ferdig.nettside} target="_blank" rel="noreferrer">
                  {ferdig.nettside}
                </a>
                . Der ligger også snarveien «Åpne Riskregister».
              </p>
            )}
            <label className="felt">
              <span>Lenke som åpner registeret (kan legges på prosjektsiden)</span>
              <input readOnly value={ferdig.lenke} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="knapperad">
              <button className="knapp" onClick={() => void navigator.clipboard.writeText(ferdig.lenke)}>
                Kopier lenke
              </button>
              <a className="knapp primær" href={ferdig.lenke}>
                Åpne registeret
              </a>
            </div>
          </div>
        ) : (
          <div className="modal-innhold skjema">
            <label className="felt">
              <span>Prosjektnavn</span>
              <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. Nytt kontorbygg Bjørvika" />
            </label>
            <div className="felt">
              <span>Hvor skal registeret ligge?</span>
              <label className="avkrysning">
                <input type="radio" checked={hvor === 'sharepoint'} onChange={() => setHvor('sharepoint')} />
                <span>I en mappe i prosjektets SharePoint (tilgangen styres av SharePoint)</span>
              </label>
              <label className="avkrysning">
                <input type="radio" checked={hvor === 'demo'} onChange={() => setHvor('demo')} />
                <span>Demo i denne nettleseren (for testing uten SharePoint)</span>
              </label>
            </div>
            {hvor === 'sharepoint' && (
              <>
                <label className="felt">
                  <span>Lenke til mappen i SharePoint der registeret skal opprettes</span>
                  <input value={mappe} onChange={(e) => setMappe(e.target.value)} placeholder="https://firma.sharepoint.com/sites/Prosjekt123/Delte dokumenter/…" />
                  <small>Åpne mappen i SharePoint og kopier adressen, eller bruk «Kopier lenke». Du må ha skrivetilgang. Registeret får sin egen nye mappe her, for det kan bare være ett register per mappe.</small>
                </label>
                <label className="felt">
                  <span>Navn på ny mappe</span>
                  <input value={mappenavn} onChange={(e) => setMappenavn(e.target.value)} />
                </label>
              </>
            )}
            {kilde && (
              <div className="felt">
                <span>Hva skal følge med fra «{kilde.prosjekt.navn || 'registeret'}»?</span>
                {avkrysning('lister', 'Kategorier og egne nedtrekkslister')}
                {avkrysning('prosjektinfo', 'Prosjektinfo', '(eier, sjef, leder, fase)')}
                {avkrysning('deltakere', 'Deltakere')}
                {avkrysning('risker', 'Risker og tiltak', '(får nye ID-er og nummereres fra 1)')}
                {behold.risker && avkrysning('lukkede', 'Også lukkede risker')}
              </div>
            )}
            {feil && <div className="banner feil">{feil}</div>}
            <div className="knapperad">
              <button className="knapp" onClick={lukk}>
                Avbryt
              </button>
              <button className="knapp primær" disabled={jobber} onClick={() => void opprett()}>
                {jobber ? 'Oppretter…' : 'Opprett register'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
