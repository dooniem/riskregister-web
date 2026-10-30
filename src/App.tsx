import { useEffect, useState } from 'react'
import type { AuthConfig } from './store/auth'
import { aktivKonto, hentConfig, initAuth, loggInn } from './store/auth'
import { demoBackend, demoFinnes } from './store/demoBackend'
import { ListeBackend, SnapshotBackend } from './store/listeBackend'
import { GraphLister } from './store/lister/graphLister'
import { Okt } from './sync'
import { RegisterView } from './ui/RegisterView'
import { Start, husk } from './ui/Start'
import type { Bruker } from './ops'
import { uid } from './model'

type Tilstand =
  | { t: 'laster'; tekst: string }
  | { t: 'start'; config: AuthConfig | null }
  | { t: 'hvem'; navn: string }
  | { t: 'register'; okt: Okt }
  | { t: 'feil'; tekst: string; loggInn?: boolean }

const params = new URLSearchParams(window.location.search)

function demoBruker(): Bruker | null {
  try {
    const b = sessionStorage.getItem('rr-demo-bruker')
    return b ? JSON.parse(b) : null
  } catch {
    return null
  }
}

export default function App() {
  const [tilstand, setTilstand] = useState<Tilstand>({ t: 'laster', tekst: 'Starter…' })
  const [konto, setKonto] = useState<{ navn: string; epost: string } | null>(null)

  // Åpner registeret, eller et snapshot av det hvis adressen har &snapshot=<id>
  const aapne = async (backend: ListeBackend, tittel: (doc: Okt['doc']) => string) => {
    const snapshotId = params.get('snapshot')
    if (snapshotId) {
      if (!backend.snapshots) throw new Error('Dette registeret har ikke snapshots.')
      setTilstand({ t: 'laster', tekst: 'Henter snapshotet…' })
      const { info, doc } = await backend.snapshots.hent(snapshotId)
      const okt = new Okt(new SnapshotBackend(backend, info, doc))
      await okt.start()
      return setTilstand({ t: 'register', okt })
    }
    const okt = new Okt(backend)
    await okt.start()
    husk(tittel(okt.doc))
    setTilstand({ t: 'register', okt })
  }

  const aapneDemo = async (navn: string, bruker: Bruker) => aapne(await demoBackend(navn, bruker), (doc) => `${doc.prosjekt.navn || navn} (demo)`)

  useEffect(() => {
    void (async () => {
      try {
        const demo = params.get('demo')
        if (demo) {
          if (params.has('ny')) {
            sessionStorage.removeItem('rr-demo-bruker')
            params.delete('ny')
            window.history.replaceState(null, '', '?' + params.toString())
          }
          if (!demoFinnes(demo)) return setTilstand({ t: 'feil', tekst: `Fant ikke demoregisteret «${demo}» i denne nettleseren.` })
          const b = demoBruker()
          if (!b) return setTilstand({ t: 'hvem', navn: demo })
          return await aapneDemo(demo, b)
        }
        const config = await hentConfig()
        if (config) {
          const k = await initAuth(config)
          if (k) setKonto({ navn: k.name ?? k.username, epost: k.username })
        }
        if (params.get('reg'))
          return setTilstand({
            t: 'feil',
            tekst: 'Lenken går til et register i en SharePoint-mappe (register.json). Registeret ligger nå i SharePoint-lister, ett register per område. Åpne området fra startsiden i stedet.',
          })
        const site = params.get('site')
        if (!site) return setTilstand({ t: 'start', config })
        if (!config) return setTilstand({ t: 'feil', tekst: 'SharePoint-tilkoblingen er ikke satt opp ennå (mangler appregistrering). Se Tilkoblingsinnstillinger på startsiden.' })
        const k = aktivKonto()
        if (!k) {
          // Første gang: send brukeren rett til Microsoft-innlogging, men bare én gang per fane
          if (!sessionStorage.getItem('rr-auto-login')) {
            sessionStorage.setItem('rr-auto-login', '1')
            setTilstand({ t: 'laster', tekst: 'Sender deg til Microsoft-innlogging…' })
            return await loggInn()
          }
          return setTilstand({ t: 'feil', tekst: 'Du må logge inn med Microsoft-kontoen din for å åpne registeret.', loggInn: true })
        }
        setTilstand({ t: 'laster', tekst: 'Åpner registeret fra SharePoint…' })
        const lager = await GraphLister.aapne(site)
        const backend = new ListeBackend(lager, { id: k.localAccountId || k.homeAccountId, navn: k.name ?? k.username })
        await aapne(backend, (doc) => doc.prosjekt.navn || backend.tittel)
      } catch (e) {
        setTilstand({ t: 'feil', tekst: e instanceof Error ? e.message : String(e) })
      }
    })()
  }, [])

  useEffect(() => {
    if (tilstand.t !== 'register') return
    const d = tilstand.okt.doc.prosjekt
    document.title = `${[d.nummer, d.navn].filter(Boolean).join(' ') || 'Riskregister'} – Riskregister`
    return () => tilstand.okt.stopp()
  }, [tilstand])

  const tilbake = () => {
    window.location.href = window.location.pathname
  }

  switch (tilstand.t) {
    case 'laster':
      return <div className="sentrert">{tilstand.tekst}</div>
    case 'start':
      return <Start config={tilstand.config} konto={konto} />
    case 'hvem':
      return <HvemErDu onValgt={(b) => void aapneDemo(tilstand.navn, b)} />
    case 'register':
      return <RegisterView okt={tilstand.okt} tilbake={tilbake} />
    case 'feil':
      return (
        <div className="sentrert">
          <div className="kort">
            <h2>Kunne ikke åpne registeret</h2>
            <p>{tilstand.tekst}</p>
            <div className="knapperad">
              {tilstand.loggInn && (
                <button className="knapp primær" onClick={() => void loggInn()}>
                  Logg inn med Microsoft
                </button>
              )}
              <button className="knapp" onClick={tilbake}>
                Til startsiden
              </button>
            </div>
          </div>
        </div>
      )
  }
}

// Demomodus: hver fane velger hvem den er, så flere faner kan opptre som ulike brukere
function HvemErDu({ onValgt }: { onValgt: (b: Bruker) => void }) {
  const [navn, setNavn] = useState('')
  const velg = (n: string) => {
    const b = { id: 'demo-' + uid().slice(0, 8), navn: n }
    try {
      sessionStorage.setItem('rr-demo-bruker', JSON.stringify(b))
    } catch {
      /* ignorer */
    }
    onValgt(b)
  }
  return (
    <div className="sentrert">
      <div className="kort">
        <h2>Hvem er du?</h2>
        <p>I demomodus velger hver nettleserfane et navn. Åpne registeret i flere faner med ulike navn for å se samtidig redigering.</p>
        <div className="knapperad">
          {['Magnus', 'Ola Hansen', 'Ingrid Berg', 'Per Larsen'].map((n) => (
            <button key={n} className="knapp" onClick={() => velg(n)}>
              {n}
            </button>
          ))}
        </div>
        <form
          className="knapperad"
          onSubmit={(e) => {
            e.preventDefault()
            if (navn.trim()) velg(navn.trim())
          }}
        >
          <input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Eller skriv et navn" autoFocus />
          <button className="knapp primær">Fortsett</button>
        </form>
      </div>
    </div>
  )
}
