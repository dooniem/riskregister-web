import { useEffect, useState } from 'react'
import { eksempelRegister } from '../eksempel'
import { lesExcel } from '../excel'
import type { Register } from '../model'
import type { AuthConfig, ConfigKilde, Tillatelse } from '../store/auth'
import { lagreConfig, loggInn, loggUt, redirectUri } from '../store/auth'
import { demoRegistre, opprettDemo, slettDemo, demoFinnes } from '../store/demoBackend'
import { DemoFiler } from '../store/filer'
import { GraphFiler } from '../store/graphFiler'
import type { Omraade } from '../store/lister/graphLister'
import { omraadeLenke, sokOmraader } from '../store/lister/graphLister'
import { Filvelger } from './Filvelger'
import { NyttRegisterDialog } from './NyttRegister'

const DOKUMENTASJON = 'https://github.com/dooniem/riskregister-web/blob/main/docs/'

export interface Nylig {
  tittel: string
  url: string
  tid: number
}

export function lesNylige(): Nylig[] {
  try {
    return JSON.parse(localStorage.getItem('rr-nylig') || '[]')
  } catch {
    return []
  }
}

export function husk(tittel: string) {
  try {
    const url = window.location.href
    const liste = [{ tittel, url, tid: Date.now() }, ...lesNylige().filter((n) => n.url !== url)].slice(0, 12)
    localStorage.setItem('rr-nylig', JSON.stringify(liste))
  } catch {
    /* ignorer */
  }
}

interface Props {
  config: AuthConfig | null
  konto: { navn: string; epost: string } | null
}

const KILDE: Record<ConfigKilde, string> = {
  nettleser: 'lagt inn i denne nettleseren (testoppsett)',
  bygg: 'bygget inn i appen',
  fil: 'fra config.json',
}

export function Start({ config, konto }: Props) {
  const [omraade, setOmraade] = useState('')
  const [demoer, setDemoer] = useState(demoRegistre())
  const [ny, setNy] = useState<null | { kilde?: Register; importert?: boolean; filnavn?: string; type: 'demo' | 'sharepoint' }>(null)
  const [visOppsett, setVisOppsett] = useState(!config)
  const [importFra, setImportFra] = useState<null | 'demo' | 'sharepoint'>(null)
  const nylige = lesNylige()

  useEffect(() => {
    const h = () => setDemoer(demoRegistre())
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  const lagEksempel = async () => {
    let n = 'Demo – Nytt kontorbygg'
    for (let i = 2; demoFinnes(n); i++) n = `Demo – Nytt kontorbygg (${i})`
    await opprettDemo(n, eksempelRegister(n))
    window.location.search = '?demo=' + encodeURIComponent(n)
  }

  const klar = !!config && !!konto

  return (
    <div className="startside">
      <header className="start-topp">
        <h1>Riskregister</h1>
        <div className="konto">
          {konto ? (
            <>
              Logget inn som <strong>{konto.navn}</strong>
              <button className="lenkeknapp" onClick={() => void loggUt()}>
                Logg ut
              </button>
            </>
          ) : config ? (
            <button className="knapp" onClick={() => void loggInn()}>
              Logg inn med Microsoft
            </button>
          ) : null}
        </div>
      </header>

      <main className="start-innhold">
        <section className="kort stort">
          <h2>Riskregister i SharePoint</h2>
          <p>
            Hvert prosjekt har sitt riskregister på sitt eget SharePoint-område, lagret i SharePoint-lister. Tilgangen styres av området: du får bare åpnet og endret
            registre på områder du selv har tilgang til.
          </p>
          {!klar && <KomIGang config={config} konto={konto} />}
          <form
            className="knapperad"
            onSubmit={(e) => {
              e.preventDefault()
              if (omraade.trim()) window.location.search = '?site=' + encodeURIComponent(omraade.trim())
            }}
          >
            <input
              className="vid"
              value={omraade}
              onChange={(e) => setOmraade(e.target.value)}
              placeholder="Adressen til området, f.eks. https://firma.sharepoint.com/sites/Prosjekt123"
              disabled={!klar}
            />
            <button className="knapp primær" disabled={!klar || !omraade.trim()}>
              Åpne register
            </button>
          </form>
          {klar && config?.tillatelse !== 'sites' && <OmraadeSok />}
          <div className="knapperad">
            <button className="knapp" disabled={!klar} onClick={() => setNy({ type: 'sharepoint' })}>
              Sett opp riskregister på et område
            </button>
            <button className="knapp" disabled={!klar} onClick={() => setImportFra('sharepoint')}>
              Nytt register fra Excel…
            </button>
            <button className="lenkeknapp" onClick={() => setVisOppsett(!visOppsett)}>
              Tilkoblingsinnstillinger
            </button>
          </div>
          {config && (
            <p className="liten">
              Tilkobling: tenant <code>{config.tenantId}</code>, {KILDE[config.kilde ?? 'fil']}.
            </p>
          )}
          {visOppsett && <Oppsett config={config} />}
        </section>

        {nylige.length > 0 && (
          <section className="kort">
            <h2>Sist åpnet</h2>
            <ul className="liste">
              {nylige.map((n) => (
                <li key={n.url}>
                  <a href={n.url}>{n.tittel}</a>
                  <span className="liten"> {new Date(n.tid).toLocaleDateString('nb-NO')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="kort">
          <h2>Demo uten SharePoint</h2>
          <p>
            Registrene lagres bare i denne nettleseren, i liksomlister som oppfører seg som SharePoint-listene. Åpne samme register i flere faner for å se hvordan flere
            brukere jobber samtidig, med tilstedeværelse og låsing av risker. Under Mer › Vis rådata ser du listene slik de ville sett ut i SharePoint.
          </p>
          <div className="knapperad">
            <button className="knapp primær" onClick={() => void lagEksempel()}>
              Lag demoregister med eksempeldata
            </button>
            <button className="knapp" onClick={() => setNy({ type: 'demo' })}>
              Nytt tomt register
            </button>
            <button className="knapp" onClick={() => setImportFra('demo')}>
              Importer fra Excel (.xlsm)…
            </button>
          </div>
          {demoer.length > 0 && (
            <ul className="liste">
              {demoer.map((d) => (
                <li key={d}>
                  <a href={'?demo=' + encodeURIComponent(d)}>{d}</a>
                  <button
                    className="lenkeknapp fare"
                    onClick={() => {
                      if (confirm(`Slette demoregisteret «${d}»?`)) {
                        slettDemo(d)
                        setDemoer(demoRegistre())
                      }
                    }}
                  >
                    Slett
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {importFra && (
        <Filvelger
          modus="aapne"
          kilde={importFra === 'demo' ? new DemoFiler() : null}
          lagKilde={importFra === 'sharepoint' && konto ? (l) => GraphFiler.fraLenke(l) : undefined}
          valgt={(filnavn, data) => {
            setNy({ kilde: lesExcel(data, filnavn), importert: true, filnavn, type: importFra })
            setImportFra(null)
          }}
          lukk={() => setImportFra(null)}
        />
      )}
      {ny && <NyttRegisterDialog kilde={ny.kilde} importert={ny.importert} filnavn={ny.filnavn} backendType={ny.type} lukk={() => (setNy(null), setDemoer(demoRegistre()))} />}
    </div>
  )
}

// Hva som mangler før SharePoint kan brukes
function KomIGang({ config, konto }: Props) {
  return (
    <div className="banner info kom-i-gang">
      <ol>
        <li className={config ? 'ferdig' : ''}>
          <b>Koble appen til Microsoft 365.</b> Krever en appregistrering i Entra ID (se{' '}
          <a href={DOKUMENTASJON + 'Testmiljo.md'} target="_blank" rel="noreferrer">
            veiledningen for testmiljø
          </a>{' '}
          eller{' '}
          <a href={DOKUMENTASJON + 'IT-oppsett.md'} target="_blank" rel="noreferrer">
            oppsett hos IT
          </a>
          ). Fyll inn verdiene under Tilkoblingsinnstillinger.
        </li>
        <li className={konto ? 'ferdig' : ''}>
          <b>Logg inn</b> med Microsoft-kontoen i samme organisasjon (tenant).
          {config && !konto && (
            <button className="knapp liten" onClick={() => void loggInn()}>
              Logg inn
            </button>
          )}
        </li>
        <li>
          <b>Åpne eller sett opp registeret</b> på prosjektets SharePoint-område. Første gang lager appen listene registeret trenger.
        </li>
      </ol>
      <span className="liten">Til da kan du bruke demomodus nedenfor.</span>
    </div>
  )
}

// Søk etter SharePoint-områder brukeren har tilgang til
function OmraadeSok() {
  const [tekst, setTekst] = useState('')
  const [treff, setTreff] = useState<Omraade[] | null>(null)
  const [feil, setFeil] = useState('')
  const sok = async () => {
    setFeil('')
    try {
      setTreff(await sokOmraader(tekst.trim()))
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <details className="omraadesok">
      <summary>Finn området i stedet for å lime inn adressen</summary>
      <form
        className="knapperad"
        onSubmit={(e) => {
          e.preventDefault()
          void sok()
        }}
      >
        <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Navn på området, eller tomt for alle" className="omraadesok-felt" />
        <button className="knapp">Søk</button>
      </form>
      {feil && <div className="banner feil">{feil}</div>}
      {treff && (
        <ul className="liste">
          {treff.length === 0 && <li>Fant ingen områder.</li>}
          {treff.map((o) => (
            <li key={o.id}>
              <a href={omraadeLenke(o.webUrl)}>{o.navn}</a>
              <span className="liten">{o.webUrl.replace(/^https:\/\//, '')}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function Oppsett({ config }: { config: AuthConfig | null }) {
  const [clientId, setClientId] = useState(config?.clientId ?? '')
  const [tenantId, setTenantId] = useState(config?.tenantId ?? '')
  const [tillatelse, setTillatelse] = useState<Tillatelse>(config?.tillatelse ?? 'manage')
  return (
    <div className="oppsett">
      <p className="liten">
        Fylles ut med verdiene fra appregistreringen i Entra ID. Det du legger inn her, lagres bare i denne nettleseren og overstyrer det som er bygget inn i appen.
        Det er ment for testing, f.eks. mot en egen test-tenant. I drift legges verdiene inn ved bygging (repo-variablene <code>AZURE_CLIENT_ID</code> og{' '}
        <code>AZURE_TENANT_ID</code>) eller i <code>config.json</code>, slik at brukerne slipper dette.
      </p>
      <p className="liten">
        Omdirigerings-URI som må registreres (plattform «Single-page application»): <code>{redirectUri()}</code>
      </p>
      <label className="felt">
        <span>Application (client) ID</span>
        <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} />
      </label>
      <label className="felt">
        <span>Directory (tenant) ID</span>
        <input value={tenantId} onChange={(e) => setTenantId(e.target.value.trim())} />
      </label>
      {/* Midlertidig valg til vi vet hvilken tillatelse IT gir appen. Kan fjernes når det er avklart. */}
      <fieldset className="felt tillatelse">
        <legend>Tillatelse appen ber om ved innlogging</legend>
        <label>
          <input type="radio" name="tillatelse" checked={tillatelse === 'manage'} onChange={() => setTillatelse('manage')} />
          <span>
            <b>Sites.Manage.All</b> (standard). Appen kan åpne registre på alle områder du selv har tilgang til, og lage listene for et nytt register på områder du eier.
          </span>
        </label>
        <label>
          <input type="radio" name="tillatelse" checked={tillatelse === 'sites'} onChange={() => setTillatelse('sites')} />
          <span>
            <b>Sites.Selected</b>. Appen kan bare åpne registre på SharePoint-områdene IT har gitt den tilgang til, f.eks. i en pilot. For å sette opp et nytt register
            må appen ha rollen «manage» på området. Søk etter områder virker ikke med dette valget.
          </span>
        </label>
        <p className="liten">Velg det samme som IT har lagt inn under API permissions i appregistreringen. Feil valg gir en feilmelding ved innlogging.</p>
        <p className="liten">
          Legg også til <b>User.ReadBasic.All</b> for å kunne søke etter personer i organisasjonen når du velger risikoeier, tiltakseier og deltakere. Appen ber om
          den først når noen søker.
        </p>
      </fieldset>
      <div className="knapperad">
        <button
          className="knapp primær"
          onClick={() => {
            lagreConfig(clientId && tenantId ? { clientId, tenantId, tillatelse } : null)
            window.location.reload()
          }}
        >
          Lagre og last på nytt
        </button>
        <button
          className="lenkeknapp"
          onClick={() => {
            lagreConfig(null)
            window.location.reload()
          }}
        >
          Nullstill
        </button>
      </div>
    </div>
  )
}
