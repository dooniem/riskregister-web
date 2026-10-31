import { useLayoutEffect, useRef, useState } from 'react'
import { formatTall, parseTall } from '../columns'
import type { Risk } from '../model'
import { fv } from '../model'
import { usePopup } from './popup'

type Felt = 'bc' | 'ml' | 'wc'

const FELT: { key: Felt; navn: string }[] = [
  { key: 'bc', navn: 'Best (BC)' },
  { key: 'ml', navn: 'Mest sannsynlig (ML)' },
  { key: 'wc', navn: 'Verst (WC)' },
]

interface Props {
  risk: Risk
  // Cellen editoren åpnes fra. Editoren legger seg under den, eller over hvis det ikke er plass.
  anker: DOMRect
  // Cellen selv. Et nytt klikk i den lagrer.
  celle?: Element
  start?: Felt
  onLagre: (verdier: Record<Felt, number>) => void
  onAvbryt: () => void
}

// Moderne visning: BC, ML og WC redigeres sammen i ett lite vindu, med forventet verdi regnet ut mens man skriver
export function KostEditor({ risk: r, anker, celle, start = 'bc', onLagre, onAvbryt }: Props) {
  const [tekst, setTekst] = useState<Record<Felt, string>>({ bc: r.bc ? String(r.bc) : '', ml: r.ml ? String(r.ml) : '', wc: r.wc ? String(r.wc) : '' })
  const { boks, pos } = usePopup<HTMLDivElement>(anker, celle, () => onLagre(tall), onAvbryt)
  const forste = useRef<HTMLInputElement>(null)

  const tall = { bc: parseTall(tekst.bc), ml: parseTall(tekst.ml), wc: parseTall(tekst.wc) }
  const ny = fv({ ...r, ...tall })
  const rekkefolge = tall.bc <= tall.ml && tall.ml <= tall.wc

  useLayoutEffect(() => {
    forste.current?.focus()
    forste.current?.select()
  }, [])

  const lagre = () => onLagre(tall)

  // Skala for spennet: største verdi av de tre (og den gamle forventede verdien), så alt får plass
  const maks = Math.max(tall.wc, tall.ml, tall.bc, 1)
  const p = (v: number) => `${Math.min(100, Math.max(0, (v / maks) * 100))}%`

  return (
    <div
      ref={boks}
      className="kost-editor"
      role="dialog"
      aria-label={`Mulig kost for risk ${r.nr}`}
      style={pos}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onAvbryt()
        // Enter lagrer, men ikke når fokus står på en knapp: da gjør knappen det den heter (f.eks. Avbryt)
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault()
          lagre()
        }
      }}
    >
      <div className="kost-editor-tittel">Mulig kost for risk {r.nr}, i 1000 kr</div>
      <div className="kost-editor-felt">
        {FELT.map((f) => (
          <label key={f.key} className={'felt-' + f.key}>
            <span>
              <i aria-hidden />
              {f.navn}
            </span>
            <input
              ref={f.key === start ? forste : undefined}
              inputMode="decimal"
              value={tekst[f.key]}
              onChange={(e) => setTekst((t) => ({ ...t, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className={'kost-spenn stor' + (r.rm === 'M' ? ' m' : '')} aria-hidden>
        <i style={{ left: p(tall.bc), width: `calc(${p(tall.wc)} - ${p(tall.bc)})` }} />
        <b className="ml" style={{ left: p(tall.ml) }} />
        <b style={{ left: p(ny) }} />
      </div>
      <div className="kost-editor-fv">
        Forventet <strong>{formatTall(ny)}</strong>
        {Math.round(ny) !== Math.round(fv(r)) && <span className="liten">, var {formatTall(fv(r))}</span>}
      </div>
      {!rekkefolge && <div className="kost-editor-hint">Vanligvis er best ≤ mest sannsynlig ≤ verst. Du kan lagre likevel.</div>}
      <div className="kost-editor-knapper">
        <span className="liten">
          <kbd>Tab</kbd> neste felt, <kbd>Enter</kbd> lagre
        </span>
        <button className="knapp" onClick={onAvbryt}>
          Avbryt
        </button>
        <button className="knapp primær" onClick={lagre}>
          Lagre kost
        </button>
      </div>
    </div>
  )
}
