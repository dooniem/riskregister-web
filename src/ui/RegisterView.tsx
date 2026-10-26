import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GRUPPER, KOLONNER } from '../columns'
import { eksporterExcel } from '../excel'
import { SkariskVisning } from './Skarisk'
import { FagMeny, fagForNyRisk } from './Fag'
import type { Register } from '../model'
import { nyRisk } from '../model'
import type { Konflikt, Op } from '../ops'
import { SimulertKollega } from '../sim'
import type { Okt } from '../sync'
import type { Visning } from '../view'
import { GRUPPERINGER, STANDARD_VISNING, filtrer } from '../view'
import { Detaljpanel } from './Detaljpanel'
import { Grid } from './Grid'
import { Kortliste } from './Kortliste'
import { Laas } from './Ikoner'
import { NyttRegisterDialog } from './NyttRegister'
import { Oversikt } from './Oversikt'
import { Prosjektpanel } from './Prosjektpanel'

interface Props {
  okt: Okt
  tilbake: () => void
}

interface Melding {
  id: number
  tekst: string
  handling?: { tekst: string; gjor: () => void }
}

const MOBIL = '(max-width: 760px)'

function lesVisning(key: string): Visning {
  const standard = { ...STANDARD_VISNING, visOversikt: !window.matchMedia(MOBIL).matches }
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return v ? { ...standard, ...v, sok: '', filter: { verdier: {}, tekst: {} } } : standard
  } catch {
    return standard
  }
}

function useMobil() {
  const [mobil, setMobil] = useState(() => window.matchMedia(MOBIL).matches)
  useEffect(() => {
    const m = window.matchMedia(MOBIL)
    const h = () => setMobil(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return mobil
}

// Lager operasjonen som opphever en endring, for Ctrl+Z
function motsatt(doc: Register, op: Op): Op | null {
  switch (op.t) {
    case 'setRisk':
      return { ...op, verdi: op.fra, fra: op.verdi }
    case 'setTiltak':
      return { ...op, verdi: op.fra, fra: op.verdi }
    case 'addRisk':
      return { t: 'deleteRisk', riskId: op.risk.id }
    case 'deleteRisk': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      return r ? { t: 'addRisk', risk: structuredClone(r), beholdNr: true } : null
    }
    case 'addTiltak':
      return { t: 'deleteTiltak', riskId: op.riskId, tiltakId: op.tiltak.id }
    case 'deleteTiltak': {
      const r = doc.risker.find((x) => x.id === op.riskId)
      const i = r?.tiltak.findIndex((x) => x.id === op.tiltakId) ?? -1
      if (!r || i < 0) return null
      return { t: 'addTiltak', riskId: r.id, tiltak: structuredClone(r.tiltak[i]), etter: r.tiltak[i - 1]?.id }
    }
    default:
      return null
  }
}

export function RegisterView({ okt, tilbake }: Props) {
  const snap = useSyncExternalStore(okt.abonner, okt.hentSnap)
  const { doc, andre, status } = snap
  const b = okt.backend
  const visningKey = `rr-visning:${doc.registerId}`
  const [visning, setVisningRaw] = useState<Visning>(() => lesVisning(visningKey))
  const [detalj, setDetalj] = useState<string | null>(null)
  const [prosjekt, setProsjekt] = useState<false | 'prosjekt' | 'deltakere' | 'lister'>(false)
  const [kolVelger, setKolVelger] = useState(false)
  const [meny, setMeny] = useState(false)
  const [nyttReg, setNyttReg] = useState(false)
  const [meldinger, setMeldinger] = useState<Melding[]>([])
  const [sim, setSim] = useState<SimulertKollega | null>(null)
  const angreStabel = useRef<Op[][]>([])
  const mobil = useMobil()

  const setVisning = useCallback((f: (v: Visning) => Visning) => setVisningRaw((v) => f(v)), [])
  useEffect(() => {
    try {
      const { sok: _s, filter: _f, ...lagres } = visning
      localStorage.setItem(visningKey, JSON.stringify(lagres))
    } catch {
      /* ignorer */
    }
  }, [visning, visningKey])

  const melding = useCallback((tekst: string, handling?: Melding['handling']) => {
    const id = Date.now() + Math.random()
    setMeldinger((m) => [...m.slice(-3), { id, tekst, handling }])
    setTimeout(() => setMeldinger((m) => m.filter((x) => x.id !== id)), handling ? 8000 : 5000)
  }, [])

  useEffect(() => {
    okt.onKonflikt = (k: Konflikt[]) =>
      melding(`Du og en annen endret samme felt samtidig (risk ${[...new Set(k.map((x) => x.riskNr))].join(', ')}). Din versjon ble lagret.`)
    okt.onLaasTapt = (_r, av) => melding(`${av} begynte å redigere samme risk samtidig og fikk låsen først.`)
  }, [okt, melding])

  useEffect(() => () => sim?.avslutt(), [sim])

  const endre = useCallback(
    (...ops: Op[]) => {
      const inverse = ops.map((o) => motsatt(okt.doc, o)).filter(Boolean).reverse() as Op[]
      if (inverse.length) angreStabel.current = [...angreStabel.current.slice(-99), inverse]
      okt.utfor(...ops)
    },
    [okt],
  )

  const angre = useCallback(() => {
    const ops = angreStabel.current.pop()
    if (!ops) return melding('Ingenting å angre.')
    const r = ops.map((o) => ('riskId' in o ? o.riskId : 'risk' in o ? o.risk.id : '')).find(Boolean)
    if (r && okt.laastAv(r)) return melding('Kan ikke angre: risken redigeres av en annen akkurat nå.')
    // Oppdater «fra» til nåværende verdi slik at angring ikke rapporteres som konflikt
    okt.utfor(...ops)
  }, [okt, melding])

  // Esc lukker paneler
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMeny(false)
        setKolVelger(false)
        if (detalj && !(document.activeElement instanceof HTMLTextAreaElement)) setDetalj(null)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [detalj])

  const antall = useMemo(
    () => ({
      aapne: doc.risker.filter((r) => r.status !== 'Lukket').length,
      lukkede: doc.risker.filter((r) => r.status === 'Lukket').length,
      alle: doc.risker.length,
      skarisk: doc.risker.filter((r) => r.tilSkarisk && r.status !== 'Lukket').length,
      vist: filtrer(doc, visning).length,
    }),
    [doc, visning],
  )

  // Ligger registeret et annet sted enn der det ble opprettet? Da er det trolig en kopi.
  const hjem = b.hjem?.()
  const erKopi = !!(hjem && doc.hjem && (doc.hjem.driveId !== hjem.driveId || doc.hjem.itemId !== hjem.itemId))
  const manglerHjem = !!(hjem && !doc.hjem)
  useEffect(() => {
    if (manglerHjem && b.kanSkrive) okt.utfor({ t: 'setHjem', hjem: hjem! })
  }, [manglerHjem, b.kanSkrive, okt, hjem])

  const filterAktivt = !!visning.sok || Object.keys(visning.filter.verdier).length > 0 || Object.values(visning.filter.tekst).some(Boolean) || !!visning.filter.matrise || !!visning.fag?.length
  const tittel = [doc.prosjekt.nummer, doc.prosjekt.navn].filter(Boolean).join(' ') || 'Riskregister uten navn'
  // Endringer samles noen sekunder før de lagres. Så lenge noen venter, sier vi det i stedet for «lagret».
  const visStatus = status === 'lagret' && snap.ventende ? 'lagrer' : status
  const statusTekst = { laster: 'Laster…', lagret: 'Alle endringer er lagret', lagrer: 'Lagrer…', frakoblet: 'Frakoblet, prøver igjen', feil: 'Lagring feilet' }[visStatus]

  return (
    <div className="app">
      <header className="toppfelt">
        <button className="ikonknapp hjem" onClick={tilbake} title="Til startsiden">
          ◂
        </button>
        <div className="tittel">
          <h1>{tittel}</h1>
          <div className="undertittel">
            {b.type === 'demo' ? 'Demomodus (lagres bare i denne nettleseren)' : `SharePoint › ${b.tittel}`}
            {!b.kanSkrive && ' · bare lesetilgang'}
          </div>
        </div>
        <div className={'lagrestatus ' + visStatus} title={snap.feil}>
          <span className="prikk" /> {statusTekst}
        </div>
        <div className="tilstede">
          {andre.map((t) => (
            <span key={t.brukerId} className="avatar" style={{ background: t.farge }} title={`${t.navn}${t.laas ? ' (redigerer)' : ''}`}>
              {t.navn
                .split(/\s+/)
                .map((s) => s[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
              {t.laas && (
                <span className="avatar-laas">
                  <Laas />
                </span>
              )}
            </span>
          ))}
          <span className="avatar meg" title={`Du: ${b.bruker.navn}`}>
            {b.bruker.navn.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <button className="knapp" onClick={() => setProsjekt('prosjekt')}>
          Prosjekt og deltakere
        </button>
        <div className="meny-holder">
          <button className="knapp" onClick={() => setMeny(!meny)}>
            Mer ▾
          </button>
          {meny && (
            <div className="nedtrekk" onClick={() => setMeny(false)}>
              <button onClick={() => eksporterExcel(doc)}>Eksporter til Excel (.xlsx)</button>
              <button onClick={() => setVisning((v) => ({ ...v, fane: 'skarisk' }))}>Poster til Skarisk</button>
              <button onClick={() => window.print()}>Skriv ut / lagre som PDF</button>
              <hr />
              <button onClick={() => setProsjekt('lister')}>Lister og valg…</button>
              <button onClick={() => setNyttReg(true)}>Lag nytt register fra dette…</button>
              {b.type === 'demo' && (
                <>
                  <hr />
                  <button
                    onClick={() => {
                      if (sim) {
                        sim.avslutt()
                        setSim(null)
                      } else {
                        const s = new SimulertKollega(b.tittel.replace('Demo › ', ''))
                        void s.start()
                        setSim(s)
                        melding('En simulert kollega er inne i registeret og redigerer tiltak innimellom.')
                      }
                    }}
                  >
                    {sim ? 'Stopp simulert kollega' : 'Start simulert kollega'}
                  </button>
                  <button onClick={() => window.open(window.location.href + '&ny=1', '_blank')}>Åpne registeret i ny fane (ny bruker)</button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {erKopi && (
        <div className="banner advarsel">
          Dette registeret ser ut til å være kopiert fra et annet prosjekt. Vil du gjøre det om til et nytt, eget register?
          <button className="knapp" onClick={() => setNyttReg(true)}>
            Nullstill / lag nytt
          </button>
          <button className="lenkeknapp" onClick={() => okt.utfor({ t: 'setHjem', hjem: hjem! })}>
            Nei, behold som det er
          </button>
        </div>
      )}

      {visning.visOversikt && <Oversikt doc={doc} visning={visning} setVisning={setVisning} />}

      <div className="verktoylinje">
        <nav className="faner">
          {(
            [
              ['aapne', 'Åpne', antall.aapne],
              ['lukkede', 'Lukkede', antall.lukkede],
              ['alle', 'Alle', antall.alle],
              ['skarisk', 'Til Skarisk', antall.skarisk],
            ] as const
          ).map(([k, t, n]) => (
            <button key={k} className={visning.fane === k ? 'valgt' : ''} onClick={() => setVisning((v) => ({ ...v, fane: k }))}>
              {t} <span className="teller">{n}</span>
            </button>
          ))}
        </nav>
        {visning.fane !== 'skarisk' && (
          <>
          <input className="sok" placeholder="Søk i alle felt…" value={visning.sok} onChange={(e) => setVisning((v) => ({ ...v, sok: e.target.value }))} />
          <label className="velg">
            Grupper etter
            <select value={visning.gruppering} onChange={(e) => setVisning((v) => ({ ...v, gruppering: e.target.value }))}>
              {GRUPPERINGER.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.tittel}
                </option>
              ))}
            </select>
          </label>
          <FagMeny doc={doc} visning={visning} setVisning={setVisning} endre={endre} kanSkrive={b.kanSkrive} />
          <div className="meny-holder">
            <button className="knapp" onClick={() => setKolVelger(!kolVelger)}>
              Kolonner ▾
            </button>
            {kolVelger && <Kolonnevelger doc={doc} visning={visning} setVisning={setVisning} lukk={() => setKolVelger(false)} />}
          </div>
          </>
        )}
        <button className="knapp" onClick={() => setVisning((v) => ({ ...v, visOversikt: !v.visOversikt }))}>
          {visning.visOversikt ? 'Skjul oversikt' : 'Vis oversikt'}
        </button>
        {filterAktivt && visning.fane !== 'skarisk' && (
          <span className="filterinfo">
            Viser {antall.vist} av {antall[visning.fane]}
            <button className="lenkeknapp" onClick={() => setVisning((v) => ({ ...v, sok: '', fag: [], filter: { verdier: {}, tekst: {} } }))}>
              Fjern alle filtre
            </button>
          </span>
        )}
      </div>

      <div className="hovedflate">
        {visning.fane === 'skarisk' ? (
          <SkariskVisning doc={doc} aapneDetalj={setDetalj} melding={melding} />
        ) : mobil ? (
          <div className="mobilflate">
            {b.kanSkrive && (
              <button
                className="knapp primær ny-risk-mobil"
                onClick={() => {
                  const r = nyRisk(0)
                  r.fag = fagForNyRisk(doc, visning)
                  endre({ t: 'addRisk', risk: r })
                  setDetalj(r.id)
                }}
              >
                + Ny risk
              </button>
            )}
            <Kortliste okt={okt} doc={doc} andre={andre} visning={visning} aapne={setDetalj} />
          </div>
        ) : (
        <Grid
          okt={okt}
          doc={doc}
          andre={andre}
          visning={visning}
          setVisning={setVisning}
          endre={endre}
          angre={angre}
          aapneDetalj={setDetalj}
          melding={melding}
          kanSkrive={b.kanSkrive}
        />
        )}
        {detalj && <Detaljpanel okt={okt} doc={doc} riskId={detalj} endre={endre} lukk={() => setDetalj(null)} kanSkrive={b.kanSkrive} />}
      </div>

      {prosjekt && <Prosjektpanel doc={doc} endre={endre} lukk={() => setProsjekt(false)} kanSkrive={b.kanSkrive} start={prosjekt} />}
      {nyttReg && <NyttRegisterDialog kilde={doc} backendType={b.type} lukk={() => setNyttReg(false)} />}

      <div className="meldinger">
        {meldinger.map((m) => (
          <div key={m.id} className="melding">
            {m.tekst}
            {m.handling && (
              <button
                className="lenkeknapp"
                onClick={() => {
                  m.handling!.gjor()
                  setMeldinger((x) => x.filter((y) => y.id !== m.id))
                }}
              >
                {m.handling.tekst}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Kolonnevelger({ doc, visning, setVisning, lukk }: { doc: Register; visning: Visning; setVisning: (f: (v: Visning) => Visning) => void; lukk: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && lukk()
    setTimeout(() => window.addEventListener('mousedown', h))
    return () => window.removeEventListener('mousedown', h)
  }, [lukk])
  const forhånd: [string, string[]][] = [
    ['Alt', []],
    ['Identifisering', ['vurdering', 'kost', 'tiltak']],
    ['Vurdering og kost', ['tiltak']],
    ['Tiltaksoppfølging', ['eierskap', 'kost', 'vurdering']],
  ]
  return (
    <div className="nedtrekk kolonnevelger" ref={ref}>
      <div className="meny-tittel">Ferdige visninger</div>
      <div className="knapperad">
        {forhånd.map(([navn, grupper]) => (
          <button key={navn} className="knapp liten" onClick={() => setVisning((v) => ({ ...v, skjulteGrupper: grupper, skjulteKolonner: [] }))}>
            {navn}
          </button>
        ))}
      </div>
      <div className="meny-tittel">Kolonner</div>
      {GRUPPER.filter((g) => g.key !== 'fast').map((g) => (
        <div key={g.key} className="kolgruppe">
          <label className="gruppelabel">
            <input
              type="checkbox"
              checked={!visning.skjulteGrupper.includes(g.key)}
              onChange={(e) =>
                setVisning((v) => ({ ...v, skjulteGrupper: e.target.checked ? v.skjulteGrupper.filter((x) => x !== g.key) : [...v.skjulteGrupper, g.key] }))
              }
            />
            <strong>{g.tittel}</strong>
          </label>
          {KOLONNER.filter((k) => k.gruppe === g.key && (k.key !== 'egendef2' || doc.lister.egendef2Aktiv)).map((k) => (
            <label key={k.key} className="kollabel">
              <input
                type="checkbox"
                disabled={!!k.frosset}
                checked={!visning.skjulteKolonner.includes(k.key)}
                onChange={(e) =>
                  setVisning((v) => ({ ...v, skjulteKolonner: e.target.checked ? v.skjulteKolonner.filter((x) => x !== k.key) : [...v.skjulteKolonner, k.key] }))
                }
              />
              {k.tittel(doc)}
            </label>
          ))}
        </div>
      ))}
      <button className="lenkeknapp" onClick={() => setVisning((v) => ({ ...v, skjulteGrupper: [], skjulteKolonner: [], bredder: {} }))}>
        Tilbakestill kolonner og bredder
      </button>
    </div>
  )
}

