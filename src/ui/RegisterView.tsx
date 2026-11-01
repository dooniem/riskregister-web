import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GRUPPER, KOLONNER } from '../columns'
import { excelFil, lastNed, lesExcel } from '../excel'
import { SkariskVisning } from './Skarisk'
import { FagMeny, fagForNyRisk } from './Fag'
import type { Register } from '../model'
import { nyRisk } from '../model'
import type { Konflikt, Op } from '../ops'
import { SimulertKollega } from '../sim'
import type { Okt } from '../sync'
import type { Stil, Visning } from '../view'
import { STANDARD_VISNING, grupperinger, STILER, filtrer, lagreStil, lesStil } from '../view'
import { DemoFiler, type FilKilde } from '../store/filer'
import { GraphFiler } from '../store/graphFiler'
import { GraphLister, omraadeLenke } from '../store/lister/graphLister'
import { LISTER } from '../store/lister/skjema'
import { AvklarDialog, AvvikBanner, UlagretBanner } from './Avvik'
import { Detaljpanel } from './Detaljpanel'
import { Filvelger } from './Filvelger'
import { ImportDialog } from './ImportDialog'
import { Grid } from './Grid'
import { Kortliste } from './Kortliste'
import { Kolonneikon, Laas, Meny, Pil, Pluss } from './Ikoner'
import { PersonMeny } from './PersonMeny'
import { HentOppsett } from './HentOppsett'
import { Oversikt } from './Oversikt'
import { Prosjektpanel } from './Prosjektpanel'
import { RaadataDialog } from './Raadata'
import { SnapshotDialog } from './Snapshots'
import { StorMatrise } from './StorMatrise'
import { Risikobilde } from './Risikobilde'
import { PersonKontekst, deltakerOp, type Personer } from './Personer'
import { DemoKatalog, GraphKatalog } from '../store/katalog'
import type { SnapshotInfo } from '../store/backend'
import type { Risk } from '../model'

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
  const [prosjekt, setProsjekt] = useState<false | 'prosjekt' | 'deltakere' | 'gjennomganger' | 'lister'>(false)
  const [kolVelger, setKolVelger] = useState(false)
  // Øker når «Ny risk» i verktøylinjen trykkes, så tabellen legger til en rad og setter markøren i den
  const [nyRiskTeller, setNyRiskTeller] = useState(0)
  const [meny, setMeny] = useState(false)
  // Mer-menyen lukkes ved klikk utenfor den (knappen selv åpner og lukker som før)
  const merRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!meny) return
    const h = (e: MouseEvent) => !merRef.current?.contains(e.target as Node) && setMeny(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMeny(false)
    window.addEventListener('mousedown', h, true)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('mousedown', h, true)
      window.removeEventListener('keydown', k)
    }
  }, [meny])
  const [hentOppsett, setHentOppsett] = useState(false)
  const [filvelger, setFilvelger] = useState<null | 'aapne' | 'lagre'>(null)
  const [importert, setImportert] = useState<{ reg: Register; filnavn: string } | null>(null)
  const [meldinger, setMeldinger] = useState<Melding[]>([])
  const [sim, setSim] = useState<SimulertKollega | null>(null)
  const [snapshots, setSnapshots] = useState<false | 'liste' | 'endringer'>(false)
  const [storMatrise, setStorMatrise] = useState<'R' | 'M' | null>(null)
  // Snapshotet registeret sammenlignes med akkurat nå
  const [mot, setMot] = useState<{ info: SnapshotInfo; doc: Register } | null>(null)
  const motRisker = useMemo(() => (mot ? new Map<string, Risk>(mot.doc.risker.map((r) => [r.id, r])) : undefined), [mot])
  const [raadata, setRaadata] = useState(false)
  const [kolonneFeil, setKolonneFeil] = useState<string | null>(null)
  const [lagerKolonner, setLagerKolonner] = useState(false)
  const manglende = b.snapshot ? [] : (b.lager?.manglendeKolonner?.() ?? [])
  const angreStabel = useRef<Op[][]>([])
  const mobil = useMobil()
  const [stil, setStilRaw] = useState<Stil>(lesStil)
  const setStil = (s: Stil) => (setStilRaw(s), lagreStil(s))
  // Samlet er moderne med flere kolonner slått sammen, så alt som gjelder moderne gjelder også samlet
  const moderne = stil !== 'klassisk'
  const samlet = stil === 'samlet'
  // Moderne visning har to sider: registeret og risikobildet
  const [side, setSide] = useState<{ navn: 'register' | 'risikobilde'; rm: 'R' | 'M' }>({ navn: 'register', rm: 'R' })
  const paaRisikobilde = moderne && side.navn === 'risikobilde'
  const autoSnapshot = useRef(false)
  const [snapshotsLukket, setSnapshotsLukket] = useState(0)
  // I moderne visning åpner matrisen seg som siden Risikobilde, i klassisk som et vindu over registeret
  const aapneMatrise = (rm: 'R' | 'M') => (moderne ? setSide({ navn: 'risikobilde', rm }) : setStorMatrise(rm))

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

  // Import og eksport starter i dokumentbiblioteket på området registeret ligger på
  const filKilde = (): FilKilde => (b.lager instanceof GraphLister ? new GraphFiler(b.lager.dokumenter()) : new DemoFiler(doc))
  const lukkSnapshot = () => {
    const p = new URLSearchParams(window.location.search)
    p.delete('snapshot')
    window.location.search = '?' + p.toString()
  }

  const filterAktivt = !!visning.sok || Object.keys(visning.filter.verdier).length > 0 || Object.values(visning.filter.tekst).some(Boolean) || !!visning.filter.matrise || !!visning.fag?.length || !!visning.person
  const tittel = [doc.prosjekt.nummer, doc.prosjekt.navn].filter(Boolean).join(' ') || 'Riskregister uten navn'
  // Endringer samles noen sekunder før de lagres. Så lenge noen venter, sier vi det i stedet for «lagret».
  const visStatus = status === 'lagret' && snap.ventende ? 'lagrer' : status
  // Søk i organisasjonen for risikoeier, tiltakseier og deltakere. Demoen har en oppdiktet organisasjon.
  const personer = useMemo<Personer | null>(
    () =>
      b.kanSkrive
        ? {
            katalog: b.type === 'demo' ? new DemoKatalog() : new GraphKatalog(),
            leggTil: (p) => {
              const op = deltakerOp(okt.doc.deltakere, p)
              if (op) okt.utfor(op)
            },
          }
        : null,
    [b, okt],
  )

  const grupperValg = samlet ? (
    // Ser ut som en knapp («Grupper: Ingen»), men er en vanlig nedtrekksliste under, så tastatur og skjermleser virker som før
    <label className="knapp grupper-knapp">
      Grupper: {visning.gruppering ? grupperinger(doc).find((g) => g.key === visning.gruppering)?.tittel : 'Ingen'} <Pil />
      <select aria-label="Grupper etter" value={visning.gruppering} onChange={(e) => setVisning((v) => ({ ...v, gruppering: e.target.value }))}>
        {grupperinger(doc).map((g) => (
          <option key={g.key} value={g.key}>
            {g.tittel}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <label className="velg">
      Grupper etter
      <select value={visning.gruppering} onChange={(e) => setVisning((v) => ({ ...v, gruppering: e.target.value }))}>
        {grupperinger(doc).map((g) => (
          <option key={g.key} value={g.key}>
            {g.tittel}
          </option>
        ))}
      </select>
    </label>
  )
  const personValg = <PersonMeny doc={doc} visning={visning} setVisning={setVisning} brukernavn={b.bruker.navn} ikon={samlet} />
  const kolonneKnapp = (
    <div className="meny-holder">
      <button className="knapp" onClick={() => setKolVelger(!kolVelger)}>
        {samlet ? <Kolonneikon /> : null}
        Kolonner {!samlet && <Pil />}
      </button>
      {kolVelger &&
        (samlet ? (
          <SamletKolonnevelger doc={doc} visning={visning} setVisning={setVisning} lukk={() => setKolVelger(false)} />
        ) : (
          <Kolonnevelger doc={doc} visning={visning} setVisning={setVisning} lukk={() => setKolVelger(false)} />
        ))}
    </div>
  )
  const oversiktKnapp = (
    <button className="knapp" onClick={() => setVisning((v) => ({ ...v, visOversikt: !v.visOversikt }))}>
      {visning.visOversikt ? 'Skjul oversikt' : 'Vis oversikt'}
    </button>
  )

  const statusTekst = { laster: 'Laster…', lagret: 'Alle endringer er lagret', lagrer: 'Lagrer…', frakoblet: 'Frakoblet, prøver igjen', feil: 'Lagring feilet' }[visStatus]

  return (
    <PersonKontekst.Provider value={personer}>
      <div className={'app' + (visning.skjulFag ? ' skjul-fag' : '') + (moderne ? ' stil-moderne' : '') + (samlet ? ' stil-samlet' : '')}>
        <header className="toppfelt">
          <button className="ikonknapp hjem" onClick={tilbake} title="Til startsiden">
            <Pil retning="venstre" str={18} />
          </button>
          <div className="tittel">
            <h1>{tittel}</h1>
            <div className="undertittel">
              {b.type === 'demo' ? (
                'Demomodus (lagres bare i denne nettleseren)'
              ) : (
                <>
                  SharePoint ›{' '}
                  <a href={b.webUrl} target="_blank" rel="noreferrer">
                    {b.tittel}
                  </a>
                </>
              )}
              {b.snapshot ? ` · snapshot «${b.snapshot.navn}»` : !b.kanSkrive && ' · bare lesetilgang'}
            </div>
          </div>
          {moderne && (
            <nav className="sidevalg" aria-label="Sider">
              {(
                [
                  ['risikobilde', 'Risikobilde'],
                  ['register', 'Register'],
                ] as const
              ).map(([n, t]) => (
                <button key={n} className={side.navn === n ? 'valgt' : ''} aria-current={side.navn === n ? 'page' : undefined} onClick={() => setSide((s) => ({ ...s, navn: n }))}>
                  {t}
                </button>
              ))}
            </nav>
          )}
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
          <div className="meny-holder" ref={merRef}>
            <button className={'knapp mer-knapp' + (meny ? ' aapen' : '')} onClick={() => setMeny(!meny)} title="Import, eksport, utskrift, lister og mer">
              <span className="mer-ikon" aria-hidden>
                <Meny />
              </span>
              Mer <Pil />
            </button>
            {meny && (
              <div className="nedtrekk" onClick={() => setMeny(false)}>
                {b.kanSkrive && (
                  <button onClick={() => setFilvelger('aapne')} title="Legg til risker fra et Excel-register, f.eks. et delregister fra en underentreprenør">
                    Importer risker fra Excel…
                  </button>
                )}
                <button onClick={() => setFilvelger('lagre')} title="Samme oppsett som Excel-registeret. Åpne et tomt Excel-register og bruk Oppgrader for å hente inn filen.">
                  Eksporter til Excel (.xlsx)…
                </button>
                <button onClick={() => setVisning((v) => ({ ...v, fane: 'skarisk' }))}>Poster til Skarisk</button>
                <button onClick={() => window.print()}>Skriv ut / lagre som PDF</button>
                <hr />
                <div className="meny-gruppe" role="group" aria-label="Utseende">
                  <span className="meny-gruppe-tittel">Utseende</span>
                  {STILER.map(({ key, navn }) => (
                    <button key={key} aria-pressed={stil === key} className={'meny-valg' + (stil === key ? ' valgt' : '')} onClick={() => setStil(key)}>
                      <span className="radio" aria-hidden />
                      {navn}
                    </button>
                  ))}
                </div>
                <hr />
                <button onClick={() => setProsjekt('lister')}>Lister og valg…</button>
                {b.kanSkrive && <button onClick={() => setHentOppsett(true)}>Hent oppsett fra et annet register…</button>}
                {b.snapshots && !b.snapshot && (
                  <>
                    <hr />
                    <button onClick={() => setSnapshots('liste')} title="Ta vare på registeret slik det er nå, og se hva som er endret siden et tidligere snapshot">
                      Snapshots og sammenligning…
                    </button>
                  </>
                )}
                {!moderne && <button onClick={() => setStorMatrise('R')}>Stor risikomatrise…</button>}
                {b.lager && <button onClick={() => setRaadata(true)}>Vis rådata (listene)…</button>}
                {b.lager instanceof GraphLister && (
                  <button
                    title="Lenken kan legges i navigasjonen på SharePoint-området, så alle finner registeret"
                    onClick={() => {
                      const lenke = omraadeLenke(b.lager instanceof GraphLister ? b.lager.omraade.webUrl : '')
                      navigator.clipboard.writeText(lenke).then(
                        () => melding('Lenken til registeret er kopiert.'),
                        () => melding(lenke),
                      )
                    }}
                  >
                    Kopier lenke til registeret
                  </button>
                )}
                {b.type === 'demo' && !b.snapshot && (
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

        {b.snapshot && (
          <div className="banner advarsel">
            Du ser på snapshotet «{b.snapshot.navn}» fra {new Date(b.snapshot.tidspunkt).toLocaleString('nb-NO')}, tatt av {b.snapshot.tattAv}. Det kan ikke endres.
            <button className="knapp" onClick={lukkSnapshot}>
              Til registeret slik det er nå
            </button>
          </div>
        )}

        <UlagretBanner okt={okt} snap={snap} />
        {doc.risker.length === 0 && b.kanSkrive && !b.snapshot && (
          <div className="banner info tomt">
            <span>Registeret er tomt. Har et annet prosjekt et oppsett dere vil bruke, kan du hente kategorier, nedtrekkslister og deltakere derfra.</span>
            <button className="knapp" onClick={() => setHentOppsett(true)}>
              Hent oppsett fra et annet register…
            </button>
          </div>
        )}
        <AvklarDialog okt={okt} konflikter={snap.avklar} />
        <AvvikBanner okt={okt} />
        {manglende.length > 0 && (
          <div className="banner advarsel">
            <span>
              {manglende.length === 1 ? 'Kolonnen ' : 'Kolonnene '}
              {manglende.map((k) => `«${k.kolonne}» (${LISTER[k.liste].visningsnavn})`).join(', ')} er slettet fra listene i SharePoint. Endringer i{' '}
              {manglende.length === 1 ? 'det feltet' : 'de feltene'} blir ikke lagret, resten lagres som vanlig.
              {b.kanSkrive && b.lager?.opprettKolonner && ' De kan lages på nytt, men verdiene som lå i dem, kommer ikke tilbake.'}
              {kolonneFeil && <span className="feil"> {kolonneFeil}</span>}
            </span>
            {b.kanSkrive && b.lager?.opprettKolonner && (
              <button
                className="knapp"
                disabled={lagerKolonner}
                onClick={() => {
                  setLagerKolonner(true)
                  setKolonneFeil(null)
                  b.lager!.opprettKolonner!().then(
                    () => window.location.reload(),
                    (e) => {
                      setKolonneFeil(e instanceof Error ? e.message : String(e))
                      setLagerKolonner(false)
                    },
                  )
                }}
              >
                {lagerKolonner ? 'Lager kolonnene…' : manglende.length === 1 ? 'Opprett kolonnen på nytt' : 'Opprett kolonnene på nytt'}
              </button>
            )}
          </div>
        )}

        {mot && !paaRisikobilde && (
          <div className="banner info sammenligner">
            <span title="Endringer i BC, ML, WC, FV og summene vises i tabellen og oversikten, og som piler i risikomatrisen.">
              Sammenligner med snapshot <b>«{mot.info.navn}»</b> ({new Date(mot.info.tidspunkt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })})
            </span>
            {!paaRisikobilde && (
              <button className="knapp liten" onClick={() => aapneMatrise('R')}>
                {moderne ? 'Risikobilde' : 'Risikomatrise'}
              </button>
            )}
            <button className="knapp liten" onClick={() => setSnapshots('endringer')}>
              Endringsliste
            </button>
            <button className="lenkeknapp" onClick={() => setMot(null)}>
              Avslutt sammenligning
            </button>
          </div>
        )}

        {paaRisikobilde ? (
          <Risikobilde
            doc={doc}
            rm={side.rm}
            mot={mot}
            setMot={setMot}
            snapshots={b.snapshot ? undefined : b.snapshots}
            okt={okt}
            endre={endre}
            kanSkrive={b.kanSkrive}
            detalj={(id, lukk) => <Detaljpanel okt={okt} doc={doc} riskId={id} endre={endre} lukk={lukk} kanSkrive={b.kanSkrive} />}
            melding={melding}
            taSnapshot={() => setSnapshots('liste')}
            autoValgt={autoSnapshot}
            oppdatert={snapshotsLukket}
            visning={visning}
            setVisning={setVisning}
          />
        ) : (
        <>
        {visning.visOversikt && <Oversikt doc={doc} visning={visning} setVisning={setVisning} mot={mot?.doc} aapneMatrise={aapneMatrise} moderne={moderne} samlet={samlet} />}

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
            {!samlet && grupperValg}
            <FagMeny doc={doc} visning={visning} setVisning={setVisning} endre={endre} kanSkrive={b.kanSkrive} />
            {personValg}
            {!mobil && !samlet && kolonneKnapp}
            </>
          )}
          {!samlet && oversiktKnapp}
          {filterAktivt && visning.fane !== 'skarisk' && (
            <span className="filterinfo">
              Viser {antall.vist} av {antall[visning.fane]}
              <button className="lenkeknapp" onClick={() => setVisning((v) => ({ ...v, sok: '', fag: [], person: undefined, filter: { verdier: {}, tekst: {} } }))}>
                Fjern alle filtre
              </button>
            </span>
          )}
          {/* Samlet: visningsvalgene og Ny risk samlet til høyre */}
          {samlet && (
            <div className="verktoy-hoyre">
              {visning.fane !== 'skarisk' && grupperValg}
              {visning.fane !== 'skarisk' && !mobil && kolonneKnapp}
              {oversiktKnapp}
              {b.kanSkrive && visning.fane !== 'skarisk' && !mobil && (
                <button className="knapp primær" onClick={() => setNyRiskTeller((n) => n + 1)}>
                  <Pluss /> Ny risk
                </button>
              )}
            </div>
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
              <Kortliste okt={okt} doc={doc} andre={andre} visning={visning} aapne={setDetalj} endre={endre} kanSkrive={b.kanSkrive} melding={melding} />
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
            mot={motRisker}
            moderne={moderne}
            samlet={samlet}
            nyRiskTeller={nyRiskTeller}
          />
          )}
          {detalj && <Detaljpanel okt={okt} doc={doc} riskId={detalj} endre={endre} lukk={() => setDetalj(null)} kanSkrive={b.kanSkrive} />}
        </div>
        </>
        )}

        {snapshots && b.snapshots && (
          <SnapshotDialog
            snapshots={b.snapshots}
            doc={doc}
            kanSkrive={b.kanSkrive}
            lukk={() => (setSnapshots(false), setSnapshotsLukket((n) => n + 1))}
            melding={melding}
            aapneRisk={(id) => (setSide((x) => ({ ...x, navn: 'register' })), setDetalj(id))}
            aktiver={setMot}
            start={snapshots === 'endringer' && mot ? mot : undefined}
          />
        )}
        {storMatrise && (
          <StorMatrise
            doc={doc}
            risker={filtrer(doc, { ...visning, filter: { ...visning.filter, matrise: undefined } })}
            rm={storMatrise}
            mot={mot ? { navn: mot.info.navn, risker: motRisker! } : undefined}
            okt={okt}
            endre={endre}
            kanSkrive={b.kanSkrive}
            detalj={(id, lukk) => <Detaljpanel okt={okt} doc={doc} riskId={id} endre={endre} lukk={lukk} kanSkrive={b.kanSkrive} />}
            melding={melding}
            lukk={() => setStorMatrise(null)}
          />
        )}
        {raadata && b.lager && <RaadataDialog lager={b.lager} lukk={() => setRaadata(false)} />}
        {prosjekt && (
          <Prosjektpanel
            doc={doc}
            endre={endre}
            lukk={() => setProsjekt(false)}
            kanSkrive={b.kanSkrive}
            start={prosjekt}
            hentOppsett={() => (setProsjekt(false), setHentOppsett(true))}
          />
        )}
        {hentOppsett && (
          <HentOppsett doc={doc} endre={endre} lukk={() => setHentOppsett(false)} type={b.type} bruker={b.bruker} egetNavn={b.tittel.replace('Demo › ', '')} />
        )}
        {filvelger === 'aapne' && (
          <Filvelger
            modus="aapne"
            kilde={filKilde()}
            valgt={(filnavn, data) => {
              setImportert({ reg: lesExcel(data, filnavn), filnavn })
              setFilvelger(null)
            }}
            lukk={() => setFilvelger(null)}
          />
        )}
        {filvelger === 'lagre' && (
          <Filvelger
            modus="lagre"
            kilde={filKilde()}
            filnavn={excelFil(doc).navn}
            data={() => excelFil(doc).data}
            lagretPc={() => {
              const f = excelFil(doc)
              lastNed(f.navn, f.data)
              setFilvelger(null)
            }}
            lagret={(navn, mappe) => {
              melding(`Lagret «${navn}» i ${mappe}.`)
              setFilvelger(null)
            }}
            lukk={() => setFilvelger(null)}
          />
        )}
        {importert && (
          <ImportDialog
            doc={doc}
            kilde={importert.reg}
            filnavn={importert.filnavn}
            bruker={b.bruker}
            endre={endre}
            ferdig={(tekst) => {
              melding(tekst)
              setImportert(null)
            }}
            lukk={() => setImportert(null)}
          />
        )}

        <Meldinger antall={meldinger.length}>
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
        </Meldinger>
      </div>
    </PersonKontekst.Provider>
  )
}

// Meldingene nederst. Ligger i et popover-lag når nettleseren støtter det, så de også vises over en åpen dialog
// (dialogene ligger i nettleserens øverste lag, over alt med z-index). Løftes øverst igjen ved hver ny melding.
// role="status" gjør at skjermlesere leser opp meldingene.
const harPopover = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype
function Meldinger({ antall, children }: { antall: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const forrige = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !harPopover) return
    try {
      if (antall > forrige.current && el.matches(':popover-open')) el.hidePopover()
      if (!el.matches(':popover-open')) el.showPopover()
    } catch {
      // Ikke støttet likevel: meldingene vises som før, med z-index
    }
    forrige.current = antall
  }, [antall])
  return (
    <div className="meldinger" ref={ref} role="status" popover={harPopover ? 'manual' : undefined}>
      {children}
    </div>
  )
}

// Samlet utseende: kolonnene er faste og slått sammen, så her kan de bare vises eller skjules
const SAMLET_KOLONNER: [string, string][] = [
  ['eier', 'Risikoeier og kategori'],
  ['eksponering', 'Eksponering'],
  ['fv', 'Forventet kost'],
  ['tiltak', 'Tiltak, eier og frist'],
  ['tilSkarisk', 'Til Skarisk'],
]

// Avkrysningsboks for en hel gruppe: huket av når alle er valgt, med strek når bare noen er det
function AlleValgt({ alle, noen, onChange }: { alle: boolean; noen: boolean; onChange: (paa: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = noen
  }, [noen])
  return <input ref={ref} type="checkbox" checked={alle} onChange={() => onChange(!alle)} />
}

function SamletKolonnevelger({ doc, visning, setVisning, lukk }: { doc: Register; visning: Visning; setVisning: (f: (v: Visning) => Visning) => void; lukk: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && lukk()
    setTimeout(() => window.addEventListener('mousedown', h, true))
    return () => window.removeEventListener('mousedown', h, true)
  }, [lukk])
  return (
    <div className="nedtrekk kolonnevelger samlet-kolonnevelger" ref={ref}>
      <div className="meny-tittel">Vis kolonner</div>
      <label className="kollabel">
        <input type="checkbox" checked disabled /> Hendelse, årsak og konsekvens
      </label>
      {/* De egendefinerte feltene vises som nedtrekkslister under konsekvensen i risikokortet */}
      {(
        [
          ['egendef', doc.lister.egendefNavn],
          ...(doc.lister.egendef2Aktiv ? [['egendef2', doc.lister.egendef2Navn]] : []),
        ] as [string, string][]
      ).map(([key, navn]) => (
        <label key={key} className="kollabel underkol">
          <input
            type="checkbox"
            checked={(visning.samletEgendef ?? []).includes(key)}
            onChange={(e) =>
              setVisning((v) => {
                const naa = (v.samletEgendef ?? []).filter((x) => x !== key)
                return { ...v, samletEgendef: e.target.checked ? [...naa, key].sort() : naa }
              })
            }
          />{' '}
          {navn}
        </label>
      ))}
      {SAMLET_KOLONNER.map(([key, navn]) => (
        <label key={key} className="kollabel">
          <input
            type="checkbox"
            checked={!visning.skjulteKolonner.includes(key)}
            onChange={(e) =>
              setVisning((v) => ({ ...v, skjulteKolonner: e.target.checked ? v.skjulteKolonner.filter((x) => x !== key) : [...v.skjulteKolonner, key] }))
            }
          />{' '}
          {navn}
        </label>
      ))}
    </div>
  )
}

function Kolonnevelger({ doc, visning, setVisning, lukk }: { doc: Register; visning: Visning; setVisning: (f: (v: Visning) => Visning) => void; lukk: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && lukk()
    setTimeout(() => window.addEventListener('mousedown', h, true))
    return () => window.removeEventListener('mousedown', h, true)
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
      {GRUPPER.filter((g) => g.key !== 'fast').map((g) => {
        const kols = KOLONNER.filter((k) => k.gruppe === g.key && (k.key !== 'egendef2' || doc.lister.egendef2Aktiv))
        const valgbare = kols.filter((k) => !k.frosset).map((k) => k.key)
        const synlige = valgbare.filter((key) => !visning.skjulteKolonner.includes(key)).length
        const sammen = visning.skjulteGrupper.includes(g.key)
        return (
          <div key={g.key} className={'kolgruppe' + (sammen ? ' sammen' : '')}>
            <div className="gruppelabel">
              {/* Gruppeavhukingen velger alle eller ingen av kolonnene. Sammenslåing er et eget valg til høyre. */}
              <label>
                <AlleValgt
                  alle={synlige === valgbare.length}
                  noen={synlige > 0 && synlige < valgbare.length}
                  onChange={(paa) =>
                    setVisning((v) => ({
                      ...v,
                      skjulteKolonner: paa ? v.skjulteKolonner.filter((x) => !valgbare.includes(x)) : [...v.skjulteKolonner.filter((x) => !valgbare.includes(x)), ...valgbare],
                    }))
                  }
                />
                <strong>{g.tittel}</strong>
              </label>
              <button
                className="lenkeknapp sammen-knapp"
                title={sammen ? 'Vis kolonnene i gruppen hver for seg' : 'Slå gruppen sammen til én kolonne'}
                onClick={() => setVisning((v) => ({ ...v, skjulteGrupper: sammen ? v.skjulteGrupper.filter((x) => x !== g.key) : [...v.skjulteGrupper, g.key] }))}
              >
                {sammen ? 'Utvid' : 'Slå sammen'}
              </button>
            </div>
            {sammen && <div className="liten sammen-info">Slått sammen til én kolonne ({KOLONNER.find((k) => k.key === g.hoved)?.tittel(doc)})</div>}
            {kols.map((k) => (
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
        )
      })}
      <button className="lenkeknapp" onClick={() => setVisning((v) => ({ ...v, skjulteGrupper: [], skjulteKolonner: [], bredder: {} }))}>
        Tilbakestill kolonner og bredder
      </button>
    </div>
  )
}

