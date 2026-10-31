import { useLayoutEffect, useRef, useState } from 'react'
import type { Risk } from '../model'
import { KONSEKVENS, SANNSYNLIGHET, eksponeringFarge, eksponeringNivaa } from '../model'
import { usePopup } from './popup'

type Felt = 'sannsynlighet' | 'konsekvens'
type Verdier = Record<Felt, number>

interface Props {
  risk: Risk
  // Cellen editoren åpnes fra. Editoren legger seg under den, eller over hvis det ikke er plass.
  anker: DOMRect
  onLagre: (verdier: Verdier) => void
  onAvbryt: () => void
}

// Høyeste nivå øverst, slik som sannsynlighetsaksen i risikomatrisen
const NIVAA = [5, 4, 3, 2, 1]
const NAVN: Record<Felt, string[]> = { sannsynlighet: SANNSYNLIGHET, konsekvens: KONSEKVENS }
// Teksten uten tallet foran, f.eks. «Veldig høy»
const tekst = (felt: Felt, n: number) => NAVN[felt][n - 1].replace(/^\d\s*/, '')

// Moderne visning: sannsynlighet og konsekvens velges sammen i ett lite vindu. Øverst vises eksponeringen
// (sannsynlighet × konsekvens) med fargen den får i registeret, og den oppdateres med en gang man velger.
export function VurderingEditor({ risk: r, anker, onLagre, onAvbryt }: Props) {
  const [v, setV] = useState<Verdier>({ sannsynlighet: r.sannsynlighet, konsekvens: r.konsekvens })
  const { boks, pos } = usePopup<HTMLDivElement>(anker, () => onLagre(v))
  const forste = useRef<HTMLDivElement>(null)

  // Starter i sannsynlighet, eller i konsekvens hvis sannsynlighet er satt og konsekvens mangler
  const startIKonsekvens = !!r.sannsynlighet && !r.konsekvens
  useLayoutEffect(() => {
    const el = startIKonsekvens ? boks.current?.querySelector<HTMLElement>('[data-felt="konsekvens"]') : forste.current
    el?.focus()
  }, [boks, startIKonsekvens])

  const e = v.sannsynlighet && v.konsekvens ? v.sannsynlighet * v.konsekvens : 0
  const farge = eksponeringFarge(r.rm, e)
  const gammel = r.sannsynlighet * r.konsekvens
  const endret = v.sannsynlighet !== r.sannsynlighet || v.konsekvens !== r.konsekvens
  const hva = r.rm === 'M' ? 'mulighet' : 'risk'
  const lagre = () => onLagre(v)
  const sett = (felt: Felt, n: number) => setV((x) => ({ ...x, [felt]: n }))

  const nivaaTekst = e ? eksponeringNivaa(e).replace(/\s*\(.*\)$/, '') : 'Ikke vurdert'
  const mangler = !v.sannsynlighet && !v.konsekvens ? 'Velg sannsynlighet og konsekvens' : !v.sannsynlighet ? 'Velg sannsynlighet' : 'Velg konsekvens'

  return (
    <div
      ref={boks}
      className={'vurd-editor' + (r.rm === 'M' ? ' m' : '')}
      role="dialog"
      aria-label={`Vurdering av ${hva} ${r.nr}`}
      style={pos}
      onMouseDown={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => {
        ev.stopPropagation()
        if (ev.key === 'Escape') onAvbryt()
        // Enter lagrer, men ikke når fokus står på en knapp: da gjør knappen det den heter (f.eks. Avbryt)
        if (ev.key === 'Enter' && !(ev.target instanceof HTMLButtonElement)) {
          ev.preventDefault()
          lagre()
        }
      }}
    >
      <div className="vurd-editor-tittel">Vurdering av {hva} {r.nr}</div>

      <div className="vurd-topp">
        <div
          className={'vurd-flis' + (e ? '' : ' tom') + (e && !farge ? ' uten-farge' : '')}
          style={farge ? { background: farge.bg, color: farge.fg } : undefined}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="vurd-flis-navn">Eksponering</span>
          <strong className="vurd-flis-tall">{e || '–'}</strong>
          <span className="vurd-flis-nivaa">{nivaaTekst}</span>
        </div>
        <div className="vurd-forklaring">
          {e ? (
            <div className="vurd-regnestykke">
              <span>
                <b>{v.sannsynlighet}</b>
                <small>Sannsynlighet</small>
              </span>
              <i aria-hidden>×</i>
              <span>
                <b>{v.konsekvens}</b>
                <small>Konsekvens</small>
              </span>
            </div>
          ) : (
            <div className="vurd-mangler">{mangler}</div>
          )}
          {endret && !!gammel && <div className="liten">Var {gammel}</div>}
          {!!e && !farge && <div className="liten">Sett R&amp;M på risken for å få farge.</div>}
        </div>
        <MiniMatrise rm={r.rm} v={v} gammel={r.sannsynlighet && r.konsekvens ? r : undefined} sett={(s, k) => setV({ sannsynlighet: s, konsekvens: k })} />
      </div>

      <div className="vurd-lister">
        <Liste felt="sannsynlighet" verdi={v.sannsynlighet} sett={(n) => sett('sannsynlighet', n)} refEl={forste} />
        <Liste felt="konsekvens" verdi={v.konsekvens} sett={(n) => sett('konsekvens', n)} />
      </div>

      <div className="kost-editor-knapper">
        <span className="liten">
          <kbd>Tab</kbd> neste liste, <kbd>↑</kbd>
          <kbd>↓</kbd> velg, <kbd>Enter</kbd> lagre
        </span>
        {(!!v.sannsynlighet || !!v.konsekvens) && (
          <button className="lenkeknapp" onClick={() => setV({ sannsynlighet: 0, konsekvens: 0 })}>
            Nullstill
          </button>
        )}
        <button className="knapp" onClick={onAvbryt}>
          Avbryt
        </button>
        <button className="knapp primær" onClick={lagre}>
          Lagre vurdering
        </button>
      </div>
    </div>
  )
}

// Liste med de fem nivåene. Piltastene flytter valget, tallene 1–5 velger nivået direkte.
function Liste({ felt, verdi, sett, refEl }: { felt: Felt; verdi: number; sett: (n: number) => void; refEl?: React.Ref<HTMLDivElement> }) {
  const id = `vurd-${felt}`
  const navn = felt === 'sannsynlighet' ? 'Sannsynlighet' : 'Konsekvens'
  return (
    <div className="vurd-liste">
      <div className="vurd-liste-navn" id={id + '-navn'}>
        {navn}
      </div>
      <div
        ref={refEl}
        role="listbox"
        tabIndex={0}
        data-felt={felt}
        aria-labelledby={id + '-navn'}
        aria-activedescendant={verdi ? `${id}-${verdi}` : undefined}
        onKeyDown={(ev) => {
          const i = NIVAA.indexOf(verdi)
          let ny: number | undefined
          if (ev.key === 'ArrowDown') ny = i < 0 ? NIVAA[0] : NIVAA[Math.min(NIVAA.length - 1, i + 1)]
          if (ev.key === 'ArrowUp') ny = i < 0 ? NIVAA[NIVAA.length - 1] : NIVAA[Math.max(0, i - 1)]
          if (ev.key === 'Home') ny = NIVAA[0]
          if (ev.key === 'End') ny = NIVAA[NIVAA.length - 1]
          if (/^[1-5]$/.test(ev.key)) ny = Number(ev.key)
          if (ny !== undefined) {
            ev.preventDefault()
            sett(ny)
          }
        }}
      >
        {NIVAA.map((n) => (
          <div
            key={n}
            id={`${id}-${n}`}
            role="option"
            aria-selected={verdi === n}
            className={'vurd-valg' + (verdi === n ? ' valgt' : '')}
            onClick={() => sett(n)}
          >
            <span className="vurd-trinn" aria-hidden>
              {[1, 2, 3, 4, 5].map((t) => (
                <i key={t} className={t <= n ? 'paa' : ''} style={{ height: 3 + t * 2 }} />
              ))}
            </span>
            <span className="vurd-valg-tall">{n}</span>
            <span className="vurd-valg-tekst">{tekst(felt, n)}</span>
            <svg className="vurd-hake" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

// Liten risikomatrise som viser hvor risken havner. Et klikk i en rute setter begge verdiene.
function MiniMatrise({ rm, v, gammel, sett }: { rm: Risk['rm']; v: Verdier; gammel?: Verdier; sett: (s: number, k: number) => void }) {
  return (
    <div className="vurd-matrise" role="group" aria-label="Plassering i risikomatrisen">
      {NIVAA.map((s) =>
        [1, 2, 3, 4, 5].map((k) => {
          const f = eksponeringFarge(rm === '-' ? 'R' : rm, s * k)
          const her = v.sannsynlighet === s && v.konsekvens === k
          const var_ = gammel && gammel.sannsynlighet === s && gammel.konsekvens === k && !her
          return (
            <button
              key={`${s}-${k}`}
              type="button"
              tabIndex={-1}
              className={(her ? 'her' : '') + (var_ ? ' var' : '')}
              style={{ background: f?.bg }}
              title={`Sannsynlighet ${s}, konsekvens ${k}: eksponering ${s * k}`}
              aria-label={`Sannsynlighet ${s}, konsekvens ${k}`}
              aria-pressed={her}
              onClick={() => sett(s, k)}
            />
          )
        }),
      )}
      <span className="vurd-matrise-akse y" aria-hidden>
        S
      </span>
      <span className="vurd-matrise-akse x" aria-hidden>
        K
      </span>
    </div>
  )
}
