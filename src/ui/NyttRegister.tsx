import { useState } from 'react'
import type { KopiValg, Register } from '../model'
import type { PrefixValg } from '../model'
import { brukPrefixValg, kopierRegister, nyttRegister } from '../model'
import { appUrl } from '../store/auth'
import { demoFinnes, opprettDemo } from '../store/demoBackend'
import { skrivNyttRegister } from '../store/listeBackend'
import { GraphLister, erRotomraade, omraadeLenke } from '../store/lister/graphLister'
import { LISTER } from '../store/lister/skjema'
import { DelregisterValg } from './ImportDialog'

interface Props {
  kilde?: Register // registeret det kopieres fra, eller et importert register
  importert?: boolean
  filnavn?: string // Excel-filen et importert register kom fra
  backendType: 'demo' | 'sharepoint'
  lukk: () => void
}

// Oppretter et nytt register, tomt eller som kopi av et eksisterende (valgfritt hva som følger med)
export function NyttRegisterDialog({ kilde, importert, filnavn, backendType, lukk }: Props) {
  const [navn, setNavn] = useState(importert ? kilde?.prosjekt.navn ?? '' : '')
  const [omraade, setOmraade] = useState('')
  const [hvor, setHvor] = useState<'demo' | 'sharepoint'>(backendType)
  const [behold, setBehold] = useState<KopiValg['behold']>({
    lister: true,
    prosjektinfo: !!importert,
    deltakere: !!importert,
    risker: !!importert,
    lukkede: !!importert,
  })
  const [prefix, setPrefix] = useState<PrefixValg>('behold')
  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState('')
  const [ferdig, setFerdig] = useState<{ lenke: string; nettside?: string } | null>(null)

  const opprett = async () => {
    setFeil('')
    if (!navn.trim()) return setFeil('Gi registeret et navn.')
    const fra = kilde && importert ? { ...kilde, risker: brukPrefixValg(kilde.risker, prefix, filnavn ?? kilde.prosjekt.navn) } : kilde
    const doc = fra ? kopierRegister(fra, { navn: navn.trim(), behold }) : nyttRegister(navn.trim())
    if (importert && kilde) doc.prosjekt = { ...doc.prosjekt, nummer: behold.prosjektinfo ? kilde.prosjekt.nummer : '' }
    setJobber(true)
    try {
      if (hvor === 'demo') {
        let n = navn.trim()
        for (let i = 2; demoFinnes(n); i++) n = `${navn.trim()} (${i})`
        await opprettDemo(n, doc)
        setFerdig({ lenke: `${appUrl()}?demo=${encodeURIComponent(n)}` })
      } else {
        if (!omraade.trim()) throw new Error('Lim inn adressen til SharePoint-området der registeret skal ligge.')
        if (erRotomraade(omraade.trim()) && !confirm('Dette er rotområdet, altså startsiden for hele SharePoint, ikke et prosjektområde. Prosjektområder har adresser som …sharepoint.com/sites/Prosjektnavn.\n\nVil du likevel sette opp registeret her?'))
          return
        const lager = await GraphLister.opprett(omraade.trim())
        await skrivNyttRegister(lager, doc)
        setFerdig({ lenke: omraadeLenke(lager.webUrl), nettside: lager.webUrl })
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
                Området i SharePoint:{' '}
                <a href={ferdig.nettside} target="_blank" rel="noreferrer">
                  {ferdig.nettside}
                </a>
                . Listene ligger under Områdeinnhold. Legg gjerne lenken nedenfor i navigasjonen på området, så finner alle registeret.
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
                <span>På prosjektets SharePoint-område (tilgangen styres av området)</span>
              </label>
              <label className="avkrysning">
                <input type="radio" checked={hvor === 'demo'} onChange={() => setHvor('demo')} />
                <span>Demo i denne nettleseren (for testing uten SharePoint)</span>
              </label>
            </div>
            {hvor === 'sharepoint' && (
              <label className="felt">
                <span>Adressen til SharePoint-området</span>
                <input value={omraade} onChange={(e) => setOmraade(e.target.value)} placeholder="https://firma.sharepoint.com/sites/Prosjekt123" />
                <small>
                  Det kan være ett riskregister per område. Appen lager listene {Object.values(LISTER).map((l) => `«${l.visningsnavn}»`).join(', ')}. Du må være eier av
                  området.
                </small>
              </label>
            )}
            {kilde && (
              <div className="felt">
                <span>Hva skal følge med fra «{kilde.prosjekt.navn || 'registeret'}»?</span>
                {avkrysning('lister', 'Kategorier og egne nedtrekkslister')}
                {avkrysning('prosjektinfo', 'Prosjektinfo', '(eier, sjef, leder, fase)')}
                {avkrysning('deltakere', 'Deltakere')}
                {avkrysning('risker', 'Risker og tiltak', '(får nye ID-er og nummereres fra 1)')}
                {behold.risker && avkrysning('lukkede', 'Også lukkede risker')}
                {behold.risker && importert && kilde.risker.length > 0 && <DelregisterValg risker={kilde.risker} filnavn={filnavn ?? kilde.prosjekt.navn} valg={prefix} setValg={setPrefix} />}
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
