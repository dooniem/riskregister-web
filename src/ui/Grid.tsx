import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Kolonne } from '../columns'
import { GRUPPER, KOL, KOLONNER, editorTekst, formatDato, formatEndring, formatTall, tolkInput, visTekst } from '../columns'
import type { Register, Risk, Tiltak } from '../model'
import { KONSEKVENS, SANNSYNLIGHET, eksponering, eksponeringFarge, fagFarge, fv, nyRisk, nyttTiltak } from '../model'
import type { Op, RiskFelt, TiltakFelt } from '../ops'
import type { Tilstede } from '../store/backend'
import type { Okt } from '../sync'
import type { Gruppe, Visning } from '../view'
import { filtrer, filterVerdier, grupper, sorter, summer } from '../view'
import type { Flytt } from './Editor'
import { CelleEditor } from './Editor'
import { FagMerke, FagVelger, fagForNyRisk } from './Fag'
import { KostEditor } from './KostEditor'
import { VurderingEditor } from './VurderingEditor'
import { Laas, Pil } from './Ikoner'
import { RiskInfo } from './RiskInfo'
import { initialer, likNavn } from './Personer'

interface Posisjon {
  riskId: string
  tiltakId?: string
  kol: string
}

interface Linje {
  risk: Risk
  tiltak?: Tiltak
  forste: boolean
  span: number
}

interface Props {
  okt: Okt
  doc: Register
  andre: Tilstede[]
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  endre: (...ops: Op[]) => void
  angre: () => void
  aapneDetalj: (riskId: string) => void
  melding: (tekst: string, handling?: { tekst: string; gjor: () => void }) => void
  kanSkrive: boolean
  // Riskene i snapshotet det sammenlignes med, etter id. Endringer i tallene vises i cellene.
  mot?: Map<string, Risk>
  // Moderne utseende: BC, ML og WC samles i FV-kolonnen, og sannsynlighet og konsekvens i eksponeringskolonnen.
  // De redigeres sammen i et lite vindu.
  moderne?: boolean
  // Samlet utseende: som moderne, men beskrivelse, eierskap og tiltak er alltid slått sammen til én kolonne hver,
  // og R&M vises som et merke i beskrivelsen
  samlet?: boolean
  // Teller som øker når «Ny risk» i verktøylinjen trykkes
  nyRiskTeller?: number
}

const Kalenderikon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
)

// Kolonnene som ikke vises i moderne utseende, fordi de redigeres fra FV- og eksponeringskolonnen
const SAMLET_I_MODERNE = ['bc', 'ml', 'wc', 'sannsynlighet', 'konsekvens']
// Gruppene som bare har én kolonne igjen i moderne utseende. De kan ikke slås sammen.
const ENKEL_GRUPPE = ['kost', 'vurdering']

// Bredder i moderne utseende, der cellene viser mer enn tallet
const MODERNE_BREDDE: Record<string, number> = { fv: 132, eksponering: 128, tilSkarisk: 76 }
// Bredder i moderne utseende når gruppen er slått sammen og cellen viser også det som er skjult
const SAMMEN_BREDDE: Record<string, number> = { tiltak: 400, eier: 190 }
// Smalere i samlet utseende, så hele raden får plass på en vanlig PC-skjerm. Beskrivelsen fyller resten.
const SAMLET_BREDDE: Record<string, number> = { tiltak: 340, eier: 170, hendelse: 340 }
// Overskrifter som er kortere eller tydeligere i samlet utseende
const SAMLET_TITTEL: Record<string, string> = { fv: 'Forventet kost', tilSkarisk: 'Skarisk' }
const SAMMEN_TITTEL: Record<string, string> = { tiltak: 'Tiltak, eier og frist', eier: 'Risikoeier og kategori', hendelse: 'Hendelse, årsak og konsekvens' }
// Gruppene som alltid er slått sammen i samlet utseende
const SAMLET_GRUPPER = ['beskrivelse', 'eierskap', 'tiltak']
// Feltene som vises og redigeres i den sammenslåtte beskrivelsen i samlet utseende
const BESKRIVELSE = ['hendelse', 'aarsak', 'konsekvenser']
const BESKRIVELSE_NAVN: Record<string, string> = { hendelse: 'Hendelse', aarsak: 'Årsak', konsekvenser: 'Konsekvens' }

export function synligeKolonner(v: Visning, egendef2Aktiv = false, moderne = false, samlet = false): Kolonne[] {
  const sammen = samlet ? [...v.skjulteGrupper, ...SAMLET_GRUPPER] : v.skjulteGrupper
  return KOLONNER.filter((k) => {
    if (k.key === 'egendef2' && !egendef2Aktiv) return false
    if (moderne && SAMLET_I_MODERNE.includes(k.key)) return false
    if (samlet && k.key === 'rm') return false
    // Beskrivelsen kan ikke skjules i samlet utseende, den er hele poenget
    if (v.skjulteKolonner.includes(k.key) && !(samlet && k.key === 'hendelse')) return false
    // FV og eksponering er alene i gruppene sine i moderne utseende, så de vises selv om gruppen er slått sammen
    if (moderne && ENKEL_GRUPPE.includes(k.gruppe)) return true
    if (sammen.includes(k.gruppe)) return GRUPPER.find((g) => g.key === k.gruppe)?.hoved === k.key
    return true
  })
}

// Fulle navn på kostkolonnene, vist som hjelpetekst på overskriften
const KOST_NAVN: Record<string, string> = { bc: 'Best case', ml: 'Most likely', wc: 'Worst case', eksponering: 'Sannsynlighet × konsekvens' }

export function Grid({ okt, doc, andre, visning, setVisning, endre, angre, aapneDetalj, melding, kanSkrive, mot, moderne = false, samlet = false, nyRiskTeller = 0 }: Props) {
  const [aktiv, setAktiv] = useState<Posisjon | null>(null)
  const [redigerer, setRedigerer] = useState<(Posisjon & { start: string; erstatt: boolean; markor?: number }) | null>(null)
  const [meny, setMeny] = useState<{ kol: string; x: number; y: number } | null>(null)
  const [kontekst, setKontekst] = useState<{ x: number; y: number; pos: Posisjon } | null>(null)
  const [fagVelger, setFagVelger] = useState<{ riskId: string; x: number; y: number } | null>(null)
  const [lukketGrupper, setLukketGrupper] = useState<string[]>([])
  const [kostEditor, setKostEditor] = useState<{ riskId: string; anker: DOMRect } | null>(null)
  const [vurdEditor, setVurdEditor] = useState<{ riskId: string; anker: DOMRect } | null>(null)
  const boks = useRef<HTMLDivElement>(null)

  const egendef2 = doc.lister.egendef2Aktiv
  const kolonner = useMemo(() => synligeKolonner(visning, egendef2, moderne, samlet), [visning, egendef2, moderne, samlet])
  // Gruppene som er slått sammen. I moderne utseende viser da hovedkolonnen mer av det som er skjult.
  const sammen = useMemo(
    () => (samlet ? [...new Set([...visning.skjulteGrupper, ...SAMLET_GRUPPER])] : moderne ? visning.skjulteGrupper : []),
    [moderne, samlet, visning.skjulteGrupper],
  )
  const bredde = useCallback(
    (k: Kolonne) =>
      visning.bredder[k.key] ??
      (samlet ? SAMLET_BREDDE[k.key] : undefined) ??
      (sammen.includes(k.gruppe) ? SAMMEN_BREDDE[k.key] : undefined) ??
      (moderne ? MODERNE_BREDDE[k.key] : undefined) ??
      k.bredde,
    [visning.bredder, moderne, samlet, sammen],
  )

  const risker = useMemo(() => sorter(filtrer(doc, visning), visning.sortering), [doc, visning])
  // Felles skala for kostspennet i moderne utseende, så spennene kan sammenlignes mellom riskene
  const grupperte: Gruppe[] = useMemo(() => grupper(doc, risker, visning.gruppering), [doc, risker, visning.gruppering])

  // Alle synlige linjer i rekkefølge. En risk tar like mange linjer som den har tiltak (minst én).
  const linjer = useMemo(() => {
    const ut: Linje[] = []
    for (const g of grupperte) {
      if (g.navn && lukketGrupper.includes(g.navn)) continue
      for (const r of g.risker) {
        const n = Math.max(1, r.tiltak.length)
        for (let i = 0; i < n; i++) ut.push({ risk: r, tiltak: r.tiltak[i], forste: i === 0, span: n })
      }
    }
    return ut
  }, [grupperte, lukketGrupper])

  // Venstrekant for frosne kolonner
  const frossenVenstre = useMemo(() => {
    const m: Record<string, number> = {}
    let x = 0
    for (const k of kolonner) {
      if (!k.frosset) break
      m[k.key] = x
      x += bredde(k)
    }
    return m
  }, [kolonner, bredde])

  const tilstedePaa = useMemo(() => {
    const m = new Map<string, Tilstede[]>()
    for (const t of andre) {
      if (!t.riskId) continue
      if (!m.has(t.riskId)) m.set(t.riskId, [])
      m.get(t.riskId)!.push(t)
    }
    return m
  }, [andre])

  const finnLinje = useCallback(
    (p: Posisjon) => {
      const k = kolonner.find((x) => x.key === p.kol)
      let i = linjer.findIndex((l) => l.risk.id === p.riskId && (k?.nivaa === 'risk' ? l.forste : (l.tiltak?.id ?? undefined) === p.tiltakId))
      if (i < 0) i = linjer.findIndex((l) => l.risk.id === p.riskId)
      return i
    },
    [linjer, kolonner],
  )

  useEffect(() => {
    okt.settPosisjon(aktiv?.riskId, aktiv?.kol, aktiv?.tiltakId)
  }, [aktiv, okt])

  // Rull aktiv celle inn i bildet
  useEffect(() => {
    if (!aktiv) return
    const el = boks.current?.querySelector('td.aktiv') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [aktiv])

  const flytt = (retning: Flytt) => {
    if (!aktiv || retning === 'ingen') return
    // Årsak og konsekvens står i hendelse-kolonnen i samlet utseende
    // Pil opp og ned flytter mellom hendelse, årsak og konsekvens før neste risk
    const bi = samlet ? BESKRIVELSE.indexOf(aktiv.kol) : -1
    if (bi >= 0 && ((retning === 'ned' && bi < 2) || (retning === 'opp' && bi > 0))) {
      setAktiv({ ...aktiv, kol: BESKRIVELSE[bi + (retning === 'ned' ? 1 : -1)] })
      return
    }
    const ki = kolonner.findIndex((k) => k.key === (samlet && (BESKRIVELSE.includes(aktiv.kol) || aktiv.kol === 'rm') ? 'hendelse' : aktiv.kol))
    const li = finnLinje(aktiv)
    if (ki < 0 || li < 0) return
    let nyK = ki
    let nyL = li
    const k = kolonner[ki]
    if (retning === 'hoyre') nyK = Math.min(kolonner.length - 1, ki + 1)
    if (retning === 'venstre') nyK = Math.max(0, ki - 1)
    if (retning === 'ned') {
      if (k.nivaa === 'risk') {
        nyL = linjer.findIndex((l, i) => i > li && l.forste)
        if (nyL < 0) nyL = li
      } else nyL = Math.min(linjer.length - 1, li + 1)
    }
    if (retning === 'opp') {
      if (k.nivaa === 'risk') {
        const forrige = linjer.slice(0, li).reverse().find((l) => l.forste && l.risk.id !== linjer[li].risk.id)
        nyL = forrige ? linjer.indexOf(forrige) : li
      } else nyL = Math.max(0, li - 1)
    }
    const l = linjer[nyL]
    const nk = kolonner[nyK]
    let tiltakId = l.tiltak?.id
    if (nk.nivaa === 'risk') tiltakId = l.risk.tiltak[0]?.id
    else if (k.nivaa === 'risk' && nyL === li) tiltakId = aktiv.tiltakId ?? l.tiltak?.id
    setAktiv({ riskId: l.risk.id, tiltakId, kol: nk.key })
  }

  const hentCelle = (p: Posisjon) => {
    const r = doc.risker.find((x) => x.id === p.riskId)
    const k = kolonner.find((x) => x.key === p.kol) ?? KOLONNER.find((x) => x.key === p.kol)
    const t = r?.tiltak.find((x) => x.id === p.tiltakId)
    return { r, k, t }
  }

  // Cellene i moderne utseende som åpner et eget lite redigeringsvindu
  const erKost = (k?: Kolonne) => moderne && k?.key === 'fv'
  const erVurdering = (k?: Kolonne) => moderne && k?.key === 'eksponering'
  const harVindu = (k?: Kolonne) => erKost(k) || erVurdering(k)

  const startRedigering = (p: Posisjon, start?: string, markor?: number) => {
    if (!kanSkrive) return melding('Du har bare lesetilgang til dette registeret.')
    const { r, k, t } = hentCelle(p)
    if (r && harVindu(k)) {
      const av = okt.laas(r.id)
      if (av) return melding(`Risk ${r.nr} redigeres av ${av} akkurat nå. Prøv igjen når de er ferdige.`)
      const td = boks.current?.querySelector(`tbody[data-risk="${r.id}"] td.k-${k!.key}`)
      if (!td) return
      const apne = erKost(k) ? setKostEditor : setVurdEditor
      apne({ riskId: r.id, anker: td.getBoundingClientRect() })
      return
    }
    if (!r || !k || !k.felt) return
    const av = okt.laas(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av} akkurat nå. Prøv igjen når de er ferdige.`)
    setRedigerer({ ...p, start: start ?? editorTekst(k, r, t), erstatt: start !== undefined, markor })
  }

  const lagreVerdi = (p: Posisjon, verdi: unknown) => {
    const { r, k, t } = hentCelle(p)
    if (!r || !k || !k.felt) return
    if (k.nivaa === 'risk') {
      const fra = r[k.felt as RiskFelt]
      if (fra === verdi) return
      endre({ t: 'setRisk', riskId: r.id, felt: k.felt as RiskFelt, verdi, fra })
      if (k.key === 'status' && verdi === 'Lukket' && visning.fane === 'aapne')
        melding(`Risk ${r.nr} er lukket og ligger nå under «Lukkede».`, { tekst: 'Angre', gjor: angre })
      if (k.key === 'status' && verdi !== 'Lukket' && fra === 'Lukket' && visning.fane === 'lukkede')
        melding(`Risk ${r.nr} er åpnet igjen og ligger nå under «Åpne».`, { tekst: 'Angre', gjor: angre })
    } else if (t) {
      const fra = t[k.felt as TiltakFelt]
      if (fra === verdi) return
      endre({ t: 'setTiltak', riskId: r.id, tiltakId: t.id, felt: k.felt as TiltakFelt, verdi, fra })
    } else {
      // Risken har ingen tiltak ennå: opprett et og sett verdien
      const nytt = { ...nyttTiltak(), [k.felt]: verdi }
      endre({ t: 'addTiltak', riskId: r.id, tiltak: nytt })
      setAktiv({ ...p, tiltakId: nytt.id })
    }
  }

  const ferdigRedigert = (tekst: string, retning: Flytt) => {
    const p = redigerer
    setRedigerer(null)
    okt.slippLaas()
    if (!p) return
    const { k } = hentCelle(p)
    if (k) {
      let s = tekst
      if (k.type === 'valg' && !k.fri && s.trim()) {
        const liste = k.valg?.(doc) ?? []
        const treff = liste.find((v) => v.toLowerCase() === s.trim().toLowerCase()) ?? liste.find((v) => v.toLowerCase().startsWith(s.trim().toLowerCase()))
        if (!treff) melding(`«${s}» finnes ikke i listen for ${k.tittel(doc)}. Nye valg legges til under Lister.`)
        else s = treff
        if (!treff) s = ''
        if (!treff) {
          boks.current?.focus()
          return
        }
      }
      lagreVerdi(p, tolkInput(k, s))
    }
    boks.current?.focus()
    if (retning !== 'ingen') flytt(retning)
  }

  const lukkKost = () => {
    setKostEditor(null)
    setVurdEditor(null)
    okt.slippLaas()
    boks.current?.focus()
  }

  const lagreKost = (riskId: string, verdier: Record<'bc' | 'ml' | 'wc', number>) => {
    const r = doc.risker.find((x) => x.id === riskId)
    if (r) {
      const ops: Op[] = (['bc', 'ml', 'wc'] as const).filter((f) => r[f] !== verdier[f]).map((f) => ({ t: 'setRisk', riskId, felt: f, verdi: verdier[f], fra: r[f] }))
      if (ops.length) endre(...ops)
    }
    lukkKost()
  }

  const lagreVurdering = (riskId: string, verdier: Record<'sannsynlighet' | 'konsekvens', number>) => {
    const r = doc.risker.find((x) => x.id === riskId)
    if (r) {
      const ops: Op[] = (['sannsynlighet', 'konsekvens'] as const)
        .filter((f) => r[f] !== verdier[f])
        .map((f) => ({ t: 'setRisk', riskId, felt: f, verdi: verdier[f], fra: r[f] }))
      if (ops.length) endre(...ops)
    }
    lukkKost()
  }

  const byttSkarisk = (riskId: string) => {
    const r = doc.risker.find((x) => x.id === riskId)
    if (!r || !kanSkrive) return
    if (okt.laastAv(r.id)) return melding(`Risk ${r.nr} redigeres av en annen akkurat nå.`)
    lagreVerdi({ riskId, kol: 'tilSkarisk' }, !r.tilSkarisk)
  }

  const avbrytRedigering = () => {
    setRedigerer(null)
    okt.slippLaas()
    boks.current?.focus()
  }

  const nyRad = () => {
    const r = nyRisk(0)
    if (visning.fane === 'lukkede') r.status = 'Lukket'
    // Står fag-filteret på, havner den nye risken i samme fag
    r.fag = fagForNyRisk(doc, visning)
    endre({ t: 'addRisk', risk: r })
    setAktiv({ riskId: r.id, tiltakId: r.tiltak[0].id, kol: kolonner.find((k) => k.key === 'hendelse') ? 'hendelse' : kolonner[1]?.key ?? 'nr' })
  }

  // «Ny risk» i verktøylinjen: samme som + Ny risk nederst i tabellen
  const forrigeNy = useRef(nyRiskTeller)
  useEffect(() => {
    if (nyRiskTeller === forrigeNy.current) return
    forrigeNy.current = nyRiskTeller
    nyRad()
    boks.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyRiskTeller])

  const settFag = (riskId: string, fag: string) => {
    const r = doc.risker.find((x) => x.id === riskId)
    if (!r || (r.fag ?? '') === fag) return
    const av = okt.laastAv(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av.navn} akkurat nå.`)
    endre({ t: 'setRisk', riskId: r.id, felt: 'fag', verdi: fag, fra: r.fag ?? '' })
  }

  const nyttTiltakUnder = (p: Posisjon) => {
    const r = doc.risker.find((x) => x.id === p.riskId)
    if (!r) return
    const t = nyttTiltak()
    endre({ t: 'addTiltak', riskId: r.id, tiltak: t, etter: p.tiltakId })
    setAktiv({ riskId: r.id, tiltakId: t.id, kol: 'tiltak' })
  }

  const slettTiltak = (p: Posisjon) => {
    const r = doc.risker.find((x) => x.id === p.riskId)
    if (!r || !p.tiltakId) return
    const av = okt.laastAv(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av.navn} akkurat nå.`)
    endre({ t: 'deleteTiltak', riskId: r.id, tiltakId: p.tiltakId })
    melding(`Tiltak slettet fra risk ${r.nr}.`, { tekst: 'Angre', gjor: angre })
  }

  const slettRisk = (p: Posisjon) => {
    const r = doc.risker.find((x) => x.id === p.riskId)
    if (!r) return
    const av = okt.laastAv(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av.navn} akkurat nå.`)
    if (!confirm(`Slette risk ${r.nr} «${r.hendelse || 'uten navn'}» med alle tiltak?\n\nVil du heller beholde historikken, sett status til Lukket.`)) return
    endre({ t: 'deleteRisk', riskId: r.id })
    setAktiv(null)
    melding(`Risk ${r.nr} er slettet.`, { tekst: 'Angre', gjor: angre })
  }

  const tomCelle = (p: Posisjon) => {
    const { r, k } = hentCelle(p)
    if (!r || !k?.felt || !kanSkrive) return
    const av = okt.laastAv(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av.navn} akkurat nå.`)
    const tom = k.type === 'tall' || k.key === 'sannsynlighet' || k.key === 'konsekvens' ? 0 : k.key === 'rm' ? '-' : k.type === 'avkrysning' ? false : ''
    lagreVerdi(p, tom)
  }

  // Kopier og lim inn i cellen som er valgt. Bruker nettleserens copy- og paste-hendelser i stedet for
  // navigator.clipboard.readText(), som i Firefox og Safari viser en ekstra «Lim inn»-knapp hver gang og
  // ikke finnes i eldre Firefox. Hendelsene kommer i alle nettlesere når tabellen har fokus, også uten markert tekst
  // (Firefox sender dem til <body>, derfor lytter vi på dokumentet).
  const utklipp = useRef({ kopier: (_e: ClipboardEvent) => {}, lim: (_e: ClipboardEvent) => {} })
  useLayoutEffect(() => {
    utklipp.current = {
      kopier: (e) => {
        if (!aktiv || redigerer) return
        const { r, k, t } = hentCelle(aktiv)
        if (!r || !k) return
        e.preventDefault()
        e.clipboardData?.setData('text/plain', editorTekst(k, r, t))
      },
      lim: (e) => {
        if (!aktiv || redigerer) return
        const { r, k } = hentCelle(aktiv)
        if (!r || !k?.felt) return
        e.preventDefault()
        if (!kanSkrive) return melding('Du har bare lesetilgang til dette registeret.')
        // Bare tekst limes inn. Uten tekst (f.eks. et bilde) skal ikke cellen tømmes.
        if (!e.clipboardData?.types.includes('text/plain')) return
        const s = e.clipboardData.getData('text/plain')
        if (okt.laas(r.id)) return melding(`Risk ${r.nr} redigeres av en annen akkurat nå.`)
        lagreVerdi(aktiv, tolkInput(k, s.replace(/\r?\n$/, '')))
        okt.slippLaas()
      },
    }
  })

  useEffect(() => {
    const iTabell = () => !!boks.current && document.activeElement === boks.current
    const kopier = (e: ClipboardEvent) => iTabell() && utklipp.current.kopier(e)
    const lim = (e: ClipboardEvent) => iTabell() && utklipp.current.lim(e)
    document.addEventListener('copy', kopier)
    document.addEventListener('paste', lim)
    return () => {
      document.removeEventListener('copy', kopier)
      document.removeEventListener('paste', lim)
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (redigerer) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      angre()
      return
    }
    if (!aktiv) {
      if (e.key.startsWith('Arrow') && linjer.length) {
        setAktiv({ riskId: linjer[0].risk.id, tiltakId: linjer[0].tiltak?.id, kol: kolonner[0].key })
        e.preventDefault()
      }
      return
    }
    const { r, k } = hentCelle(aktiv)
    // Ctrl/Cmd+C og V håndteres i copy- og paste-hendelsene (utklipp over)
    // Alt+pil ned åpner lista, som i Excel
    if (e.altKey && e.key === 'ArrowDown' && (k?.type === 'valg' || k?.type === 'dato')) {
      e.preventDefault()
      startRedigering(aktiv)
      return
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault()
        flytt(({ ArrowDown: 'ned', ArrowUp: 'opp', ArrowLeft: 'venstre', ArrowRight: 'hoyre' } as const)[e.key])
        return
      case 'Tab':
        e.preventDefault()
        flytt(e.shiftKey ? 'venstre' : 'hoyre')
        return
      case 'Enter':
      case 'F2':
        e.preventDefault()
        if (mod && e.key === 'Enter') return nyttTiltakUnder(aktiv)
        if (k?.type === 'avkrysning' || (!k?.felt && !harVindu(k))) return flytt('ned')
        startRedigering(aktiv)
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        tomCelle(aktiv)
        return
      case ' ':
        if (k?.type === 'avkrysning' && r) {
          e.preventDefault()
          if (okt.laastAv(r.id)) return melding(`Risk ${r.nr} redigeres av en annen akkurat nå.`)
          lagreVerdi(aktiv, !r.tilSkarisk)
          return
        }
        break
      case 'Escape':
        setAktiv(null)
        return
    }
    // Et tegn starter redigering. Tegn skrevet med AltGr (Windows: Ctrl+Alt) eller Option (Mac), f.eks. @ og |,
    // teller også, men ikke snarveier med Ctrl eller Cmd alene.
    const tegn = e.key.length === 1 && !e.metaKey && (!e.ctrlKey || e.altKey)
    if (tegn && ((erKost(k) && /[\d,.-]/.test(e.key)) || (erVurdering(k) && /[1-5]/.test(e.key)))) {
      e.preventDefault()
      startRedigering(aktiv)
      return
    }
    if (tegn && k?.felt && k.type !== 'avkrysning') {
      e.preventDefault()
      startRedigering(aktiv, e.key)
    }
  }

  const klikkCelle = (p: Posisjon, e: React.MouseEvent) => {
    setKontekst(null)
    // Et nytt klikk i cellen som kost- eller vurderingsvinduet ble åpnet fra, lagrer og lukker vinduet (det gjør vinduet selv,
    // som ved alle klikk utenfor) i stedet for å åpne det igjen
    const aapent = (kostEditor && { riskId: kostEditor.riskId, kol: 'fv' }) || (vurdEditor && { riskId: vurdEditor.riskId, kol: 'eksponering' })
    if (aapent && aapent.riskId === p.riskId && aapent.kol === p.kol) return
    if (e.detail === 2) {
      const { k, r } = hentCelle(p)
      if (k?.type === 'avkrysning' && r) {
        if (!okt.laastAv(r.id)) lagreVerdi(p, !r.tilSkarisk)
      // Etter musetrykket flytter nettleseren fokus til tabellen. Editoren åpnes etterpå, ellers mister den fokus og lukkes med en gang.
      } else if (k?.felt || harVindu(k)) {
        const markor = samlet && BESKRIVELSE.includes(p.kol) ? tegnVedKlikk(e) : undefined
        setTimeout(() => startRedigering(p, undefined, markor), 0)
      }
      else if (k?.key === 'nr') aapneDetalj(p.riskId)
      return
    }
    // Samlet beskrivelse: andre klikk på en linje som allerede er valgt, åpner teksten for redigering
    const valgtFraFor = aktiv?.riskId === p.riskId && aktiv.kol === p.kol
    if (samlet && BESKRIVELSE.includes(p.kol) && valgtFraFor && kanSkrive && !redigerer && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Markøren havner der det ble klikket, siden editoren står nøyaktig der teksten sto
      const markor = tegnVedKlikk(e)
      setTimeout(() => startRedigering(p, undefined, markor), 0)
      return
    }
    setAktiv(p)
    boks.current?.focus()
    // Som nedtrekkslistene i Excel-arket: ett klikk på en valgcelle eller en dato åpner lista eller kalenderen.
    // Venter til en eventuell åpen editor har lagret seg selv (den lukkes når den mister fokus).
    const { k } = hentCelle(p)
    // Kost- og vurderingsvinduet i moderne utseende åpnes på samme måte, med ett klikk.
    const somListe = (k?.felt && (k.type === 'valg' || k.type === 'dato')) || harVindu(k)
    if (kanSkrive && somListe && !e.shiftKey && !e.ctrlKey && !e.metaKey) setTimeout(() => startRedigering(p), 0)
  }

  // ---- Kolonneoverskrifter ----
  const gruppeKolonner = GRUPPER.map((g) => ({ g, n: kolonner.filter((k) => k.gruppe === g.key).length })).filter((x) => x.n > 0)

  const sortIkon = (key: string) => {
    const i = visning.sortering.findIndex((s) => s.key === key)
    if (i < 0) return null
    const s = visning.sortering[i]
    return (
      <span className="sortpil">
        {s.stigende ? '▲' : '▼'}
        {visning.sortering.length > 1 ? i + 1 : ''}
      </span>
    )
  }

  const klikkOverskrift = (k: Kolonne, e: React.MouseEvent) => {
    setVisning((v) => {
      const finnes = v.sortering.find((s) => s.key === k.key)
      let sortering = e.shiftKey ? v.sortering.filter((s) => s.key !== k.key) : []
      if (!finnes) sortering = [...sortering, { key: k.key, stigende: true }]
      else if (finnes.stigende) sortering = [...sortering, { key: k.key, stigende: false }]
      return { ...v, sortering }
    })
  }

  const startResize = (k: Kolonne, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const b0 = bredde(k)
    const flytt = (m: MouseEvent) => setVisning((v) => ({ ...v, bredder: { ...v.bredder, [k.key]: Math.max(40, b0 + m.clientX - x0) } }))
    const slipp = () => {
      window.removeEventListener('mousemove', flytt)
      window.removeEventListener('mouseup', slipp)
    }
    window.addEventListener('mousemove', flytt)
    window.addEventListener('mouseup', slipp)
  }

  const harFilter = (key: string) => (visning.filter.verdier[key]?.length ?? 0) > 0 || !!visning.filter.tekst[key]

  const totalBredde = kolonner.reduce((s, k) => s + bredde(k), 0)
  const fyllBredde = samlet && kolonner.some((k) => k.key === 'hendelse') && visning.bredder.hendelse == null

  return (
    <div className="grid-boks" ref={boks} tabIndex={0} onKeyDown={onKeyDown} onClick={() => setMeny(null)}>
      {/* I samlet utseende fyller beskrivelsen resten av bredden, så tabellen alltid går helt ut */}
      <table className="grid" style={fyllBredde ? { width: '100%', minWidth: totalBredde } : { width: totalBredde }}>
        <colgroup>
          {kolonner.map((k) => (
            <col key={k.key} style={{ width: fyllBredde && k.key === 'hendelse' ? undefined : bredde(k) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="gruppe-rad">
            {gruppeKolonner.map(({ g, n }) => {
              const sammen = visning.skjulteGrupper.includes(g.key)
              const stil = g.key === 'fast' ? { left: 0, zIndex: 6 } : undefined
              return (
                <th key={g.key} colSpan={n} className={'gruppe-th ' + (g.key === 'fast' ? 'frosset' : '')} style={stil} title={g.tittel}>
                  {g.tittel && moderne && ENKEL_GRUPPE.includes(g.key) && <span className="gruppe-tekst">{g.tittel}</span>}
                  {g.tittel && !(moderne && ENKEL_GRUPPE.includes(g.key)) && (
                    <button
                      className="gruppe-knapp"
                      title={sammen ? 'Vis alle kolonnene i gruppen' : 'Slå sammen gruppen'}
                      onClick={() =>
                        setVisning((v) => ({ ...v, skjulteGrupper: sammen ? v.skjulteGrupper.filter((x) => x !== g.key) : [...v.skjulteGrupper, g.key] }))
                      }
                    >
                      <span className="chevron">{sammen ? <Pil retning="hoyre" /> : <Pil />}</span> {g.tittel}
                    </button>
                  )}
                </th>
              )
            })}
          </tr>
          <tr className="kol-rad">
            {kolonner.map((k) => (
              <th
                key={k.key}
                className={(k.frosset ? 'frosset ' : '') + (k.hoyre ? 'hoyre ' : '') + 'kol-' + k.key}
                style={k.frosset ? { left: frossenVenstre[k.key] } : undefined}
                onClick={(e) => klikkOverskrift(k, e)}
                title={(KOST_NAVN[k.key] ? KOST_NAVN[k.key] + '. ' : '') + 'Klikk for å sortere. Shift+klikk for å sortere på flere kolonner.'}
              >
                <span className="kol-tittel">{(samlet && SAMLET_TITTEL[k.key]) || (sammen.includes(k.gruppe) && SAMMEN_TITTEL[k.key]) || k.tittel(doc)}</span>
                {sortIkon(k.key)}
                <button
                  className={'filterknapp ' + (harFilter(k.key) ? 'aktiv' : '')}
                  title="Sorter og filtrer"
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMeny(meny?.kol === k.key ? null : { kol: k.key, x: rect.left, y: rect.bottom + 4 })
                  }}
                >
                  <Pil />
                </button>
                <span className="resize" onMouseDown={(e) => startResize(k, e)} onClick={(e) => e.stopPropagation()} />
              </th>
            ))}
          </tr>
        </thead>
        {grupperte.map((g) => (
          <Fragment key={g.navn || '_'}>
            {g.navn && (
              <GruppeOverskrift
                gruppe={g}
                antallKol={kolonner.length}
                lukket={lukketGrupper.includes(g.navn)}
                bytt={() => setLukketGrupper((l) => (l.includes(g.navn) ? l.filter((x) => x !== g.navn) : [...l, g.navn]))}
                mot={mot}
              />
            )}
            {!lukketGrupper.includes(g.navn) &&
              g.risker.map((r) => (
                <RiskRader
                  key={r.id}
                  risk={r}
                  doc={doc}
                  kolonner={kolonner}
                  frossenVenstre={frossenVenstre}
                  aktiv={aktiv}
                  redigerer={redigerer}
                  tilstede={tilstedePaa.get(r.id) ?? []}
                  laastAv={okt.laastAv(r.id)?.navn}
                  minLaas={okt.minLaas === r.id}
                  bredde={bredde}
                  klikk={klikkCelle}
                  kontekst={(p, e) => {
                    e.preventDefault()
                    setAktiv(p)
                    setKontekst({ x: e.clientX, y: e.clientY, pos: p })
                  }}
                  ferdig={ferdigRedigert}
                  avbryt={avbrytRedigering}
                  nyttTiltak={(p) => nyttTiltakUnder(p)}
                  fagVelger={(riskId, e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setFagVelger({ riskId, x: b.left, y: b.bottom + 4 })
                  }}
                  kanSkrive={kanSkrive}
                  mot={mot}
                  moderne={moderne}
                  samlet={samlet}
                  sammen={sammen}
                  byttSkarisk={byttSkarisk}
                />
              ))}
          </Fragment>
        ))}
        {kanSkrive && (
          <tbody>
            <tr className="ny-rad">
              <td colSpan={kolonner.length}>
                {/* Står fast til venstre når tabellen skrolles sidelengs */}
                <div className="ny-rad-innhold">
                  <button className="lenkeknapp" onClick={nyRad}>
                    + Ny risk
                  </button>
                  <span className="hint">
                    Skriv rett i cellene · Enter/F2 redigerer · Klikk på valgceller og datoer for liste/kalender · Ctrl+Enter nytt tiltak · Høyreklikk for flere valg · Ctrl+Z angrer
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        )}
      </table>
      {risker.length === 0 && <div className="tomt">Ingen risker å vise{visning.sok || Object.keys(visning.filter.verdier).length ? ' med valgt filter' : ''}.</div>}
      {meny && (
        <KolonneMeny
          kolonne={KOLONNER.find((k) => k.key === meny.kol)!}
          doc={doc}
          visning={visning}
          setVisning={setVisning}
          x={meny.x}
          y={meny.y}
          lukk={() => setMeny(null)}
        />
      )}
      {kostEditor &&
        (() => {
          const r = doc.risker.find((x) => x.id === kostEditor.riskId)
          return r ? <KostEditor risk={r} anker={kostEditor.anker} onLagre={(v) => lagreKost(r.id, v)} onAvbryt={lukkKost} /> : null
        })()}
      {vurdEditor &&
        (() => {
          const r = doc.risker.find((x) => x.id === vurdEditor.riskId)
          return r ? <VurderingEditor risk={r} anker={vurdEditor.anker} onLagre={(v) => lagreVurdering(r.id, v)} onAvbryt={lukkKost} /> : null
        })()}
      {fagVelger && (
        <FagVelger
          doc={doc}
          valgt={doc.risker.find((r) => r.id === fagVelger.riskId)?.fag}
          x={fagVelger.x}
          y={fagVelger.y}
          endre={endre}
          velg={(id) => settFag(fagVelger.riskId, id)}
          lukk={() => setFagVelger(null)}
        />
      )}
      {kontekst && (
        <div className="kontekstmeny" style={{ left: Math.min(kontekst.x, window.innerWidth - 270), top: Math.max(8, Math.min(kontekst.y, window.innerHeight - 340)) }} onMouseLeave={() => setKontekst(null)}>
          {(() => {
            const r = doc.risker.find((x) => x.id === kontekst.pos.riskId)
            return r && <RiskInfo r={r} />
          })()}
          <button onClick={() => (aapneDetalj(kontekst.pos.riskId), setKontekst(null))}>Åpne risk i eget panel</button>
          {kanSkrive && (
            <>
              <button onClick={() => (setFagVelger({ riskId: kontekst.pos.riskId, x: kontekst.x, y: kontekst.y }), setKontekst(null))}>Sett fag…</button>
              <button onClick={() => (nyttTiltakUnder(kontekst.pos), setKontekst(null))}>Nytt tiltak under</button>
              {kontekst.pos.tiltakId && <button onClick={() => (slettTiltak(kontekst.pos), setKontekst(null))}>Slett tiltaket</button>}
              <hr />
              <button onClick={() => (nyRad(), setKontekst(null))}>Ny risk</button>
              <button className="fare" onClick={() => (slettRisk(kontekst.pos), setKontekst(null))}>
                Slett risken
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GruppeOverskrift({ gruppe, antallKol, lukket, bytt, mot }: { gruppe: Gruppe; antallKol: number; lukket: boolean; bytt: () => void; mot?: Map<string, Risk> }) {
  const r = summer(gruppe.risker, 'R')
  const m = summer(gruppe.risker, 'M')
  // Samme risker slik de var i snapshotet (risker som er nye siden, teller som 0 der)
  const gamle = mot && gruppe.risker.map((x) => mot.get(x.id)).filter((x): x is Risk => !!x)
  const endring = (rm: 'R' | 'M', naa: number) => {
    const e = gamle ? formatEndring(naa - summer(gamle, rm).fv) : ''
    return e ? ` (${e})` : ''
  }
  return (
    <tbody className="gruppe-tbody">
      <tr>
        <td colSpan={antallKol} onClick={bytt}>
          <span className="chevron">{lukket ? <Pil retning="hoyre" /> : <Pil />}</span>
          <strong>{gruppe.navn}</strong>
          <span className="gruppe-info">
            {gruppe.risker.length} {gruppe.risker.length === 1 ? 'risk' : 'risker'}
            {r.antall > 0 && ` · R: FV ${formatTall(r.fv)}${endring('R', r.fv)}`}
            {m.antall > 0 && ` · M: FV ${formatTall(m.fv)}${endring('M', m.fv)}`}
          </span>
        </td>
      </tr>
    </tbody>
  )
}

interface RaderProps {
  risk: Risk
  doc: Register
  kolonner: Kolonne[]
  frossenVenstre: Record<string, number>
  aktiv: Posisjon | null
  redigerer: (Posisjon & { start: string; erstatt: boolean; markor?: number }) | null
  tilstede: Tilstede[]
  laastAv?: string
  minLaas: boolean
  bredde: (k: Kolonne) => number
  klikk: (p: Posisjon, e: React.MouseEvent) => void
  kontekst: (p: Posisjon, e: React.MouseEvent) => void
  ferdig: (tekst: string, flytt: Flytt) => void
  avbryt: () => void
  nyttTiltak: (p: Posisjon) => void
  kanSkrive: boolean
  fagVelger: (riskId: string, e: React.MouseEvent) => void
  mot?: Map<string, Risk>
  moderne: boolean
  samlet: boolean
  sammen: string[]
  byttSkarisk: (riskId: string) => void
}

// Tallkolonnene som viser endring når et snapshot er aktivt
const TALL_ENDRING: Record<string, (r: Risk) => number> = { bc: (r) => r.bc, ml: (r) => r.ml, wc: (r) => r.wc, fv: (r) => fv(r), eksponering: (r) => eksponering(r) }

function RiskRader(p: RaderProps) {
  const { risk: r, kolonner } = p
  const n = Math.max(1, r.tiltak.length)
  const e = eksponering(r)
  const farge = eksponeringFarge(r.rm, e)
  const laasFarge = p.laastAv ? p.tilstede.find((t) => t.navn === p.laastAv)?.farge : undefined
  const klasser = ['risk', p.laastAv ? 'laast' : '', p.minLaas ? 'min-laas' : '', r.status === 'Lukket' ? 'lukket' : ''].join(' ')
  const stripe = p.tilstede[0]?.farge
  const fag = r.fag ? p.doc.lister.fag.find((f) => f.id === r.fag) : undefined
  const gammel = p.mot?.get(r.id)
  const endring = (k: Kolonne) => {
    const f = TALL_ENDRING[k.key]
    if (!p.mot || !f || !gammel) return null
    const d = f(r) - f(gammel)
    const tekst = k.key === 'eksponering' ? (d ? (d > 0 ? '+' : '−') + Math.abs(d) : '') : formatEndring(d)
    if (!tekst) return null
    // For risiko er høyere tall verre, for mulighet bedre
    const bra = r.rm === 'M' ? d > 0 : d < 0
    return (
      <span className={'delta ' + (bra ? 'bedre' : 'verre')} title={`Snapshot: ${k.key === 'eksponering' ? f(gammel) : formatTall(f(gammel))}`}>
        {tekst}
      </span>
    )
  }

  const celle = (k: Kolonne, t: Tiltak | undefined, rad: number) => {
    const pos: Posisjon = { riskId: r.id, tiltakId: k.nivaa === 'risk' ? r.tiltak[0]?.id : t?.id, kol: k.key }
    // I samlet utseende står årsak og konsekvens i hendelse-cellen, så de regnes som samme celle
    const samletBeskrivelse = p.samlet && k.key === 'hendelse'
    const her = (kol?: string) => kol === k.key || (samletBeskrivelse && !!kol && (BESKRIVELSE.includes(kol) || kol === 'rm'))
    const erAktiv = p.aktiv?.riskId === r.id && her(p.aktiv.kol) && (k.nivaa === 'risk' || p.aktiv.tiltakId === t?.id)
    const redigeres = p.redigerer?.riskId === r.id && her(p.redigerer.kol) && (k.nivaa === 'risk' || p.redigerer.tiltakId === t?.id)
    const andreHer = p.tilstede.filter((x) => x.kolonne === k.key && (k.nivaa === 'risk' || x.tiltakId === t?.id))
    const stil: React.CSSProperties = {}
    if (k.frosset) stil.left = p.frossenVenstre[k.key]
    if (k.key === 'eksponering' && farge && !p.moderne) {
      stil.background = farge.bg
      stil.color = farge.fg
    }
    if (andreHer.length) stil.boxShadow = `inset 0 0 0 2px ${andreHer[0].farge}`
    if (k.key === 'nr' && fag && p.moderne) (stil as Record<string, string>)['--fag'] = fagFarge(fag).bg
    const kl = [
      'k-' + k.key,
      k.frosset ? 'frosset' : '',
      k.key === 'nr' ? 'nr-td' : '',
      k.hoyre ? 'hoyre' : '',
      k.type === 'langtekst' ? 'langtekst' : '',
      k.key === 'rm' ? 'rm-' + r.rm : '',
      k.key === 'tiltakstatus' && t?.status ? 'ts-' + t.status.replace(/\s/g, '-').toLowerCase() : '',
      k.key === 'frist' && t?.frist && t.status !== 'Utført' && t.status !== 'Utføres ikke' && t.frist < new Date().toISOString().slice(0, 10) ? 'forfalt' : '',
      erAktiv ? 'aktiv' : '',
      !k.felt ? 'lesecelle' : '',
      k.nivaa === 'tiltak' && rad > 0 ? 'tiltak-fortsatt' : '',
      p.sammen.includes(k.gruppe) && GRUPPER.find((g) => g.key === k.gruppe)?.hoved === k.key ? 'samlet' : '',
    ].join(' ')
    const span = k.nivaa === 'risk' ? n : 1
    let innhold: React.ReactNode = visTekst(k, r, t)
    if (k.key === 'nr')
      innhold = (
        <div className="nr-celle">
          {stripe && <span className="tilstede-prikk" style={{ background: stripe }} title={p.tilstede.map((x) => x.navn).join(', ')} />}
          {fag ? (
            <FagMerke fag={fag} onClick={p.kanSkrive ? (ev) => p.fagVelger(r.id, ev) : undefined} />
          ) : (
            p.kanSkrive && (
              <span className="fagmerke tom legg-til" title="Sett fag" onMouseDown={(ev) => p.fagVelger(r.id, ev)}>
                + fag
              </span>
            )
          )}
          <span className="nr-tall">{r.nr}</span>
          {p.mot && !gammel && (
            <span className="ny-siden" title="Risken er lagt til etter snapshotet">
              ny
            </span>
          )}
        </div>
      )
    if (k.key === 'rm')
      innhold = (
        <div className="rm-celle">
          {(r.rm === 'R' || r.rm === 'M') && (
            <span className={'rm-merke rm-' + r.rm} title={r.rm === 'R' ? 'Risiko' : 'Mulighet'}>
              {r.rm}
            </span>
          )}
        </div>
      )
    if (k.key === 'tilSkarisk')
      innhold = p.moderne ? (
        <button
          className={'bryter' + (r.tilSkarisk ? ' paa' : '')}
          role="switch"
          aria-checked={r.tilSkarisk}
          aria-label={`Ta med risk ${r.nr} i Skarisk`}
          title={r.tilSkarisk ? 'Tas med i Skarisk. Klikk for å fjerne.' : 'Klikk for å ta med i Skarisk'}
          disabled={!p.kanSkrive}
          onMouseDown={(ev) => {
            ev.stopPropagation()
            if (ev.button === 0) p.byttSkarisk(r.id)
          }}
        >
          <i />
        </button>
      ) : r.tilSkarisk ? (
        <span className="hake">✓</span>
      ) : (
        <span className="kryss">✗</span>
      )
    if (k.key === 'eksponering' && p.moderne) innhold = <VurderingCelle r={r} kanSkrive={p.kanSkrive} />
    if (k.nivaa === 'tiltak' && !t && k.key === 'tiltak' && p.kanSkrive) innhold = <span className="plassholder">+ legg til tiltak</span>
    const samletTiltak = k.key === 'tiltak' && t && p.sammen.includes('tiltak')
    if (samletTiltak) innhold = <TiltakSamlet t={t} doc={p.doc} />
    if (k.key === 'eier' && p.sammen.includes('eierskap')) innhold = <EierSamlet r={r} doc={p.doc} medEgendef={p.samlet} />
    // Teksten i samlet beskrivelse redigeres der den står, i samme boks, så ingenting rundt flytter seg
    const redigertKol = samletBeskrivelse && p.redigerer ? KOL[p.redigerer.kol] : k
    const inlineEditor =
      redigeres && p.redigerer && samletBeskrivelse && BESKRIVELSE.includes(p.redigerer.kol) ? (
        <CelleEditor
          inline
          kolonne={redigertKol}
          etikett={BESKRIVELSE_NAVN[p.redigerer.kol]}
          markorStart={p.redigerer.markor}
          start={p.redigerer.start}
          erstatt={p.redigerer.erstatt}
          valg={[]}
          bredde={p.bredde(k)}
          onFerdig={p.ferdig}
          onAvbryt={p.avbryt}
        />
      ) : null
    if (samletBeskrivelse)
      innhold = (
        <BeskrivelseSamlet
          r={r}
          aktiv={erAktiv ? p.aktiv?.kol : undefined}
          editor={inlineEditor ? { kol: p.redigerer!.kol, node: inlineEditor } : undefined}
          kanSkrive={p.kanSkrive}
          velg={(kol, ev) => ev.button === 0 && (ev.stopPropagation(), p.klikk({ ...pos, kol }, ev))}
        />
      )
    if (k.key === 'fv') innhold = p.moderne ? <KostCelle r={r} /> : formatTall(fv(r))
    // Tomme celler får et usynlig tegn, så en ny tiltakslinje er like høy som en med én linje tekst
    if (innhold === '' || innhold == null) innhold = '\u200b'

    return (
      <td
        key={k.key}
        rowSpan={span}
        className={kl}
        style={stil}
        onMouseDown={(ev) => ev.button === 0 && p.klikk(pos, ev)}
        onContextMenu={(ev) => p.kontekst(pos, ev)}
      >
        {k.type === 'langtekst' && !samletTiltak && !samletBeskrivelse ? <div className="tekstklipp">{innhold}</div> : innhold}
        {endring(k)}
        {andreHer.map((x) => (
          <span key={x.brukerId} className="navnelapp" style={{ background: x.farge }}>
            {x.navn}
          </span>
        ))}
        {k.key === 'hendelse' && p.laastAv && (
          <span className="laas-merke" style={{ background: laasFarge }}>
            <Laas /> {p.laastAv} skriver
          </span>
        )}
        {(((k.type === 'valg' || k.type === 'dato') && k.felt) || (p.moderne && (k.key === 'eksponering' || k.key === 'fv'))) && p.kanSkrive && !redigeres && (
          <span className={'valgpil' + (erAktiv ? ' synlig' : '')} aria-hidden>
            {k.type === 'dato' ? <Kalenderikon /> : <Pil />}
          </span>
        )}
        {k.key === 'tiltak' && erAktiv && p.kanSkrive && !redigeres && (
          <button className="pluss" title="Nytt tiltak under (Ctrl+Enter)" onMouseDown={(ev) => (ev.stopPropagation(), p.nyttTiltak(pos))}>
            +
          </button>
        )}
        {redigeres && p.redigerer && !inlineEditor && (
          <CelleEditor
            kolonne={redigertKol}
            start={p.redigerer.start}
            erstatt={p.redigerer.erstatt}
            valg={redigertKol.valg?.(p.doc) ?? []}
            bredde={samletBeskrivelse ? 0 : p.bredde(k)}
            onFerdig={p.ferdig}
            onAvbryt={p.avbryt}
          />
        )}
      </td>
    )
  }

  return (
    <tbody className={klasser} data-risk={r.id} style={stripe ? ({ '--stripe': stripe } as React.CSSProperties) : undefined}>
      {Array.from({ length: n }, (_, i) => {
        const t = r.tiltak[i]
        return (
          <tr key={t?.id ?? 'tom'}>
            {kolonner.map((k) => {
              if (k.nivaa === 'risk') return i === 0 ? celle(k, t, i) : null
              return celle(k, t, i)
            })}
          </tr>
        )
      })}
    </tbody>
  )
}

const forfalt = (t: Tiltak) => !!t.frist && t.status !== 'Utført' && t.status !== 'Utføres ikke' && t.frist < new Date().toISOString().slice(0, 10)
const MND = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.']
// Kort dato som «30. nov.», med år bare når det ikke er i år
function kortDato(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d}. ${MND[m - 1]}` + (y !== new Date().getFullYear() ? ` ${y}` : '')
}

// Initialene til en person i en liten runding. Initialene i deltakerlisten gjelder først, så de kan justeres der
// (f.eks. når to personer får like initialer). Ellers lages de av navnet: Ole Petter Jensen blir OPJ.
function Initialer({ navn, doc }: { navn: string; doc: Register }) {
  const d = doc.deltakere.find((x) => likNavn(x.navn, navn))
  const tekst = d?.initialer.trim() || initialer(navn)
  return (
    <span className="initialer" title={navn}>
      {tekst}
    </span>
  )
}

// Moderne utseende med tiltaksgruppen slått sammen: status som prikk, teksten, eier og frist i samme celle
function TiltakSamlet({ t, doc }: { t: Tiltak; doc: Register }) {
  const status = t.status || 'Ikke startet'
  const ferdig = status === 'Utført' || status === 'Utføres ikke'
  return (
    <div className={'tiltak-samlet' + (ferdig ? ' ferdig' : '')}>
      <span className={'status-prikk ts-' + status.replace(/\s/g, '-').toLowerCase()} title={`Status: ${status}`} aria-label={`Status: ${status}`} role="img" />
      <span className="tiltak-samlet-tekst">{t.tekst || <span className="plassholder">Uten tekst</span>}</span>
      {t.eier ? <Initialer navn={t.eier} doc={doc} /> : <span />}
      <span className={'tiltak-samlet-frist' + (forfalt(t) ? ' forfalt' : '')} title={t.frist ? 'Frist ' + formatDato(t.frist) + (forfalt(t) ? ', forfalt' : '') : 'Ingen frist'}>
        {t.frist ? kortDato(t.frist) : ''}
      </span>
    </div>
  )
}

// Moderne utseende med eierskapsgruppen slått sammen: initialer og navn, med kategorien under
function EierSamlet({ r, doc, medEgendef }: { r: Risk; doc: Register; medEgendef?: boolean }) {
  const under = [r.kategori, medEgendef ? r.egendef : ''].filter(Boolean).join(' · ')
  if (!r.eier && !under) return null
  return (
    <div className="eier-samlet">
      {r.eier && (
        <span className="eier-samlet-navn">
          <Initialer navn={r.eier} doc={doc} />
          {r.eier}
        </span>
      )}
      {under && <span className="eier-samlet-kategori">{under}</span>}
    </div>
  )
}

// Samlet utseende: R/M-merket og hendelsen, med årsak og konsekvens under. Første klikk velger en linje,
// neste klikk (eller Enter, F2 eller å begynne å skrive) redigerer teksten der den står.
function BeskrivelseSamlet({
  r,
  aktiv,
  editor,
  kanSkrive,
  velg,
}: {
  r: Risk
  aktiv?: string
  editor?: { kol: string; node: React.ReactNode }
  kanSkrive: boolean
  velg: (kol: string, ev: React.MouseEvent) => void
}) {
  const kl = (kol: string, ekstra = '') => [ekstra, aktiv === kol ? 'valgt' : '', editor?.kol === kol ? 'redigeres' : ''].filter(Boolean).join(' ') || undefined
  const tekst = (kol: string, verdi: string, tom: string) => (editor?.kol === kol ? editor.node : verdi || <span className="plassholder">{tom}</span>)
  const rmNavn = r.rm === 'R' ? 'Risiko' : r.rm === 'M' ? 'Mulighet' : 'Ikke satt'
  return (
    <div className="beskrivelse-samlet">
      <div className="beskrivelse-hendelse">
        <span
          className={'rm-merke rm-' + (r.rm === 'R' || r.rm === 'M' ? r.rm : 'tom') + (aktiv === 'rm' ? ' valgt' : '')}
          title={rmNavn + (kanSkrive ? '. Klikk for å endre.' : '')}
          onMouseDown={(ev) => velg('rm', ev)}
        >
          {r.rm === 'R' || r.rm === 'M' ? r.rm : '–'}
        </span>
        <span className={kl('hendelse', 'linje')} onMouseDown={(ev) => velg('hendelse', ev)}>
          {tekst('hendelse', r.hendelse, 'Uten hendelse')}
        </span>
      </div>
      <dl>
        <dt className={kl('aarsak')} onMouseDown={(ev) => velg('aarsak', ev)}>
          Årsak
        </dt>
        <dd className={kl('aarsak', 'linje')} onMouseDown={(ev) => velg('aarsak', ev)}>
          {tekst('aarsak', r.aarsak, 'Legg til årsak')}
        </dd>
        <dt className={kl('konsekvenser')} onMouseDown={(ev) => velg('konsekvenser', ev)}>
          Konsekvens
        </dt>
        <dd className={kl('konsekvenser', 'linje')} onMouseDown={(ev) => velg('konsekvenser', ev)}>
          {tekst('konsekvenser', r.konsekvenser, 'Legg til konsekvens')}
        </dd>
      </dl>
    </div>
  )
}

// Moderne utseende: eksponeringen som et farget merke, med sannsynlighet og konsekvens ved siden av
function VurderingCelle({ r, kanSkrive }: { r: Risk; kanSkrive: boolean }) {
  const e = eksponering(r)
  const farge = eksponeringFarge(r.rm, e)
  const s = r.sannsynlighet ? SANNSYNLIGHET[r.sannsynlighet - 1] : 'ikke satt'
  const k = r.konsekvens ? KONSEKVENS[r.konsekvens - 1] : 'ikke satt'
  const tittel = `Sannsynlighet: ${s}\nKonsekvens: ${k}` + (kanSkrive ? '\nKlikk for å endre' : '')
  if (!r.sannsynlighet && !r.konsekvens)
    return (
      <span className="vurd-celle tom" title={tittel}>
        {kanSkrive ? 'Vurder' : '-'}
      </span>
    )
  return (
    <span className="vurd-celle" title={tittel}>
      <span className={'eksp-merke' + (e ? '' : ' tom')} style={farge ? { background: farge.bg, color: farge.fg } : undefined}>
        {e || '–'}
      </span>
      <span className="vurd-sk">
        <span>
          S<b>{r.sannsynlighet || '–'}</b>
        </span>
        <span>
          K<b>{r.konsekvens || '–'}</b>
        </span>
      </span>
    </span>
  )
}

// Moderne utseende: forventet verdi med spennet fra best til verst under
// Hvilket tegn i tekstlinjen et klikk traff, talt fra starten av linjen. Undefined når det ikke kan avgjøres
// (da havner markøren bakerst, som før).
function tegnVedKlikk(e: React.MouseEvent): number | undefined {
  const linje = (e.target as HTMLElement).closest?.('.linje')
  if (!linje || linje.querySelector('.plassholder')) return undefined
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const pos = d.caretPositionFromPoint?.(e.clientX, e.clientY)
  const range = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY)
  const node = pos?.offsetNode ?? range?.startContainer
  const offset = pos?.offset ?? range?.startOffset
  if (!node || offset == null || !linje.contains(node)) return undefined
  let antall = 0
  const gaa = document.createTreeWalker(linje, NodeFilter.SHOW_TEXT)
  for (let n = gaa.nextNode(); n; n = gaa.nextNode()) {
    if (n === node) return antall + offset
    antall += n.textContent?.length ?? 0
  }
  return undefined
}

// Kostspennet med egen skala per risk: streken går fra best til verst, med mest sannsynlig (grå) og forventet
// verdi (svart) inne i spennet. Den viser skjevheten i spennet; størrelsen leses av tallet over.
// En felles skala gjorde små spenn til prikker når andre risker var store, og negative tall stjal halve bredden.
function KostCelle({ r }: { r: Risk }) {
  const tom = !r.bc && !r.ml && !r.wc
  const lo = Math.min(r.bc, r.ml, r.wc)
  const hi = Math.max(r.bc, r.ml, r.wc)
  // Litt luft i hver ende, så endemerkene ikke havner utenfor
  const p = (v: number) => (hi > lo ? `${4 + ((v - lo) / (hi - lo)) * 92}%` : '50%')
  return (
    <div className="kost-celle" title={`Best ${formatTall(r.bc)}, mest sannsynlig ${formatTall(r.ml)}, verst ${formatTall(r.wc)} (i 1000 kr)`}>
      <span className="kost-fv">{tom ? '-' : formatTall(fv(r))}</span>
      {!tom && (
        <>
          <span className={'kost-spenn egen' + (r.rm === 'M' ? ' m' : '')} aria-hidden>
            <i style={hi > lo ? { left: '4%', right: '4%' } : { left: 'calc(50% - 2px)', width: '4px' }} />
            {lo < 0 && hi > 0 && <s style={{ left: p(0) }} />}
            {hi > lo && <b className="ml" style={{ left: p(r.ml) }} />}
            <b style={{ left: p(fv(r)) }} />
          </span>
          <span className="kost-fra-til">
            {formatTall(r.bc)}–{formatTall(r.wc)}
          </span>
        </>
      )}
    </div>
  )
}

function KolonneMeny({
  kolonne: k,
  doc,
  visning,
  setVisning,
  x,
  y,
  lukk,
}: {
  kolonne: Kolonne
  doc: Register
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  x: number
  y: number
  lukk: () => void
}) {
  const brukVerdier = k.type !== 'langtekst' && k.type !== 'tekst'
  const tilgjengelig = useMemo(() => {
    const s = new Set<string>()
    for (const r of filtrer(doc, visning, k.key)) filterVerdier(k, r).forEach((v) => s.add(v))
    return [...s].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
  }, [doc, visning, k])
  const valgt = visning.filter.verdier[k.key]
  const [sok, setSok] = useState('')

  const settVerdier = (v: string[] | undefined) =>
    setVisning((vis) => {
      const verdier = { ...vis.filter.verdier }
      if (v === undefined) delete verdier[k.key]
      else verdier[k.key] = v
      return { ...vis, filter: { ...vis.filter, verdier } }
    })

  const sorter = (stigende: boolean) => {
    setVisning((v) => ({ ...v, sortering: [{ key: k.key, stigende }] }))
    lukk()
  }

  const left = Math.min(x, window.innerWidth - 280)
  return (
    <div className="kolonnemeny" style={{ left, top: y }} onClick={(e) => e.stopPropagation()}>
      <div className="meny-tittel">{k.tittel(doc)}</div>
      <button onClick={() => sorter(true)}>Sorter stigende (A–Å, 1–9)</button>
      <button onClick={() => sorter(false)}>Sorter synkende (Å–A, 9–1)</button>
      {visning.sortering.length > 0 && <button onClick={() => (setVisning((v) => ({ ...v, sortering: [] })), lukk())}>Fjern sortering (tilbake til Nr.)</button>}
      <hr />
      {brukVerdier ? (
        <>
          <input placeholder="Søk i verdier" value={sok} onChange={(e) => setSok(e.target.value)} autoFocus />
          <div className="verdiliste">
            <label>
              <input type="checkbox" checked={!valgt} onChange={() => settVerdier(valgt ? undefined : [])} /> (Velg alle)
            </label>
            {tilgjengelig
              .filter((v) => v.toLowerCase().includes(sok.toLowerCase()))
              .map((v) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    checked={!valgt || valgt.includes(v)}
                    onChange={(e) => {
                      const naa = valgt ?? tilgjengelig
                      const ny = e.target.checked ? [...naa, v] : naa.filter((x) => x !== v)
                      settVerdier(ny.length === tilgjengelig.length ? undefined : ny)
                    }}
                  />{' '}
                  {v}
                </label>
              ))}
          </div>
        </>
      ) : (
        <input
          placeholder="Inneholder tekst…"
          autoFocus
          value={visning.filter.tekst[k.key] ?? ''}
          onChange={(e) => setVisning((v) => ({ ...v, filter: { ...v.filter, tekst: { ...v.filter.tekst, [k.key]: e.target.value } } }))}
        />
      )}
      <hr />
      {!k.frosset && (
        <button onClick={() => (setVisning((v) => ({ ...v, skjulteKolonner: [...v.skjulteKolonner, k.key] })), lukk())}>Skjul kolonnen</button>
      )}
      <button onClick={lukk}>Lukk</button>
    </div>
  )
}
