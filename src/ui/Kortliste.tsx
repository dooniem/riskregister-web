import { useMemo, useRef, useState } from 'react'
import { formatDato, formatTall } from '../columns'
import type { Register } from '../model'
import { eksponering, eksponeringFarge, fv } from '../model'
import type { Tilstede } from '../store/backend'
import type { Op } from '../ops'
import type { Okt } from '../sync'
import type { Visning } from '../view'
import { filtrer, grupper, sorter } from '../view'
import { FagMerke, FagVelger } from './Fag'
import { Laas } from './Ikoner'
import { RiskInfo } from './RiskInfo'

type Props = {
  okt: Okt
  doc: Register
  andre: Tilstede[]
  visning: Visning
  aapne: (id: string) => void
  endre: (op: Op) => void
  kanSkrive: boolean
  melding: (t: string) => void
  pc?: boolean
}

const LANGT_TRYKK_MS = 500

// Kompakt visning: ett kort per risk. Brukes alltid på mobil, og på PC når «Kompakt» er valgt.
// Trykk åpner risken i panelet. Høyreklikk eller langt trykk åpner en meny med info og handlinger.
export function Kortliste({ okt, doc, andre, visning, aapne, endre, kanSkrive, melding, pc }: Props) {
  const grupperte = useMemo(() => grupper(doc, sorter(filtrer(doc, visning), visning.sortering), visning.gruppering), [doc, visning])
  const idag = new Date().toISOString().slice(0, 10)
  const [meny, setMeny] = useState<{ riskId: string; x: number; y: number } | null>(null)
  const [fagVelger, setFagVelger] = useState<{ riskId: string; x: number; y: number } | null>(null)
  // Langt trykk: iOS Safari sender ikke contextmenu, så vi måler selv. Bevegelse avbryter (det er da scrolling).
  const trykk = useRef<{ timer: number; x: number; y: number; utlost: boolean } | null>(null)
  const startTrykk = (riskId: string, e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const { clientX: x, clientY: y } = e.touches[0]
    const t = { x, y, utlost: false, timer: 0 }
    t.timer = window.setTimeout(() => {
      t.utlost = true
      navigator.vibrate?.(10)
      setMeny({ riskId, x, y })
    }, LANGT_TRYKK_MS)
    trykk.current = t
  }
  const flyttTrykk = (e: React.TouchEvent) => {
    const t = trykk.current
    if (t && Math.hypot(e.touches[0].clientX - t.x, e.touches[0].clientY - t.y) > 10) clearTimeout(t.timer)
  }
  const sluttTrykk = () => trykk.current && clearTimeout(trykk.current.timer)
  const sjekkLaas = (id: string) => {
    const av = okt.laastAv(id)
    if (av) melding(`Risken redigeres av ${av.navn} akkurat nå.`)
    return !av
  }
  const menyRisk = meny && doc.risker.find((x) => x.id === meny.riskId)
  return (
    <div className={'kortliste' + (pc ? ' kortliste-pc' : '')}>
      {grupperte.map((g) => (
        <section key={g.navn || '_'}>
          {g.navn && (
            <h3 className="kort-gruppe">
              {g.navn} <span className="liten">({g.risker.length})</span>
            </h3>
          )}
          {g.risker.map((r) => {
            const e = eksponering(r)
            const fag = doc.lister.fag.find((x) => x.id === r.fag)
            const f = eksponeringFarge(r.rm, e)
            const her = andre.filter((t) => t.riskId === r.id)
            const laast = okt.laastAv(r.id)
            const aapneTiltak = r.tiltak.filter((t) => t.tekst && t.status !== 'Utført' && t.status !== 'Utføres ikke')
            const forfalt = aapneTiltak.some((t) => t.frist && t.frist < idag)
            return (
              <button
                key={r.id}
                className={'riskkort' + (laast ? ' laast' : '')}
                onClick={() => {
                  // Et langt trykk skal ikke også åpne panelet når fingeren slippes
                  if (trykk.current?.utlost) return void (trykk.current = null)
                  aapne(r.id)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!trykk.current?.utlost) setMeny({ riskId: r.id, x: e.clientX, y: e.clientY })
                }}
                onTouchStart={(e) => startTrykk(r.id, e)}
                onTouchMove={flyttTrykk}
                onTouchEnd={sluttTrykk}
                onTouchCancel={sluttTrykk}
                style={her[0] ? { borderLeftColor: her[0].farge } : undefined}
              >
                <div className="riskkort-topp">
                  <span className="nr">{r.nr}</span>
                  {fag && <FagMerke fag={fag} />}
                  <span className={'rm rm-' + r.rm}>{r.rm === '-' ? '' : r.rm}</span>
                  <span className="eksp-merke" style={{ background: f?.bg, color: f?.fg }} title="Eksponering">
                    {e || '–'}
                  </span>
                  <span className="fv">FV {formatTall(fv(r))}</span>
                </div>
                <div className="riskkort-tittel">{r.hendelse || <em>Uten beskrivelse</em>}</div>
                {r.aarsak && <div className="riskkort-tekst">{r.aarsak}</div>}
                <div className="riskkort-bunn">
                  <span>{r.eier || 'Ingen eier'}</span>
                  {r.kategori && <span>· {r.kategori}</span>}
                  <span className={forfalt ? 'forfalt' : ''}>
                    · {aapneTiltak.length} åpne tiltak
                    {forfalt && ' (forfalt)'}
                  </span>
                </div>
                {aapneTiltak.slice(0, 2).map((t) => (
                  <div key={t.id} className="riskkort-tiltak">
                    {t.tekst}
                    <span className="liten">
                      {' '}
                      {[t.eier, formatDato(t.frist), t.status].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))}
                {(laast || her.length > 0) && (
                  <div className="riskkort-tilstede">
                    {laast ? (
                      <span className="laas-merke" style={{ background: laast.farge }}>
                        <Laas /> {laast.navn} skriver
                      </span>
                    ) : (
                      her.map((t) => (
                        <span key={t.brukerId} className="navnemerke" style={{ background: t.farge }}>
                          {t.navn}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </section>
      ))}
      {menyRisk && (
        <>
          <div className="meny-bakgrunn" onClick={() => setMeny(null)} onContextMenu={(e) => (e.preventDefault(), setMeny(null))} />
          <div className="kontekstmeny" style={{ left: Math.max(8, Math.min(meny.x, window.innerWidth - 270)), top: Math.max(8, Math.min(meny.y, window.innerHeight - 280)) }}>
            <RiskInfo r={menyRisk} />
            <button onClick={() => (aapne(menyRisk.id), setMeny(null))}>Åpne risken</button>
            {kanSkrive && (
              <>
                <button onClick={() => (sjekkLaas(menyRisk.id) && setFagVelger({ ...meny }), setMeny(null))}>Sett fag…</button>
                <hr />
                <button
                  className="fare"
                  onClick={() => {
                    setMeny(null)
                    if (!sjekkLaas(menyRisk.id)) return
                    if (!confirm(`Slette risk ${menyRisk.nr} «${menyRisk.hendelse || 'uten navn'}» med alle tiltak?\n\nVil du heller beholde historikken, sett status til Lukket.`)) return
                    endre({ t: 'deleteRisk', riskId: menyRisk.id })
                    melding(`Risk ${menyRisk.nr} er slettet.`)
                  }}
                >
                  Slett risken
                </button>
              </>
            )}
          </div>
        </>
      )}
      {fagVelger && (
        <FagVelger
          doc={doc}
          valgt={doc.risker.find((x) => x.id === fagVelger.riskId)?.fag}
          x={Math.max(8, fagVelger.x - 120)}
          y={fagVelger.y}
          endre={endre}
          velg={(id) => {
            const r = doc.risker.find((x) => x.id === fagVelger.riskId)
            if (r && (r.fag ?? '') !== id) endre({ t: 'setRisk', riskId: r.id, felt: 'fag', verdi: id, fra: r.fag ?? '' })
          }}
          lukk={() => setFagVelger(null)}
        />
      )}
    </div>
  )
}
