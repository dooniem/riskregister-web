import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GRUPPER, KOLONNER } from '../columns'
import { excelFil, lastNed, lesExcel } from '../excel'
import { SkariskVisning } from './Skarisk'
import { FagMeny, fagForNyRisk } from './Fag'
import type { Register } from '../model'
import { aktivLaas, kommendeLaas, LAAS_NEDTELLING_S, nyRisk } from '../model'
import type { Konflikt, Op } from '../ops'
import { SimulertKollega } from '../sim'
import type { Okt } from '../sync'
import type { Snarvei, Stil, Visning } from '../view'
import { STANDARD_VISNING, SNARVEIER, aktivGruppering, aktivUndergruppering, byttStjerner, grupperinger, iFane, iSnarvei, STILER, filtrer, lagreStil, lesStil } from '../view'
import { DemoFiler, type FilKilde } from '../store/filer'
import { GraphFiler } from '../store/graphFiler'
import { GraphLister, omraadeLenke } from '../store/lister/graphLister'
import { fulleInnstillinger, INNSTILLING_MAKS_TEGN, LISTER } from '../store/lister/skjema'
import { AvklarDialog, AvvikBanner, UlagretBanner } from './Avvik'
import { Detaljpanel } from './Detaljpanel'
import { Filvelger } from './Filvelger'
import { ImportDialog } from './ImportDialog'
import { Grid } from './Grid'
import { Kortliste } from './Kortliste'
import { Kolonneikon, Laas, Meny, Pil, Pluss } from './Ikoner'
import { PersonMeny } from './PersonMeny'
import { VisningKnapper } from './Visninger'
import { HentOppsett } from './HentOppsett'
import { Oversikt } from './Oversikt'
import { Prosjektpanel } from './Prosjektpanel'
import { RaadataDialog } from './Raadata'
import { OmDialog } from './Om'
import { BruddDialog, bruddTekst, LaasDialog, visTid } from './LaasDialog'
import { SnarveierDialog } from './Snarveier'
import { SnapshotDialog } from './Snapshots'
import { ByttFaseDialog } from './ByttFase'
import { VelgFaseBanner } from './VelgFase'
import { usikreFaser } from '../hvile'
import { HistorikkDialog, HistorikkKontekst } from './Historikk'
import { StorMatrise } from './StorMatrise'
import { Risikobilde } from './Risikobilde'
import { PersonKontekst, deltakerOp, type Personer } from './Personer'
import { DemoKatalog, GraphKatalog } from '../store/katalog'
import type { IndeksVarsel, SnapshotInfo } from '../store/backend'
import type { Risk } from '../model'
import { useProfil } from '../profil'

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
    case 'setHvile':
      return { ...op, hvile: op.fra ?? null, fra: op.hvile }
    case 'setFellesVisning':
      return { ...op, visning: op.fra ?? null, fra: op.visning }
    default:
      return null
  }
}

export function RegisterView({ okt, tilbake }: Props) {
  const snap = useSyncExternalStore(okt.abonner, okt.hentSnap)
  const { doc, andre, status } = snap
  const b = okt.backend
  // Registeret kan låses for redigering frem til et tidspunkt (Mer › Lås riskregister). Da kan alle lese, men ingen endre.
  // Først telles det ned i LAAS_NEDTELLING_S sekunder, så andre rekker å fullføre det de holder på med.
  // «naa» oppdateres hvert sekund under nedtellingen og når låsen går ut, så alt skjer uten at siden må lastes på nytt.
  const [naa, setNaa] = useState(() => Date.now())
  const laas = b.snapshot ? null : aktivLaas(doc, naa)
  const kommende = b.snapshot ? null : kommendeLaas(doc, naa)
  const laastAvMeg = !!laas && laas.avId === b.bruker.id
  // Den som låste, kan fortsatt endre (f.eks. rette en risk eller en visning under gjennomgangen). Alle andre kan bare lese.
  const kanSkrive = b.kanSkrive && (!laas || laastAvMeg)
  const laasNokkel = doc.laas ? `${doc.laas.fra ?? ''}|${doc.laas.til}` : ''
  useEffect(() => {
    if (!laasNokkel) return
    const [fra, til] = laasNokkel.split('|').map((x) => (x ? Date.parse(x) : 0))
    const igjen = fra > Date.now() ? Math.min(fra - Date.now(), 1000) : til - Date.now() + 300
    if (!(igjen > 0)) return
    // setTimeout tåler ikke mer enn ca. 24 dager, så lange låser sjekkes på nytt hver time
    const t = window.setTimeout(() => setNaa(Date.now()), Math.min(igjen, 3_600_000))
    return () => window.clearTimeout(t)
  }, [laasNokkel, naa])
  const [laasDialog, setLaasDialog] = useState(false)
  // Endringer gjort direkte i SharePoint mens registeret er låst. Vises som én linje i banneret, med hele listen i et eget vindu.
  const [bruddVindu, setBruddVindu] = useState(false)
  const [lukketFjernet, setLukketFjernet] = useState('')
  const lb = b.snapshot ? undefined : b.laasBrudd
  const brudd = lb && laas && lb.laas === `${laas.fra ?? laas.tid}|${laas.til}` ? lb.endringer : []
  // Låsen ble fjernet i SharePoint før tiden. Vises til noen lukker beskjeden eller registeret låses på nytt.
  const fjernet = lb?.fjernet && !laas && !kommende && lukketFjernet !== lb.laas ? { ...lb.fjernet, endringer: lb.endringer, nokkel: lb.laas } : null
  const visningKey = `rr-visning:${doc.registerId}`
  const [visning, setVisningRaw] = useState<Visning>(() => lesVisning(visningKey))
  const [detalj, setDetalj] = useState<string | null>(null)
  // Vedleggene i panelet: «vis» blar ned til dem, «filer» er filer som er sluppet på en rad i tabellen og skal lastes opp
  const [vedleggStart, setVedleggStart] = useState<{ riskId: string; filer?: File[] } | null>(null)
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
  const [historikkFor, setHistorikkFor] = useState<string | null>(null)
  const hentHistorikk = useCallback((id: string) => b.historikk?.(id) ?? Promise.resolve([]), [b])
  const [snapshots, setSnapshots] = useState<false | 'liste' | 'endringer'>(false)
  const [byttFase, setByttFase] = useState(false)
  const [storMatrise, setStorMatrise] = useState<'R' | 'M' | null>(null)
  // Snapshotet registeret sammenlignes med akkurat nå
  const [mot, setMot] = useState<{ info: SnapshotInfo; doc: Register } | null>(null)
  const motRisker = useMemo(() => (mot ? new Map<string, Risk>(mot.doc.risker.map((r) => [r.id, r])) : undefined), [mot])
  const [raadata, setRaadata] = useState(false)
  const [om, setOm] = useState(false)
  const [kolonneFeil, setKolonneFeil] = useState<string | null>(null)
  const [lagerKolonner, setLagerKolonner] = useState(false)
  const manglende = b.snapshot ? [] : (b.lager?.manglendeKolonner?.() ?? [])
  const angreStabel = useRef<Op[][]>([])
  const mobil = useMobil()
  const [stil, setStilRaw] = useState<Stil>(lesStil)
  const setStil = (s: Stil) => (setStilRaw(s), lagreStil(s))
  // Samlet er moderne med flere kolonner slått sammen, så alt som gjelder moderne gjelder også samlet
  const moderne = stil !== 'klassisk'
  const profil = useProfil()
  const samlet = stil === 'samlet'
  // Moderne visning har to sider: registeret og risikobildet
  const [side, setSide] = useState<{ navn: 'register' | 'risikobilde'; rm: 'R' | 'M' }>({ navn: 'register', rm: 'R' })

  // Tastatursnarveier: / går til søkefeltet, Alt+N lager en ny risk og ? viser oversikten (Snarveier.tsx). Ingen av dem brukes av Windows eller nettleserne,
  // og nettleseren får bare tastene når siden har fokus. De virker ikke når du skriver i et felt eller har en dialog åpen.
  // Lyttes på i fangstfasen, så tabellen ikke tolker tastene som starten på en redigering.
  const sokRef = useRef<HTMLInputElement>(null)
  const [snarveier, setSnarveier] = useState(false)
  // Øker når Enter trykkes i søkefeltet, så tabellen markerer første treff
  const [forsteTreffTeller, setForsteTreffTeller] = useState(0)
  const kanLageRisk = kanSkrive && !b.snapshot && visning.fane !== 'skarisk' && visning.fane !== 'hviler' && !mobil
  useEffect(() => {
    if (mobil) return
    const h = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.isComposing) return
      const sok = e.key === '/' && !e.altKey
      const ny = e.altKey && !e.shiftKey && e.code === 'KeyN'
      const hjelp = e.key === '?' && !e.altKey
      if (!sok && !ny && !hjelp) return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable)) return
      if (document.querySelector('dialog[open]')) return
      if (ny && !kanLageRisk) return
      e.preventDefault()
      e.stopPropagation()
      setMeny(false)
      if (hjelp) return setSnarveier(true)
      const tilRegister = moderne && side.navn !== 'register'
      if (tilRegister) setSide((s) => ({ ...s, navn: 'register' }))
      // Vent til registeret er tegnet hvis vi kom fra risikobildet
      setTimeout(() => {
        if (sok) {
          sokRef.current?.focus()
          sokRef.current?.select()
        } else setNyRiskTeller((n) => n + 1)
      }, 0)
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [mobil, moderne, side.navn, kanLageRisk])
  const paaRisikobilde = moderne && side.navn === 'risikobilde'
  const autoSnapshot = useRef(false)
  const [snapshotsLukket, setSnapshotsLukket] = useState(0)
  // Det siste snapshotet, som snarveien «Nye siden siste snapshot» regner fra. Hentes på nytt når snapshotvinduet lukkes.
  const [sisteSnapshot, setSisteSnapshot] = useState<SnapshotInfo | null>(null)
  const [indeksVarsel, setIndeksVarsel] = useState<IndeksVarsel | null>(null)
  useEffect(() => {
    if (!b.snapshots || b.snapshot) return
    let aktiv = true
    const snapshots = b.snapshots
    snapshots
      .liste()
      .then((l) => {
        if (!aktiv) return
        setSisteSnapshot(l.reduce<SnapshotInfo | null>((m, x) => (!m || x.tidspunkt > m.tidspunkt ? x : m), null))
        // Reserve i tilfelle IT ikke har indeksert snapshotlistene: prøver selv når listene nærmer seg 5 000 rader
        void snapshots
          .sjekkIndekser?.(l)
          .then((v) => aktiv && setIndeksVarsel(v))
          .catch(() => {})
      })
      .catch(() => {
        /* snarveien vises ikke uten snapshots */
      })
    return () => {
      aktiv = false
    }
  }, [b.snapshots, b.snapshot, snapshotsLukket])
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
    okt.onStoppetAvLaas = (av) => melding(`Endringen ble ikke lagret, fordi ${av} har låst registeret for redigering.`)
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
    if (laas && !laastAvMeg) return melding(`Registeret er låst for redigering av ${laas.av}.`)
    const ops = angreStabel.current.pop()
    if (!ops) return melding('Ingenting å angre.')
    const r = ops.map((o) => ('riskId' in o ? o.riskId : 'risk' in o ? o.risk.id : '')).find(Boolean)
    if (r && okt.laastAv(r)) return melding('Kan ikke angre: risken redigeres av en annen akkurat nå.')
    // Oppdater «fra» til nåværende verdi slik at angring ikke rapporteres som konflikt
    okt.utfor(...ops)
  }, [okt, melding, laas, laastAvMeg])

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
      aapne: doc.risker.filter((r) => iFane(r, 'aapne', doc)).length,
      hviler: doc.risker.filter((r) => iFane(r, 'hviler', doc)).length,
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

  const laasOpp = () => {
    okt.utfor({ t: 'setLaas', laas: null })
    melding(laas ? 'Registeret er åpnet for redigering igjen.' : 'Låsingen er avbrutt.')
  }

  const filterAktivt = !!visning.sok || Object.keys(visning.filter.verdier).length > 0 || Object.values(visning.filter.tekst).some(Boolean) || !!visning.filter.matrise || !!visning.filter.snarvei || !!visning.fag?.length || !!visning.person || !!visning.kunStjerner
  const tittel = [doc.prosjekt.nummer, doc.prosjekt.navn].filter(Boolean).join(' ') || 'Riskregister uten navn'
  // Endringer samles noen sekunder før de lagres. Så lenge noen venter, sier vi det i stedet for «lagret».
  const visStatus = status === 'lagret' && snap.ventende ? 'lagrer' : status
  // Søk i organisasjonen for risikoeier, tiltakseier og deltakere. Demoen har en oppdiktet organisasjon.
  const personer = useMemo<Personer | null>(
    () =>
      kanSkrive
        ? {
            katalog: b.type === 'demo' ? new DemoKatalog() : new GraphKatalog(),
            leggTil: (p) => {
              const op = deltakerOp(okt.doc.deltakere, p)
              if (op) okt.utfor(op)
            },
          }
        : null,
    [b, okt, kanSkrive],
  )

  // Lukkede-fanen husker sin egen gruppering, så «Når lukket» der ikke endrer grupperingen i de andre fanene
  const gruppering = aktivGruppering(visning)
  const usikre = useMemo(() => usikreFaser(doc), [doc])
  const velgGruppering = (key: string) => setVisning((v) => (v.fane === 'lukkede' ? { ...v, grupperingLukkede: key } : { ...v, gruppering: key }))

  // Snarveiene teller i fanen som vises, uten de andre filtrene, så tallene står fast mens man filtrerer
  const visSnarveier = !b.snapshot && (visning.fane === 'aapne' || visning.fane === 'alle')
  const snarveiFra = sisteSnapshot?.tidspunkt
  const snarveiAntall = useMemo(() => {
    const ut = {} as Record<Snarvei, number>
    const iFanen = doc.risker.filter((r) => iFane(r, visning.fane, doc))
    for (const s of SNARVEIER) ut[s.key] = iFanen.filter((r) => iSnarvei(r, s.key, doc, snarveiFra)).length
    return ut
  }, [doc, visning.fane, snarveiFra])
  const velgSnarvei = (key: Snarvei) =>
    setVisning((v) => ({ ...v, filter: v.filter.snarvei === key ? { ...v.filter, snarvei: undefined, snarveiFra: undefined } : { ...v.filter, snarvei: key, snarveiFra } }))

  // «Og deretter»: undergruppering av hver gruppe. Vises når det er valgt en gruppering.
  const undergruppering = aktivUndergruppering(visning)
  const undervalg = grupperinger(doc, visning.fane).filter((g) => g.key !== gruppering && g.key !== 'hvile')
  const velgUndergruppering = (key: string) => setVisning((v) => ({ ...v, undergruppering: key }))
  const undergrupperValg = !gruppering ? null : samlet ? (
    <label className="knapp grupper-knapp">
      og deretter: {undergruppering ? undervalg.find((g) => g.key === undergruppering)?.tittel : 'Ingen'} <Pil />
      <select aria-label="Og deretter grupper etter" value={undergruppering} onChange={(e) => velgUndergruppering(e.target.value)}>
        {undervalg.map((g) => (
          <option key={g.key} value={g.key}>
            {g.tittel}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <label className="velg">
      og deretter
      <select aria-label="Og deretter grupper etter" value={undergruppering} onChange={(e) => velgUndergruppering(e.target.value)}>
        {undervalg.map((g) => (
          <option key={g.key} value={g.key}>
            {g.tittel}
          </option>
        ))}
      </select>
    </label>
  )
  const grupperValg = samlet ? (
    // Ser ut som en knapp («Grupper: Ingen»), men er en vanlig nedtrekksliste under, så tastatur og skjermleser virker som før
    <label className="knapp grupper-knapp">
      Grupper: {gruppering ? grupperinger(doc, visning.fane).find((g) => g.key === gruppering)?.tittel : 'Ingen'} <Pil />
      <select aria-label="Grupper etter" value={gruppering} onChange={(e) => velgGruppering(e.target.value)}>
        {grupperinger(doc, visning.fane).map((g) => (
          <option key={g.key} value={g.key}>
            {g.tittel}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <label className="velg">
      Grupper etter
      <select value={gruppering} onChange={(e) => velgGruppering(e.target.value)}>
        {grupperinger(doc, visning.fane).map((g) => (
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
    <HistorikkKontekst.Provider value={b.historikk && !b.snapshot ? setHistorikkFor : null}>
      <div className={'app' + (visning.skjulFag ? ' skjul-fag' : '') + (moderne ? ' stil-moderne' : '') + (samlet ? ' stil-samlet' : '')}>
        <header className="toppfelt">
          <button className="ikonknapp hjem" onClick={tilbake} title="Til startsiden">
            <Pil retning="venstre" str={18} />
          </button>
          {moderne && profil?.logo && <img className="toppfelt-logo" src={profil.logo} alt={profil.navn} />}
          <div className="tittel">
            <h1 title={tittel}>{tittel}</h1>
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
              {b.snapshot ? ` · snapshot «${b.snapshot.navn}»` : !b.kanSkrive ? ' · bare lesetilgang' : laas && ' · låst for redigering'}
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
          <div className={'lagrestatus ' + visStatus} title={snap.feil || statusTekst}>
            <span className="prikk" /> <span className="lagrestatus-tekst">{statusTekst}</span>
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
                {kanSkrive && (
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
                  <button
                    aria-pressed={!visning.skjulMarkering}
                    className={'meny-valg' + (!visning.skjulMarkering ? ' valgt' : '')}
                    onClick={() => setVisning((v) => ({ ...v, skjulMarkering: !v.skjulMarkering }))}
                    title="Bakgrunnsfargene på risknummer og tiltak. Skru dem av før utskrift eller presentasjon. Fargene blir liggende i registeret."
                  >
                    <span className="boks" aria-hidden />
                    Vis fargemarkering
                  </button>
                </div>
                <hr />
                <button onClick={() => setProsjekt('lister')}>Lister og valg…</button>
                {kanSkrive && <button onClick={() => setHentOppsett(true)}>Hent oppsett fra et annet register…</button>}
                {b.kanSkrive && !b.snapshot && (laas || kommende ? (laas ?? kommende)!.avId === b.bruker.id : true) && (
                  <>
                    <hr />
                    <button
                      className="meny-med-ikon"
                      onClick={() => (laas || kommende ? laasOpp() : setLaasDialog(true))}
                      title={laas ? 'Åpne registeret for redigering igjen nå' : kommende ? 'Stopp nedtellingen, så blir registeret ikke låst' : 'Ingen andre enn deg kan endre registeret før det åpner igjen. Alle kan fortsatt lese det.'}
                    >
                      <Laas str={14} />
                      {laas ? 'Lås opp riskregister' : kommende ? 'Avbryt låsingen' : 'Lås riskregister…'}
                    </button>
                  </>
                )}
                {b.snapshots && !b.snapshot && (
                  <>
                    <hr />
                    <button onClick={() => setSnapshots('liste')} title="Ta vare på registeret slik det er nå, og se hva som er endret siden et tidligere snapshot">
                      Snapshots og sammenligning…
                    </button>
                  </>
                )}
                {kanSkrive && !b.snapshot && (
                  <button onClick={() => setByttFase(true)} title="Ta et milepæl-snapshot, gå gjennom de åpne riskene og sett ny fase, f.eks. fra tilbud til produksjon">
                    Bytt fase…
                  </button>
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
                <hr />
                <button onClick={() => setOm(true)}>Om Riskregister…</button>
              </div>
            )}
          </div>
        </header>

        {kommende && (
          <div className="banner advarsel registerlaas-snart" role="status">
            <Laas str={15} />
            <span>
              <b>
                {kommende.avId === b.bruker.id ? 'Du låser' : `${kommende.av} låser`} registeret for redigering om {Math.min(LAAS_NEDTELLING_S, Math.max(1, Math.ceil((Date.parse(kommende.fra!) - naa) / 1000)))} s.
              </b>{' '}
              {kommende.avId === b.bruker.id ? 'De andre får beskjed og rekker å fullføre det de holder på med.' : 'Fullfør det du holder på med, så blir det lagret.'} Det åpner igjen{' '}
              {visTid(kommende.til)}.
            </span>
            {kommende.avId === b.bruker.id && (
              <button className="knapp" onClick={laasOpp}>
                Avbryt låsingen
              </button>
            )}
          </div>
        )}
        {laas && (
          <div className="banner registerlaas" role="status">
            <Laas str={15} />
            <span>
              {laastAvMeg ? (
                <>
                  <b>Registeret er låst for redigering</b> av deg. Det åpner igjen {visTid(laas.til)}. Du kan fortsatt endre risker og visninger. Alle andre kan bare lese.
                </>
              ) : (
                <>
                  <b>Registeret er låst for redigering</b> av {laas.av}. Det åpner igjen {visTid(laas.til)}. Bare {laas.av} kan endre. Du kan fortsatt lese, søke, skrive ut og
                  eksportere.
                </>
              )}
            </span>
            {laastAvMeg && (
              <button className="knapp" onClick={laasOpp}>
                Lås opp nå
              </button>
            )}
          </div>
        )}
        {/* Endringer gjort direkte i SharePoint mens registeret er låst: alltid ett gult banner, uansett hvor mange endringer */}
        {brudd.length > 0 && (
          <div className="banner advarsel laas-brudd" role="alert">
            <span>
              <b>{bruddTekst(brudd, 'er låst')}</b>
            </span>
            <button className="knapp" onClick={() => setBruddVindu(true)}>
              Vis endringene
            </button>
          </div>
        )}
        {fjernet && (
          <div className="banner advarsel laas-brudd" role="alert">
            <span>
              <b>
                Låsen ble fjernet direkte i SharePoint
                {fjernet.av ? ` av ${fjernet.av}` : ''}
                {fjernet.tid ? ` ${visTid(fjernet.tid)}` : ''}.
              </b>{' '}
              Registeret var låst av {fjernet.laastAv}, og er nå åpent for redigering.
              {fjernet.endringer.length > 0 && ` ${bruddTekst(fjernet.endringer, 'var låst')}`}
            </span>
            {fjernet.endringer.length > 0 && (
              <button className="knapp" onClick={() => setBruddVindu(true)}>
                Vis endringene
              </button>
            )}
            <button className="knapp" onClick={() => setLukketFjernet(fjernet.nokkel)}>
              Lukk
            </button>
          </div>
        )}
        {bruddVindu && (
          <BruddDialog
            endringer={brudd.length ? brudd : (fjernet?.endringer ?? [])}
            visHistorikk={b.historikk ? (id) => (setBruddVindu(false), setHistorikkFor(id)) : undefined}
            lukk={() => setBruddVindu(false)}
          />
        )}
        {b.snapshot && (
          <div className="banner advarsel">
            Du ser på snapshotet «{b.snapshot.navn}» fra {new Date(b.snapshot.tidspunkt).toLocaleString('nb-NO')}, tatt av {b.snapshot.tattAv}. Det kan ikke endres.
            <button className="knapp" onClick={lukkSnapshot}>
              Til registeret slik det er nå
            </button>
          </div>
        )}

        <UlagretBanner okt={okt} snap={snap} />
        {doc.risker.length === 0 && kanSkrive && !b.snapshot && (
          <div className="banner info tomt">
            <span>Registeret er tomt. Har et annet prosjekt et oppsett dere vil bruke, kan du hente kategorier, nedtrekkslister og deltakere derfra.</span>
            <button className="knapp" onClick={() => setHentOppsett(true)}>
              Hent oppsett fra et annet register…
            </button>
          </div>
        )}
        {kanSkrive && !b.snapshot && <VelgFaseBanner doc={doc} endre={endre} />}
        {kanSkrive && !b.snapshot && <PlassVarsel doc={doc} />}
        {indeksVarsel && !b.snapshot && (
          <div className="banner advarsel" role="alert">
            <span>
              {indeksVarsel.kolonner.map((k) => `«${k.liste}» har rundt ${k.rader.toLocaleString('nb-NO')} rader, og kolonnen ${k.kolonne} er ikke indeksert.`).join(' ')} Over 5 000 rader
              slutter snapshots å virke uten indeks. Appen fikk ikke slått på indeksen med din tilgang. Be eieren av området eller IT indeksere kolonnen i SharePoint
              (Listeinnstillinger › Indekserte kolonner).
            </span>
          </div>
        )}
        <AvklarDialog okt={okt} konflikter={snap.avklar} />
        <AvvikBanner okt={okt} />
        {manglende.length > 0 && (
          <div className="banner advarsel">
            <span>
              {manglende.length === 1 ? 'Kolonnen ' : 'Kolonnene '}
              {manglende.map((k) => `«${k.kolonne}» (${LISTER[k.liste].visningsnavn})`).join(', ')} mangler i listene i SharePoint (nye felt fra en oppdatering, eller slettet). Endringer i{' '}
              {manglende.length === 1 ? 'det feltet' : 'de feltene'} blir ikke lagret, resten lagres som vanlig.
              {kanSkrive && b.lager?.opprettKolonner && ' De kan lages på nytt, men verdiene som lå i dem, kommer ikke tilbake.'}
              {kolonneFeil && <span className="feil"> {kolonneFeil}</span>}
            </span>
            {kanSkrive && b.lager?.opprettKolonner && (
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
            kanSkrive={kanSkrive}
            detalj={(id, lukk) => <Detaljpanel okt={okt} doc={doc} riskId={id} endre={endre} lukk={lukk} kanSkrive={kanSkrive && !b.snapshot} filer={filKilde} melding={melding} />}
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
                // Hviler vises bare når noe hviler, så registre som ikke bruker det ser ut som før
                ...(antall.hviler || visning.fane === 'hviler' ? [['hviler', 'Hviler', antall.hviler] as const] : []),
                ['lukkede', 'Lukkede', antall.lukkede],
                ['alle', 'Alle', antall.alle],
                ['skarisk', 'Til Skarisk', antall.skarisk],
              ] as const
            ).map(([k, t, n]) => (
              <button key={k} className={visning.fane === k ? 'valgt' : ''} onClick={() => setVisning((v) => ({ ...v, fane: k, filter: k === 'aapne' || k === 'alle' ? v.filter : { ...v.filter, snarvei: undefined, snarveiFra: undefined } }))}>
                {t} <span className="teller">{n}</span>
              </button>
            ))}
          </nav>
          {visning.fane !== 'skarisk' && (
            <>
            <input
              ref={sokRef}
              className="sok"
              placeholder="Søk i alle felt…"
              aria-keyshortcuts="/"
              title="Søk i alle felt (/). Enter går til første treff, Esc tømmer søket."
              value={visning.sok}
              onChange={(e) => setVisning((v) => ({ ...v, sok: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  setForsteTreffTeller((n) => n + 1)
                } else if (e.key === 'Escape') {
                  // Første Esc tømmer søket, neste går ut av feltet. Stopper her, så Esc ikke også lukker andre ting.
                  e.preventDefault()
                  e.nativeEvent.stopImmediatePropagation()
                  if (visning.sok) setVisning((v) => ({ ...v, sok: '' }))
                  else e.currentTarget.blur()
                }
              }}
            />
            {!samlet && visning.fane !== 'hviler' && grupperValg}
            {!samlet && visning.fane !== 'hviler' && undergrupperValg}
            <FagMeny doc={doc} visning={visning} setVisning={setVisning} endre={endre} kanSkrive={kanSkrive} />
            {personValg}
            {!mobil && !samlet && kolonneKnapp}
            </>
          )}
          {!samlet && oversiktKnapp}
          {filterAktivt && visning.fane !== 'skarisk' && (
            <span className="filterinfo">
              Viser {antall.vist} av {antall[visning.fane]}
              <button className="lenkeknapp" onClick={() => setVisning((v) => ({ ...v, sok: '', fag: [], person: undefined, kunStjerner: false, filter: { verdier: {}, tekst: {} } }))}>
                Fjern alle filtre
              </button>
            </span>
          )}
          {/* Samlet: visningsvalgene og Ny risk samlet til høyre */}
          {samlet && (
            <div className="verktoy-hoyre">
              {visning.fane !== 'skarisk' && visning.fane !== 'hviler' && grupperValg}
              {visning.fane !== 'skarisk' && visning.fane !== 'hviler' && undergrupperValg}
              {visning.fane !== 'skarisk' && !mobil && kolonneKnapp}
              {oversiktKnapp}
              {kanLageRisk && (
                <button className="knapp primær ny-risk" onClick={() => setNyRiskTeller((n) => n + 1)} aria-keyshortcuts="Alt+N" title="Ny risk (Alt+N)">
                  <Pluss /> Ny risk
                </button>
              )}
            </div>
          )}
        </div>

        {visning.fane === 'hviler' && (
          <div className="hvile-info">
            Risker som hviler, er fortsatt åpne, men vises ikke under Åpne før de våkner. Høyreklikk for å vekke en risk med en gang.
            {usikre.length > 0 && (
              <div className="banner advarsel" role="status">
                Noen risker venter på {usikre.length === 1 ? 'fasen' : 'fasene'} {usikre.map((f) => `«${f}»`).join(', ')}, som ikke står i fase-listen eller kommer før fasen prosjektet er i nå. De våkner kanskje aldri av seg selv. Vekk dem, eller hvil dem til en dato.
              </div>
            )}
          </div>
        )}
        <div className="snarvei-rad">
          <div className="visning-gruppe" role="group" aria-label="Visninger">
            <VisningKnapper doc={doc} visning={visning} setVisning={setVisning} brukernavn={b.bruker.navn} kanLagreFelles={kanSkrive && !b.snapshot} endre={endre} melding={melding} snarveiFra={snarveiFra} />
          </div>
          {visSnarveier && (
            <div className="snarvei-gruppe" role="group" aria-label="Snarveier">
              <span className="snarvei-etikett">Snarveier</span>
              {SNARVEIER.filter((s) => (s.key !== 'nye' || snarveiFra) && (s.key !== 'vaaknet' || snarveiAntall.vaaknet || visning.filter.snarvei === 'vaaknet')).map((s) => {
                const valgt = visning.filter.snarvei === s.key
                const n = snarveiAntall[s.key]
                const fra = s.key === 'nye' && sisteSnapshot ? ` («${sisteSnapshot.navn}», ${new Date(sisteSnapshot.tidspunkt).toLocaleDateString('nb-NO')})` : ''
                return (
                  <button
                    key={s.key}
                    className={'snarvei' + (valgt ? ' valgt' : '') + (s.key === 'frist' && n ? ' varsel' : '')}
                    aria-pressed={valgt}
                    title={s.forklaring + fra + (valgt ? '. Klikk igjen for å vise alle.' : '')}
                    onClick={() => velgSnarvei(s.key)}
                  >
                    {s.tittel} <span className="teller">{n}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="hovedflate">
          {visning.fane === 'skarisk' ? (
            <SkariskVisning doc={doc} aapneDetalj={setDetalj} melding={melding} />
          ) : mobil ? (
            <div className="mobilflate">
              {kanSkrive && (
                <button
                  className="knapp primær ny-risk ny-risk-mobil"
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
              <Kortliste okt={okt} doc={doc} andre={andre} visning={visning} aapne={setDetalj} endre={endre} kanSkrive={kanSkrive} melding={melding} byttStjerne={(id) => setVisning((v) => byttStjerner(v, [id]))} />
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
            aapneVedlegg={(id, filer) => (setDetalj(id), setVedleggStart({ riskId: id, filer }))}
            filer={b.snapshot ? undefined : filKilde}
            melding={melding}
            kanSkrive={kanSkrive}
            sperretTekst={laas && !laastAvMeg ? `Registeret er låst for redigering av ${laas.av} til ${visTid(laas.til)}.` : undefined}
            mot={motRisker}
            moderne={moderne}
            samlet={samlet}
            nyRiskTeller={nyRiskTeller}
            forsteTreffTeller={forsteTreffTeller}
          />
          )}
          {detalj && (
            <Detaljpanel
              okt={okt}
              doc={doc}
              riskId={detalj}
              endre={endre}
              lukk={() => (setDetalj(null), setVedleggStart(null))}
              kanSkrive={kanSkrive && !b.snapshot}
              filer={filKilde}
              melding={melding}
              vedleggStart={vedleggStart?.riskId === detalj ? vedleggStart : undefined}
              vedleggStartet={() => setVedleggStart(null)}
            />
          )}
        </div>
        </>
        )}

        {historikkFor && b.historikk && <HistorikkDialog riskId={historikkFor} doc={doc} hent={hentHistorikk} lukk={() => setHistorikkFor(null)} />}
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
            endre={kanSkrive ? endre : undefined}
          />
        )}
        {byttFase && kanSkrive && (
          <ByttFaseDialog
            doc={doc}
            snapshots={b.snapshot ? undefined : b.snapshots}
            endre={endre}
            lukk={() => (setByttFase(false), setSnapshotsLukket((n) => n + 1))}
            melding={melding}
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
            kanSkrive={kanSkrive}
            detalj={(id, lukk) => <Detaljpanel okt={okt} doc={doc} riskId={id} endre={endre} lukk={lukk} kanSkrive={kanSkrive && !b.snapshot} filer={filKilde} melding={melding} />}
            melding={melding}
            lukk={() => setStorMatrise(null)}
          />
        )}
        {raadata && b.lager && <RaadataDialog lager={b.lager} lukk={() => setRaadata(false)} />}
        {snarveier && <SnarveierDialog lukk={() => setSnarveier(false)} />}
        {laasDialog && (
          <LaasDialog
            andre={andre}
            doc={doc}
            lukk={() => setLaasDialog(false)}
            laas={(til) => {
              const tid = Date.now()
              okt.utfor({ t: 'setLaas', laas: { av: b.bruker.navn, avId: b.bruker.id, tid: new Date(tid).toISOString(), fra: new Date(tid + LAAS_NEDTELLING_S * 1000).toISOString(), til } })
              setLaasDialog(false)
            }}
          />
        )}
        {om && <OmDialog demo={b.type === 'demo'} lukk={() => setOm(false)} />}
        {prosjekt && (
          <Prosjektpanel
            doc={doc}
            endre={endre}
            lukk={() => setProsjekt(false)}
            kanSkrive={kanSkrive}
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
    </HistorikkKontekst.Provider>
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
  ['eier', 'Risikoeier'],
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
        <Fragment key={key}>
          <label className="kollabel">
            <input
              type="checkbox"
              checked={!visning.skjulteKolonner.includes(key)}
              onChange={(e) =>
                setVisning((v) => ({ ...v, skjulteKolonner: e.target.checked ? v.skjulteKolonner.filter((x) => x !== key) : [...v.skjulteKolonner, key] }))
              }
            />{' '}
            {navn}
          </label>
          {key === 'eier' && !visning.skjulteKolonner.includes('eier') && (
            <label className="kollabel underkol">
              <input
                type="checkbox"
                checked={!visning.samletUtenKategori}
                onChange={(e) => setVisning((v) => ({ ...v, samletUtenKategori: e.target.checked ? undefined : true }))}
              />{' '}
              Kategori
            </label>
          )}
        </Fragment>
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


// Hvilende risker, felles visninger osv. ligger hver i én rad i Klientinnstillinger, med en grense på antall tegn
function PlassVarsel({ doc }: { doc: Register }) {
  const fulle = useMemo(() => fulleInnstillinger(doc), [doc])
  if (!fulle.length) return null
  const andel = (tegn: number) => Math.round((tegn / INNSTILLING_MAKS_TEGN) * 100)
  const tekst = (k: string, tegn: number) => {
    const p = `${andel(tegn)} %`
    if (k === 'hviler')
      return `Listen over hvilende risker har brukt ${p} av plassen. Den teller også risker som har våknet og fortsatt har merket. Fjern «våknet»-merkene og vekk risker som ikke lenger trenger å hvile.`
    if (k === 'visninger')
      return `De felles visningene (de alle i registeret ser) har brukt ${p} av plassen. Slett felles visninger som ikke brukes. Personlige visninger ligger i nettleseren og teller ikke med.`
    return `Innstillingen «${k}» har brukt ${p} av plassen den har i SharePoint.`
  }
  return (
    <div className="banner advarsel" role="status">
      <span>
        {fulle.map((f) => tekst(f.nokkel, f.tegn)).join(' ')} Blir den full, kan ikke endringer i den lagres.
      </span>
    </div>
  )
}
