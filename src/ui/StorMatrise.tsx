import type { ReactNode } from 'react'
import { useState } from 'react'
import type { Register, Risk } from '../model'
import { KONSEKVENS, SANNSYNLIGHET, eksponering, eksponeringFarge, fagFarge } from '../model'
import type { Op } from '../ops'
import type { Okt } from '../sync'

interface Props {
  doc: Register
  risker: Risk[] // riskene som vises (fanen og filtrene som er valgt i registeret)
  rm: 'R' | 'M'
  mot?: { navn: string; risker: Map<string, Risk> } // snapshot det sammenlignes med
  okt: Okt
  endre: (...ops: Op[]) => void
  kanSkrive: boolean
  // Det samme panelet som åpnes for en risk ellers i registeret, vist ved siden av matrisen
  detalj: (riskId: string, lukk: () => void) => ReactNode
  melding: (tekst: string) => void
  lukk: () => void
}

const S = [5, 4, 3, 2, 1]
const K = [1, 2, 3, 4, 5]
const vurdert = (r: Risk) => r.sannsynlighet > 0 && r.konsekvens > 0

// Retning og farge på pilen som viser hvordan risken har flyttet seg siden snapshotet
function bevegelse(r: Risk, g: Risk | undefined, rm: 'R' | 'M') {
  if (!g || !vurdert(g) || !vurdert(r)) return null
  const ds = r.sannsynlighet - g.sannsynlighet
  const dk = r.konsekvens - g.konsekvens
  if (!ds && !dk) return null
  const de = eksponering(r) - eksponering(g)
  const bedre = rm === 'M' ? de > 0 : de < 0
  return {
    vinkel: (Math.atan2(ds, dk) * 180) / Math.PI,
    klasse: de === 0 ? 'lik' : bedre ? 'bedre' : 'verre',
    tekst: `Sannsynlighet ${g.sannsynlighet} → ${r.sannsynlighet}, konsekvens ${g.konsekvens} → ${r.konsekvens} (eksponering ${eksponering(g)} → ${eksponering(r)})`,
  }
}

// Stor risiko- eller mulighetsmatrise. Riskene vises som sirkler med nummeret, og kan dras til en annen rute
// for å endre sannsynlighet og konsekvens. Med et aktivt snapshot viser piler hvordan riskene har flyttet seg siden.
export function StorMatrise(p: Props) {
  const [rm, setRm] = useState(p.rm)
  const [valgt, setValgt] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Risken som vises i sidefeltet: som infokort, eller med hele risken (samme panel som i registeret)
  const [side, setSide] = useState<{ riskId: string; hel: boolean } | null>(null)
  const sideRisk = side && p.doc.risker.find((r) => r.id === side.riskId)
  const risker = p.risker.filter((r) => r.rm === rm)
  const ikkeVurdert = risker.filter((r) => !vurdert(r))
  const naa = new Set(p.risker.map((r) => r.id))
  // Risker som var i matrisen i snapshotet, men ikke er der nå (slettet, lukket eller filtrert bort)
  const borte = p.mot ? [...p.mot.risker.values()].filter((g) => g.rm === rm && vurdert(g) && g.status !== 'Lukket' && !naa.has(g.id)) : []

  const flytt = (riskId: string, s: number, k: number) => {
    setValgt(null)
    const r = p.doc.risker.find((x) => x.id === riskId)
    if (!r || !p.kanSkrive) return
    const laast = p.okt.laastAv(riskId)
    if (laast) return p.melding(`Risk ${r.nr} redigeres av ${laast.navn} akkurat nå.`)
    const ops: Op[] = []
    if (r.sannsynlighet !== s) ops.push({ t: 'setRisk', riskId, felt: 'sannsynlighet', verdi: s, fra: r.sannsynlighet })
    if (r.konsekvens !== k) ops.push({ t: 'setRisk', riskId, felt: 'konsekvens', verdi: k, fra: r.konsekvens })
    if (ops.length) p.endre(...ops)
  }

  const slippMaal = (id: string, s: number, k: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!p.kanSkrive) return
      e.preventDefault()
      setOver(id)
    },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(null)
      const riskId = e.dataTransfer.getData('text/plain')
      if (riskId) flytt(riskId, s, k)
    },
    // Uten mus (f.eks. nettbrett): trykk på en sirkel og så på ruten den skal til
    onClick: () => valgt && flytt(valgt, s, k),
  })

  const boble = (r: Risk) => {
    const g = p.mot?.risker.get(r.id)
    const pil = p.mot ? bevegelse(r, g, rm) : null
    const fag = r.fag ? p.doc.lister.fag.find((f) => f.id === r.fag) : undefined
    const laast = p.okt.laastAv(r.id)
    const kanFlytte = p.kanSkrive && !laast
    const tittel = [
      `Risk ${r.nr}`,
      `Årsak: ${r.aarsak || '–'}`,
      `Risikoeier: ${r.eier || '–'}`,
      fag && `Fag: ${fag.navn}`,
      laast && `Redigeres av ${laast.navn}`,
      pil?.tekst,
      p.mot && !g && 'Ny siden snapshotet',
    ]
      .filter(Boolean)
      .join('\n')
    return (
      <div
        key={r.id}
        className={'mboble' + (valgt === r.id || side?.riskId === r.id ? ' valgt' : '') + (laast ? ' laast' : '') + (r.status === 'Lukket' ? ' lukket' : '')}
        style={fag ? { borderColor: fagFarge(fag).bg } : undefined}
        draggable={kanFlytte}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', r.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={(e) => {
          e.stopPropagation()
          setValgt(null)
          setSide(side?.riskId === r.id && !side.hel ? null : { riskId: r.id, hel: false })
        }}
        onDoubleClick={() => setSide({ riskId: r.id, hel: true })}
        title={tittel + '\nKlikk for mer, dobbeltklikk for å åpne hele risken.'}
      >
        {r.nr}
        {pil && (
          <span className={'mpil ' + pil.klasse}>
            <svg viewBox="0 0 16 16" style={{ transform: `rotate(${-pil.vinkel}deg)` }} aria-hidden>
              <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {p.mot && !g && <span className="mny">ny</span>}
      </div>
    )
  }

  return (
    <div className="modal-bakgrunn" onMouseDown={(e) => e.target === e.currentTarget && p.lukk()}>
      <div className={'modal stormatrise' + (sideRisk ? ' med-side' : '')}>
        <header>
          <h2>{rm === 'R' ? 'Risikomatrise' : 'Mulighetsmatrise'}</h2>
          <nav className="faner">
            <button className={rm === 'R' ? 'valgt' : ''} onClick={() => setRm('R')}>
              Risiko
            </button>
            <button className={rm === 'M' ? 'valgt' : ''} onClick={() => setRm('M')}>
              Mulighet
            </button>
          </nav>
          <button className="ikonknapp" onClick={p.lukk}>
            ✕
          </button>
        </header>
        <div className="stormatrise-innhold">
        <div className="modal-innhold">
          <p className="liten">
            {p.kanSkrive ? 'Dra en risk til en annen rute for å endre sannsynlighet og konsekvens. ' : ''}
            Klikk på en risk for å se mer om den, dobbeltklikk for å åpne og redigere hele risken.
            {p.mot && (
              <>
                {' '}
                Pilene viser hvordan riskene har flyttet seg siden snapshotet «{p.mot.navn}»:{' '}
                <span className="mpil-forklaring bedre">grønn</span> er bedre, <span className="mpil-forklaring verre">rød</span> er verre,{' '}
                <span className="mpil-forklaring lik">gul</span> er lik eksponering. Risker uten pil har ikke flyttet seg.
              </>
            )}
          </p>
          {valgt && (
            <div className="banner info">
              Trykk på ruten risk {p.doc.risker.find((r) => r.id === valgt)?.nr} skal flyttes til.
              <button className="lenkeknapp" onClick={() => setValgt(null)}>
                Avbryt
              </button>
            </div>
          )}
          <div className="smatrise">
            <div className="saksey">Sannsynlighet</div>
            <div className="srutenett">
              {S.map((s) => (
                <div key={s} className="srad">
                  <div className="slabel">{SANNSYNLIGHET[s - 1]}</div>
                  {K.map((k) => {
                    const f = eksponeringFarge(rm, s * k)
                    const id = `${s}-${k}`
                    return (
                      <div key={k} className={'srute' + (over === id ? ' over' : '') + (valgt ? ' kan-slippe' : '')} style={{ background: f?.bg }} {...slippMaal(id, s, k)}>
                        <span className="sverdi" style={{ color: f?.fg }}>
                          {s * k}
                        </span>
                        {risker.filter((r) => r.sannsynlighet === s && r.konsekvens === k).map(boble)}
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="srad">
                <div className="slabel" />
                {K.map((k) => (
                  <div key={k} className="slabel x">
                    {KONSEKVENS[k - 1]}
                  </div>
                ))}
              </div>
              <div className="saksex">Konsekvens</div>
            </div>
          </div>
          <div className={'ikke-vurdert' + (over === 'iv' ? ' over' : '')} {...slippMaal('iv', 0, 0)}>
            <span className="liten">Ikke vurdert ({ikkeVurdert.length}):</span>
            {ikkeVurdert.map(boble)}
          </div>
          {borte.length > 0 && (
            <div className="ikke-vurdert borte">
              <span className="liten">I snapshotet, men ikke i matrisen nå ({borte.length}):</span>
              {borte.map((g) => (
                <span key={g.id} className="mboble borte" title={`Risk ${g.nr}: ${g.hendelse || g.aarsak}\nVar i rute ${g.sannsynlighet} × ${g.konsekvens}`}>
                  {g.nr}
                </span>
              ))}
            </div>
          )}
        </div>
        {sideRisk &&
          (side.hel ? (
            <div className="stormatrise-side hel">{p.detalj(sideRisk.id, () => setSide(null))}</div>
          ) : (
            <Infokort
              r={sideRisk}
              doc={p.doc}
              gammel={p.mot?.risker.get(sideRisk.id)}
              kanFlytte={p.kanSkrive && !p.okt.laastAv(sideRisk.id)}
              flytt={() => (setValgt(sideRisk.id), setSide(null))}
              aapne={() => setSide({ riskId: sideRisk.id, hel: true })}
              lukk={() => setSide(null)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Kort med det viktigste om risken, vist når den klikkes i matrisen
function Infokort({ r, doc, gammel, kanFlytte, flytt, aapne, lukk }: { r: Risk; doc: Register; gammel?: Risk; kanFlytte: boolean; flytt: () => void; aapne: () => void; lukk: () => void }) {
  const fag = r.fag ? doc.lister.fag.find((f) => f.id === r.fag) : undefined
  const e = eksponering(r)
  const farge = eksponeringFarge(r.rm, e)
  const felt: [string, string][] = [
    ['Årsak', r.aarsak],
    ['Hendelse', r.hendelse],
    ['Konsekvenser hvis det skjer', r.konsekvenser],
    ['Risikoeier', r.eier],
  ]
  return (
    <aside className="stormatrise-side infokort">
      <header>
        <h3>
          Risk {r.nr} <span className={'rm-' + r.rm}>{r.rm}</span>
        </h3>
        <button className="ikonknapp" onClick={lukk} title="Lukk">
          ✕
        </button>
      </header>
      <div className="infokort-merker">
        {fag && (
          <span className="fagmerke" style={{ background: fagFarge(fag).bg, color: fagFarge(fag).fg }}>
            {fag.navn}
          </span>
        )}
        <span className="eksp" style={{ background: farge?.bg, color: farge?.fg }}>
          {r.sannsynlighet || '–'} × {r.konsekvens || '–'} = {e || '–'}
        </span>
        {gammel && vurdert(gammel) && eksponering(gammel) !== e && <span className="liten">snapshot: {eksponering(gammel)}</span>}
        <span className="liten">{r.status}</span>
      </div>
      <dl>
        {felt.map(([navn, verdi]) => (
          <div key={navn}>
            <dt>{navn}</dt>
            <dd>{verdi || '–'}</dd>
          </div>
        ))}
      </dl>
      <div className="knapperad">
        <button className="knapp primær" onClick={aapne}>
          Åpne hele risken
        </button>
        {kanFlytte && (
          <button className="knapp" onClick={flytt} title="Trykk så på ruten risken skal til">
            Flytt til rute…
          </button>
        )}
      </div>
    </aside>
  )
}
