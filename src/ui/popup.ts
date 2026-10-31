import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Felles for de små redigeringsvinduene i moderne visning (kost og vurdering): vinduet legger seg under cellen det
// åpnes fra, eller over hvis det ikke er plass. Et klikk utenfor vinduet lagrer, som Enter.
export function usePopup<T extends HTMLElement>(anker: DOMRect, onLagre: () => void) {
  const boks = useRef<T>(null)
  const [pos, setPos] = useState({ left: anker.left, top: anker.bottom + 6 })

  useLayoutEffect(() => {
    const h = boks.current?.offsetHeight ?? 0
    const w = boks.current?.offsetWidth ?? 0
    const left = Math.max(8, Math.min(anker.right - w, window.innerWidth - w - 8))
    const top = anker.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, anker.top - h - 6) : anker.bottom + 6
    setPos({ left, top })
  }, [anker])

  const siste = useRef({ onLagre })
  useEffect(() => {
    siste.current = { onLagre }
  })
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const mal = e.target as Node
      if (boks.current?.contains(mal)) return
      // Både et nytt klikk i cellen og et klikk andre steder lagrer, som i Excel. Bare Esc og Avbryt forkaster.
      // En lagring man ikke ville ha, kan angres med Ctrl+Z, mens en endring som forkastes uten beskjed er borte.
      siste.current.onLagre()
    }
    const t = setTimeout(() => window.addEventListener('mousedown', h))
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', h)
    }
  }, [])

  return { boks, pos }
}
