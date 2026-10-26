import { useEffect, useRef, useState } from 'react'
import { eksempelRegister } from '../eksempel'
import { importerExcel } from '../excel'
import type { Register } from '../model'
import type { AuthConfig } from '../store/auth'
import { lagreConfig, loggInn, loggUt, redirectUri } from '../store/auth'
import { demoRegistre, opprettDemo, slettDemo, demoFinnes } from '../store/demoBackend'
import { NyttRegisterDialog } from './NyttRegister'

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

export function Start({ config, konto }: Props) {
  const [lenke, setLenke] = useState('')
  const [demoer, setDemoer] = useState(demoRegistre())
  const [ny, setNy] = useState<null | { kilde?: Register; importert?: boolean; type: 'demo' | 'sharepoint' }>(null)
  const [visOppsett, setVisOppsett] = useState(false)
  const [feil, setFeil] = useState('')
  const filRef = useRef<HTMLInputElement>(null)
  const nylige = lesNylige()

  useEffect(() => {
    const h = () => setDemoer(demoRegistre())
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])

  const lagEksempel = () => {
    let n = 'Demo – Nytt kontorbygg'
    for (let i = 2; demoFinnes(n); i++) n = `Demo – Nytt kontorbygg (${i})`
    opprettDemo(n, eksempelRegister(n))
    window.location.search = '?demo=' + encodeURIComponent(n)
  }

  const importer = async (f: File) => {
    setFeil('')
    try {
      const reg = await importerExcel(f)
      setNy({ kilde: reg, importert: true, type: config ? 'sharepoint' : 'demo' })
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    }
  }

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
        {feil && <div className="banner feil">{feil}</div>}
        <section className="kort stort">
          <h2>Åpne et register i SharePoint</h2>
          <p>Lim inn lenken til mappen der registeret ligger. Du får bare åpnet registre du har tilgang til i SharePoint.</p>
          <form
            className="knapperad"
            onSubmit={(e) => {
              e.preventDefault()
              if (lenke.trim()) window.location.search = '?reg=' + encodeURIComponent(lenke.trim())
            }}
          >
            <input className="vid" value={lenke} onChange={(e) => setLenke(e.target.value)} placeholder="https://firma.sharepoint.com/sites/…/Riskregister" disabled={!config} />
            <button className="knapp primær" disabled={!config || !lenke.trim()}>
              Åpne
            </button>
          </form>
          {!config && (
            <p className="banner info">
              SharePoint-tilkoblingen er ikke satt opp ennå. Den krever en appregistrering i Entra ID fra IT. Til da kan du bruke demomodus nedenfor.
            </p>
          )}
          <div className="knapperad">
            <button className="knapp" disabled={!config} onClick={() => setNy({ type: 'sharepoint' })}>
              Opprett nytt register i SharePoint
            </button>
            <button className="lenkeknapp" onClick={() => setVisOppsett(!visOppsett)}>
              Tilkoblingsinnstillinger
            </button>
          </div>
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
            Registrene lagres bare i denne nettleseren. Åpne samme register i flere faner for å se hvordan flere brukere jobber samtidig, med tilstedeværelse og
            låsing av risker.
          </p>
          <div className="knapperad">
            <button className="knapp primær" onClick={lagEksempel}>
              Lag demoregister med eksempeldata
            </button>
            <button className="knapp" onClick={() => setNy({ type: 'demo' })}>
              Nytt tomt register
            </button>
            <button className="knapp" onClick={() => filRef.current?.click()}>
              Importer fra Excel (.xlsm)…
            </button>
            <input ref={filRef} type="file" accept=".xlsm,.xlsx" hidden onChange={(e) => e.target.files?.[0] && void importer(e.target.files[0])} />
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
      {ny && <NyttRegisterDialog kilde={ny.kilde} importert={ny.importert} backendType={ny.type} lukk={() => (setNy(null), setDemoer(demoRegistre()))} />}
    </div>
  )
}

function Oppsett({ config }: { config: AuthConfig | null }) {
  const [clientId, setClientId] = useState(config?.clientId ?? '')
  const [tenantId, setTenantId] = useState(config?.tenantId ?? '')
  return (
    <div className="oppsett">
      <p className="liten">
        Fylles ut med verdiene fra appregistreringen i Entra ID. Lagres bare i denne nettleseren og er ment for testing. I drift legges de i <code>config.json</code>.
        Omdirigerings-URI som må registreres: <code>{redirectUri()}</code>
      </p>
      <label className="felt">
        <span>Application (client) ID</span>
        <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} />
      </label>
      <label className="felt">
        <span>Directory (tenant) ID</span>
        <input value={tenantId} onChange={(e) => setTenantId(e.target.value.trim())} />
      </label>
      <div className="knapperad">
        <button
          className="knapp primær"
          onClick={() => {
            lagreConfig(clientId && tenantId ? { clientId, tenantId } : null)
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
