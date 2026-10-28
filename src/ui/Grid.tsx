import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Kolonne } from '../columns'
import { GRUPPER, KOLONNER, editorTekst, formatTall, tolkInput, visTekst } from '../columns'
import type { Register, Risk, Tiltak } from '../model'
import { eksponering, eksponeringFarge, fv, nyRisk, nyttTiltak } from '../model'
import type { Op, RiskFelt, TiltakFelt } from '../ops'
import type { Tilstede } from '../store/backend'
import type { Okt } from '../sync'
import type { Gruppe, Visning } from '../view'
import { filtrer, filterVerdier, grupper, sorter, summer } from '../view'
import type { Flytt } from './Editor'
import { CelleEditor } from './Editor'
import { FagMerke, FagVelger, fagForNyRisk } from './Fag'
import { Laas } from './Ikoner'
import { RiskInfo } from './RiskInfo'

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
}

const Kalenderikon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
)

export function synligeKolonner(v: Visning, egendef2Aktiv = false): Kolonne[] {
  return KOLONNER.filter((k) => {
    if (k.key === 'egendef2' && !egendef2Aktiv) return false
    if (v.skjulteKolonner.includes(k.key)) return false
    if (v.skjulteGrupper.includes(k.gruppe)) return GRUPPER.find((g) => g.key === k.gruppe)?.hoved === k.key
    return true
  })
}

// Fulle navn på kostkolonnene, vist som hjelpetekst på overskriften
const KOST_NAVN: Record<string, string> = { bc: 'Best case', ml: 'Most likely', wc: 'Worst case' }

export function Grid({ okt, doc, andre, visning, setVisning, endre, angre, aapneDetalj, melding, kanSkrive }: Props) {
  const [aktiv, setAktiv] = useState<Posisjon | null>(null)
  const [redigerer, setRedigerer] = useState<(Posisjon & { start: string; erstatt: boolean }) | null>(null)
  const [meny, setMeny] = useState<{ kol: string; x: number; y: number } | null>(null)
  const [kontekst, setKontekst] = useState<{ x: number; y: number; pos: Posisjon } | null>(null)
  const [fagVelger, setFagVelger] = useState<{ riskId: string; x: number; y: number } | null>(null)
  const [lukketGrupper, setLukketGrupper] = useState<string[]>([])
  const boks = useRef<HTMLDivElement>(null)

  const egendef2 = doc.lister.egendef2Aktiv
  const kolonner = useMemo(() => synligeKolonner(visning, egendef2), [visning, egendef2])
  const bredde = useCallback((k: Kolonne) => visning.bredder[k.key] ?? k.bredde, [visning.bredder])

  const risker = useMemo(() => sorter(filtrer(doc, visning), visning.sortering), [doc, visning])
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
    const ki = kolonner.findIndex((k) => k.key === aktiv.kol)
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

  const startRedigering = (p: Posisjon, start?: string) => {
    if (!kanSkrive) return melding('Du har bare lesetilgang til dette registeret.')
    const { r, k, t } = hentCelle(p)
    if (!r || !k || !k.felt) return
    const av = okt.laas(r.id)
    if (av) return melding(`Risk ${r.nr} redigeres av ${av} akkurat nå. Prøv igjen når de er ferdige.`)
    setRedigerer({ ...p, start: start ?? editorTekst(k, r, t), erstatt: start !== undefined })
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
    const { r, k, t } = hentCelle(aktiv)
    if (mod && e.key.toLowerCase() === 'c' && r && k) {
      e.preventDefault()
      void navigator.clipboard?.writeText(editorTekst(k, r, t))
      return
    }
    if (mod && e.key.toLowerCase() === 'v' && r && k?.felt) {
      e.preventDefault()
      void navigator.clipboard?.readText().then((s) => {
        if (okt.laas(r.id)) return melding(`Risk ${r.nr} redigeres av en annen akkurat nå.`)
        lagreVerdi(aktiv, tolkInput(k, s.replace(/\r?\n$/, '')))
        okt.slippLaas()
      })
      return
    }
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
        if (k?.type === 'avkrysning' || !k?.felt) return flytt('ned')
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
    if (e.key.length === 1 && !mod && !e.altKey && k?.felt && k.type !== 'avkrysning') {
      e.preventDefault()
      startRedigering(aktiv, e.key)
    }
  }

  const klikkCelle = (p: Posisjon, e: React.MouseEvent) => {
    setKontekst(null)
    if (e.detail === 2) {
      const { k, r } = hentCelle(p)
      if (k?.type === 'avkrysning' && r) {
        if (!okt.laastAv(r.id)) lagreVerdi(p, !r.tilSkarisk)
      } else if (k?.felt) startRedigering(p)
      else if (k?.key === 'nr') aapneDetalj(p.riskId)
      return
    }
    setAktiv(p)
    boks.current?.focus()
    // Som nedtrekkslistene i Excel-arket: ett klikk på en valgcelle eller en dato åpner lista eller kalenderen.
    // Venter til en eventuell åpen editor har lagret seg selv (den lukkes når den mister fokus).
    const { k } = hentCelle(p)
    if (kanSkrive && k?.felt && (k.type === 'valg' || k.type === 'dato') && !e.shiftKey && !e.ctrlKey && !e.metaKey) setTimeout(() => startRedigering(p), 0)
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

  return (
    <div className="grid-boks" ref={boks} tabIndex={0} onKeyDown={onKeyDown} onClick={() => setMeny(null)}>
      <table className="grid" style={{ width: totalBredde }}>
        <colgroup>
          {kolonner.map((k) => (
            <col key={k.key} style={{ width: bredde(k) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="gruppe-rad">
            {gruppeKolonner.map(({ g, n }) => {
              const sammen = visning.skjulteGrupper.includes(g.key)
              const stil = g.key === 'fast' ? { left: 0, zIndex: 6 } : undefined
              return (
                <th key={g.key} colSpan={n} className={'gruppe-th ' + (g.key === 'fast' ? 'frosset' : '')} style={stil} title={g.tittel}>
                  {g.tittel && (
                    <button
                      className="gruppe-knapp"
                      title={sammen ? 'Vis alle kolonnene i gruppen' : 'Slå sammen gruppen'}
                      onClick={() =>
                        setVisning((v) => ({ ...v, skjulteGrupper: sammen ? v.skjulteGrupper.filter((x) => x !== g.key) : [...v.skjulteGrupper, g.key] }))
                      }
                    >
                      <span className="chevron">{sammen ? '▸' : '▾'}</span> {g.tittel}
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
                <span className="kol-tittel">{k.tittel(doc)}</span>
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
                  ▾
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

function GruppeOverskrift({ gruppe, antallKol, lukket, bytt }: { gruppe: Gruppe; antallKol: number; lukket: boolean; bytt: () => void }) {
  const r = summer(gruppe.risker, 'R')
  const m = summer(gruppe.risker, 'M')
  return (
    <tbody className="gruppe-tbody">
      <tr>
        <td colSpan={antallKol} onClick={bytt}>
          <span className="chevron">{lukket ? '▸' : '▾'}</span>
          <strong>{gruppe.navn}</strong>
          <span className="gruppe-info">
            {gruppe.risker.length} {gruppe.risker.length === 1 ? 'risk' : 'risker'}
            {r.antall > 0 && ` · R: FV ${formatTall(r.fv)}`}
            {m.antall > 0 && ` · M: FV ${formatTall(m.fv)}`}
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
  redigerer: (Posisjon & { start: string; erstatt: boolean }) | null
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
}

function RiskRader(p: RaderProps) {
  const { risk: r, kolonner } = p
  const n = Math.max(1, r.tiltak.length)
  const e = eksponering(r)
  const farge = eksponeringFarge(r.rm, e)
  const laasFarge = p.laastAv ? p.tilstede.find((t) => t.navn === p.laastAv)?.farge : undefined
  const klasser = ['risk', p.laastAv ? 'laast' : '', p.minLaas ? 'min-laas' : '', r.status === 'Lukket' ? 'lukket' : ''].join(' ')
  const stripe = p.tilstede[0]?.farge
  const fag = r.fag ? p.doc.lister.fag.find((f) => f.id === r.fag) : undefined

  const celle = (k: Kolonne, t: Tiltak | undefined, rad: number) => {
    const pos: Posisjon = { riskId: r.id, tiltakId: k.nivaa === 'risk' ? r.tiltak[0]?.id : t?.id, kol: k.key }
    const erAktiv = p.aktiv?.riskId === r.id && p.aktiv.kol === k.key && (k.nivaa === 'risk' || p.aktiv.tiltakId === t?.id)
    const redigeres = p.redigerer?.riskId === r.id && p.redigerer.kol === k.key && (k.nivaa === 'risk' || p.redigerer.tiltakId === t?.id)
    const andreHer = p.tilstede.filter((x) => x.kolonne === k.key && (k.nivaa === 'risk' || x.tiltakId === t?.id))
    const stil: React.CSSProperties = {}
    if (k.frosset) stil.left = p.frossenVenstre[k.key]
    if (k.key === 'eksponering' && farge) {
      stil.background = farge.bg
      stil.color = farge.fg
    }
    if (andreHer.length) stil.boxShadow = `inset 0 0 0 2px ${andreHer[0].farge}`
    const kl = [
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
        </div>
      )
    if (k.key === 'tilSkarisk') innhold = r.tilSkarisk ? <span className="hake">✓</span> : <span className="kryss">✗</span>
    if (k.nivaa === 'tiltak' && !t && k.key === 'tiltak' && p.kanSkrive) innhold = <span className="plassholder">+ legg til tiltak</span>
    if (k.key === 'fv') innhold = formatTall(fv(r))
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
        {k.type === 'langtekst' ? <div className="tekstklipp">{innhold}</div> : innhold}
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
        {(k.type === 'valg' || k.type === 'dato') && k.felt && p.kanSkrive && !redigeres && (
          <span className={'valgpil' + (erAktiv ? ' synlig' : '')} aria-hidden>
            {k.type === 'dato' ? <Kalenderikon /> : '▾'}
          </span>
        )}
        {k.key === 'tiltak' && erAktiv && p.kanSkrive && !redigeres && (
          <button className="pluss" title="Nytt tiltak under (Ctrl+Enter)" onMouseDown={(ev) => (ev.stopPropagation(), p.nyttTiltak(pos))}>
            +
          </button>
        )}
        {redigeres && p.redigerer && (
          <CelleEditor
            kolonne={k}
            start={p.redigerer.start}
            erstatt={p.redigerer.erstatt}
            valg={k.valg?.(p.doc) ?? []}
            bredde={p.bredde(k)}
            onFerdig={p.ferdig}
            onAvbryt={p.avbryt}
          />
        )}
      </td>
    )
  }

  return (
    <tbody className={klasser} style={stripe ? ({ '--stripe': stripe } as React.CSSProperties) : undefined}>
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
