import { useEffect, useRef, useState } from 'react'
import type { FilElement, FilKilde, FilMappe } from '../store/filer'
import { erExcel } from '../store/filer'
import { dekrypterExcel, erKryptert } from '../kryptert'
import { Modal, ModalTittel } from './Modal'

interface Felles {
  // Mappene i SharePoint. Mangler den, kan brukeren lime inn en mappelenke hvis lagKilde er gitt, ellers bare bruke egen PC.
  kilde?: FilKilde | null
  lagKilde?: (lenke: string) => Promise<FilKilde>
  lukk: () => void
}

type Props =
  | (Felles & { modus: 'aapne'; valgt: (navn: string, data: ArrayBuffer) => void | Promise<void> })
  | (Felles & { modus: 'lagre'; filnavn: string; data: () => ArrayBuffer; lagretPc: () => void; lagret: (navn: string, mappe: string) => void })

const dato = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const storrelse = (b?: number) => (b === undefined || b === 0 ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

// Velger en Excel-fil fra SharePoint-mappen registeret ligger i (eller en annen mappe), eller fra egen PC med vanlig fildialog
export function Filvelger(p: Props) {
  const [kilde, setKilde] = useState<FilKilde | null>(p.kilde ?? null)
  const [sti, setSti] = useState<FilMappe[]>([])
  const [innhold, setInnhold] = useState<FilElement[] | null>(null)
  const [sok, setSok] = useState('')
  const [treff, setTreff] = useState<FilElement[] | null>(null)
  const [lenke, setLenke] = useState('')
  const [filnavn, setFilnavn] = useState(p.modus === 'lagre' ? p.filnavn : '')
  const [jobber, setJobber] = useState('')
  const [feil, setFeil] = useState('')
  const filRef = useRef<HTMLInputElement>(null)
  const [laast, setLaast] = useState<{ navn: string; data: ArrayBuffer } | null>(null)
  const [passord, setPassord] = useState('')
  const mappe = sti[sti.length - 1]

  const jobb = async (tekst: string, f: () => Promise<void>) => {
    setFeil('')
    setJobber(tekst)
    try {
      await f()
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setJobber('')
    }
  }

  const gaaTil = (m: FilMappe, nySti: FilMappe[]) =>
    jobb('Henter mappen…', async () => {
      const liste = await kilde!.liste(m.id)
      setSti(nySti)
      setInnhold(liste.sort((a, b) => Number(b.mappe) - Number(a.mappe) || a.navn.localeCompare(b.navn, 'nb')))
      setTreff(null)
      setSok('')
    })

  useEffect(() => {
    if (!kilde) return
    void jobb('Henter mappen…', async () => {
      const m = await kilde.start()
      const liste = await kilde.liste(m.id)
      setSti([m])
      setInnhold(liste.sort((a, b) => Number(b.mappe) - Number(a.mappe) || a.navn.localeCompare(b.navn, 'nb')))
    })
  }, [kilde])

  // Opp går til mappen over: den forrige i stien hvis vi har gått ned, ellers hentes forelderen
  const opp = () =>
    sti.length > 1 ? gaaTil(sti[sti.length - 2], sti.slice(0, -1)) : jobb('Henter mappen…', async () => {
      const forelder = await kilde!.mappe(sti[0].forelder!)
      await gaaTil(forelder, [forelder])
    })

  const sokNaa = () => {
    if (!sok.trim()) return setTreff(null)
    void jobb('Søker…', async () => setTreff((await kilde!.sok(sok.trim())).filter((f) => erExcel(f.navn))))
  }

  const velgFil = (f: FilElement) => {
    if (p.modus !== 'aapne') return setFilnavn(f.navn)
    void jobb(`Henter «${f.navn}»…`, async () => {
      await aapne(f.navn, await kilde!.hent(f.id))
    })
  }

  const lagreHer = () => {
    if (p.modus !== 'lagre' || !mappe) return
    let navn = filnavn.trim() || p.filnavn
    if (!/\.xlsx$/i.test(navn)) navn += '.xlsx'
    void jobb('Lagrer…', async () => {
      const brukt = await kilde!.lagre(mappe.id, navn, p.data())
      p.lagret(brukt, sti.map((m) => m.navn).join(' › '))
    })
  }

  // Filer som er låst med passord, må låses opp før de kan leses
  const aapne = async (navn: string, data: ArrayBuffer) => {
    if (p.modus !== 'aapne') return
    if (erKryptert(data)) {
      setPassord('')
      setLaast({ navn, data })
      return
    }
    await p.valgt(navn, data)
  }

  const laasOpp = () => {
    if (p.modus !== 'aapne' || !laast) return
    void jobb('Låser opp filen…', async () => {
      const data = await dekrypterExcel(laast.data, passord)
      setLaast(null)
      await p.valgt(laast.navn, data)
    })
  }

  const fraPc = (f: File) => {
    if (p.modus !== 'aapne') return
    void jobb(`Leser «${f.name}»…`, async () => aapne(f.name, await f.arrayBuffer()))
  }

  const rader = treff ?? innhold ?? []

  return (
    <Modal className="filvelger" lukk={p.lukk}>
      <header>
        <ModalTittel>{p.modus === 'aapne' ? 'Importer fra Excel' : 'Eksporter til Excel'}</ModalTittel>
        <button className="ikonknapp" onClick={p.lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <div className="fv-pc">
          {p.modus === 'aapne' ? (
            <>
              <button className="knapp" onClick={() => filRef.current?.click()}>
                Fra min PC…
              </button>
              <input ref={filRef} type="file" accept=".xlsm,.xlsx" hidden onChange={(e) => e.target.files?.[0] && fraPc(e.target.files[0])} />
              <span className="liten">Åpner vanlig fildialog.</span>
            </>
          ) : (
            <>
              <button className="knapp" onClick={p.lagretPc}>
                Last ned til min PC
              </button>
              <span className="liten">Lagres i nedlastingsmappen, som vanlig nedlasting.</span>
            </>
          )}
        </div>

        {laast && (
          <form
            className="fv-passord"
            onSubmit={(e) => {
              e.preventDefault()
              laasOpp()
            }}
          >
            <label className="felt">
              <span>«{laast.navn}» er låst med passord</span>
              <input type="password" autoFocus value={passord} onChange={(e) => setPassord(e.target.value)} placeholder="Passord" autoComplete="off" />
              <small>Filen låses opp her i nettleseren. Passordet sendes ingen steder og blir ikke lagret.</small>
            </label>
            {jobber && <p className="liten">{jobber}</p>}
            {feil && <div className="banner feil">{feil}</div>}
            <div className="knapperad">
              <button type="button" className="knapp" onClick={() => setLaast(null)}>
                Avbryt
              </button>
              <button className="knapp primær" disabled={!passord || !!jobber}>
                Lås opp
              </button>
            </div>
          </form>
        )}
        {kilde ? (
          <div className="fv-sp">
            <div className="fv-topp">
              <strong>{kilde.navn}</strong>
              {kilde.demo && <span className="liten"> (bare for å vise hvordan det virker, filene finnes ikke på ekte)</span>}
            </div>
            <div className="fv-sti">
              <button className="knapp" disabled={(sti.length < 2 && !sti[0]?.forelder) || !!jobber} onClick={() => void opp()} title="Opp ett nivå">
                ↑ Opp
              </button>
              <span className="fv-brodsmuler">
                {sti.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ' › '}
                    {i < sti.length - 1 ? (
                      <button className="lenkeknapp" onClick={() => void gaaTil(m, sti.slice(0, i + 1))}>
                        {m.navn}
                      </button>
                    ) : (
                      <strong>{m.navn}</strong>
                    )}
                  </span>
                ))}
              </span>
            </div>
            <form
              className="fv-sok"
              onSubmit={(e) => {
                e.preventDefault()
                sokNaa()
              }}
            >
              <input value={sok} onChange={(e) => (setSok(e.target.value), !e.target.value && setTreff(null))} placeholder="Søk etter Excel-filer i hele biblioteket" />
              <button className="knapp" disabled={!!jobber}>
                Søk
              </button>
            </form>
            <ul className="fv-liste">
              {treff && <li className="fv-info">{treff.length ? `${treff.length} treff på «${sok}»` : `Ingen Excel-filer funnet for «${sok}»`}</li>}
              {!treff && innhold && !rader.length && <li className="fv-info">Mappen er tom.</li>}
              {rader.map((f) => {
                const excel = !f.mappe && erExcel(f.navn)
                const aktiv = f.mappe || (excel && p.modus === 'aapne') || (p.modus === 'lagre' && excel)
                return (
                  <li key={f.id}>
                    <button
                      className={'fv-rad' + (aktiv ? '' : ' passiv')}
                      disabled={!aktiv || !!jobber}
                      onClick={() => (f.mappe ? void gaaTil({ id: f.id, navn: f.navn, forelder: mappe?.id }, [...sti, { id: f.id, navn: f.navn, forelder: mappe?.id }]) : velgFil(f))}
                    >
                      <span className={'fv-ikon ' + (f.mappe ? 'mappe' : excel ? 'excel' : 'fil')} aria-hidden>
                        {f.mappe ? '' : excel ? 'X' : ''}
                      </span>
                      <span className="fv-navn">
                        {f.navn}
                        {f.sted && <small> i {f.sted}</small>}
                      </span>
                      <span className="fv-meta">{f.mappe ? '' : `${dato(f.endret)} ${storrelse(f.storrelse)}`}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {p.modus === 'lagre' && (
              <form
                className="fv-lagre"
                onSubmit={(e) => {
                  e.preventDefault()
                  lagreHer()
                }}
              >
                <label className="felt">
                  <span>Filnavn</span>
                  <input value={filnavn} onChange={(e) => setFilnavn(e.target.value)} />
                </label>
                <button className="knapp primær" disabled={!mappe || !!jobber}>
                  Lagre i «{mappe?.navn ?? '…'}»
                </button>
              </form>
            )}
          </div>
        ) : p.lagKilde ? (
          <form
            className="fv-sp fv-lenke"
            onSubmit={(e) => {
              e.preventDefault()
              if (lenke.trim()) void jobb('Finner mappen…', async () => setKilde(await p.lagKilde!(lenke.trim())))
            }}
          >
            <label className="felt">
              <span>Eller hent fra SharePoint: lim inn lenken til mappen der Excel-filen ligger</span>
              <input value={lenke} onChange={(e) => setLenke(e.target.value)} placeholder="https://firma.sharepoint.com/sites/Prosjekt123/Delte dokumenter/…" />
            </label>
            <button className="knapp" disabled={!lenke.trim() || !!jobber}>
              Vis mappen
            </button>
          </form>
        ) : null}

        {!laast && jobber && <p className="liten">{jobber}</p>}
        {!laast && feil && <div className="banner feil">{feil}</div>}
      </div>
    </Modal>
  )
}
