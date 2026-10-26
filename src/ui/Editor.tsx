import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Kolonne } from '../columns'
import { formatDato, isoUke, parseDato } from '../columns'
import { Kalender } from './Kalender'

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
  // Markert linje i valglista. Åpnes lista uten at man har skrevet, står markeringen på dagens verdi.
  const startIndeks = erstatt ? (start.trim() ? 0 : -1) : valg.indexOf(start)
  const [markert, setMarkert] = useState(startIndeks)
  const [ugyldig, setUgyldig] = useState(false)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const liste = useRef<HTMLUListElement>(null)
  const ferdig = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Som F2 i Excel: markøren havner bakerst i teksten. Valglister markerer alt, så man kan skrive over.
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

  const forsteGang = useRef(true)
  useEffect(() => {
    if (forsteGang.current) {
      forsteGang.current = false
      return
    }
    setMarkert(tekst.trim() ? 0 : -1)
    setUgyldig(false)
  }, [tekst])

  useLayoutEffect(() => {
    liste.current?.querySelector('.markert')?.scrollIntoView({ block: 'nearest' })
  }, [markert])

  const avslutt = (verdi: string, flytt: Flytt) => {
    if (ferdig.current) return
    ferdig.current = true
    onFerdig(verdi, flytt)
  }

  const valgt = () => (kolonne.type === 'valg' && markert >= 0 ? treff[markert] ?? tekst : tekst)

  // Datoer kan skrives fritt (31.12, 311226, uke 12 …). Ugyldig tekst lagres ikke.
  const fullfor = (flytt: Flytt) => {
    if (kolonne.type === 'dato' && parseDato(tekst) === null) {
      if (flytt === 'ingen') {
        ferdig.current = true
        onAvbryt()
      } else setUgyldig(true)
      return
    }
    avslutt(valgt(), flytt)
  }

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
      fullfor('ned')
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      fullfor(e.shiftKey ? 'venstre' : 'hoyre')
      return
    }
    if (kolonne.type === 'valg' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setMarkert((m) => Math.max(0, Math.min(treff.length - 1, m + (e.key === 'ArrowDown' ? 1 : -1))))
    }
    if (kolonne.type === 'valg' && (e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End') && !tekst) {
      e.preventDefault()
      setMarkert(e.key === 'Home' || e.key === 'PageUp' ? 0 : treff.length - 1)
    }
  }

  const felles = {
    ref,
    value: tekst,
    onKeyDown,
    onBlur: () => fullfor('ingen'),
    className: 'celle-editor' + (ugyldig ? ' ugyldig' : ''),
    spellCheck: kolonne.type === 'langtekst',
  }

  // Klikk inne i editoren skal ikke nå cellen under, som ellers flytter fokus og lukker editoren
  const ramme = {
    className: 'editor-ramme',
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.target !== ref.current) e.preventDefault()
    },
  }

  if (kolonne.type === 'langtekst')
    return (
      <div {...ramme} style={{ width: Math.max(bredde, 340) }}>
        <textarea {...felles} onChange={(e) => setTekst(e.target.value)} rows={3} />
        <div className="editor-hint">Enter lagrer · Alt+Enter ny linje · Esc avbryter</div>
      </div>
    )

  if (kolonne.type === 'dato') {
    const tolket = parseDato(tekst)
    return (
      <div {...ramme} style={{ width: Math.max(bredde, 252) }}>
        <input {...felles} placeholder="dd.mm.åååå" onChange={(e) => setTekst(e.target.value)} />
        <Kalender verdi={tolket ?? ''} onVelg={(iso) => avslutt(iso, 'ingen')} />
        <div className="editor-hint">{ugyldig ? 'Skjønner ikke datoen. Prøv f.eks. 31.12.2026 eller uke 12.' : tolket ? `${formatDato(tolket)} (uke ${isoUke(tolket).uke}) · Enter lagrer · Esc avbryter` : 'Skriv dato, «uke 12» eller velg i kalenderen'}</div>
      </div>
    )
  }

  return (
    <div {...ramme} style={{ width: Math.max(bredde, kolonne.type === 'valg' ? 200 : bredde) }}>
      <input {...felles} inputMode={kolonne.type === 'tall' ? 'decimal' : undefined} onChange={(e) => setTekst(e.target.value)} />
      {kolonne.type === 'valg' && treff.length > 0 && (
        <ul className="valgliste" ref={liste}>
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
