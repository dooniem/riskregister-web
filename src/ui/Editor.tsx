import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Kolonne } from '../columns'

export type Flytt = 'ned' | 'opp' | 'hoyre' | 'venstre' | 'ingen'

interface Props {
  kolonne: Kolonne
  start: string
  erstatt: boolean // true når redigering startet ved å skrive et tegn
  valg: string[]
  bredde: number
  onFerdig: (tekst: string, flytt: Flytt) => void
  onAvbryt: () => void
}

// Editoren legger seg oppå cellen, som når man skriver direkte i en Excel-celle
export function CelleEditor({ kolonne, start, erstatt, valg, bredde, onFerdig, onAvbryt }: Props) {
  const [tekst, setTekst] = useState(start)
  const [markert, setMarkert] = useState(0)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const ferdig = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Som F2 i Excel: markøren havner bakerst i teksten. Valglister markerer alt, så man kan skrive over.
    if (kolonne.type === 'dato') return
    if (!erstatt && kolonne.type === 'valg') el.select?.()
    else el.setSelectionRange?.(el.value.length, el.value.length)
  }, [erstatt, kolonne.type])

  // Textarea vokser med innholdet
  useLayoutEffect(() => {
    const el = ref.current
    if (kolonne.type !== 'langtekst' || !el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight + 2, 420) + 'px'
  }, [tekst, kolonne.type])

  const treff = useMemo(() => {
    if (kolonne.type !== 'valg') return []
    const t = tekst.trim().toLowerCase()
    if (!t || (!erstatt && tekst === start)) return valg
    return valg.filter((v) => v.toLowerCase().includes(t)).sort((a, b) => Number(!a.toLowerCase().startsWith(t)) - Number(!b.toLowerCase().startsWith(t)))
  }, [tekst, valg, kolonne.type, erstatt, start])

  useEffect(() => setMarkert(0), [tekst])

  const avslutt = (verdi: string, flytt: Flytt) => {
    if (ferdig.current) return
    ferdig.current = true
    onFerdig(verdi, flytt)
  }

  const valgt = () => (kolonne.type === 'valg' && treff.length && tekst.trim() !== '' ? treff[markert] ?? tekst : tekst)

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      ferdig.current = true
      onAvbryt()
      return
    }
    if (e.key === 'Enter' && !(kolonne.type === 'langtekst' && (e.altKey || e.shiftKey))) {
      e.preventDefault()
      avslutt(valgt(), 'ned')
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      avslutt(valgt(), e.shiftKey ? 'venstre' : 'hoyre')
      return
    }
    if (kolonne.type === 'valg' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setMarkert((m) => Math.max(0, Math.min(treff.length - 1, m + (e.key === 'ArrowDown' ? 1 : -1))))
    }
  }

  const felles = {
    ref,
    value: tekst,
    onKeyDown,
    onBlur: () => avslutt(valgt(), 'ingen'),
    className: 'celle-editor',
    spellCheck: kolonne.type === 'langtekst',
  }

  if (kolonne.type === 'langtekst')
    return (
      <div className="editor-ramme" style={{ width: Math.max(bredde, 340) }}>
        <textarea {...felles} onChange={(e) => setTekst(e.target.value)} rows={3} />
        <div className="editor-hint">Enter lagrer · Alt+Enter ny linje · Esc avbryter</div>
      </div>
    )

  if (kolonne.type === 'dato')
    return (
      <div className="editor-ramme" style={{ width: Math.max(bredde, 150) }}>
        <input {...felles} type="date" onChange={(e) => setTekst(e.target.value)} />
      </div>
    )

  return (
    <div className="editor-ramme" style={{ width: Math.max(bredde, kolonne.type === 'valg' ? 200 : bredde) }}>
      <input {...felles} inputMode={kolonne.type === 'tall' ? 'decimal' : undefined} onChange={(e) => setTekst(e.target.value)} />
      {kolonne.type === 'valg' && treff.length > 0 && (
        <ul className="valgliste" onMouseDown={(e) => e.preventDefault()}>
          {treff.slice(0, 50).map((v, i) => (
            <li key={v} className={i === markert ? 'markert' : ''} onMouseEnter={() => setMarkert(i)} onClick={() => avslutt(v, 'ingen')}>
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
