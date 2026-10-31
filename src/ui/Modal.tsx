import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react'

// Navnet på dialogen: overskriften (h2) i dialogen får denne id-en via <ModalTittel>
const TittelId = createContext<string | undefined>(undefined)

export function ModalTittel({ children }: { children: React.ReactNode }) {
  return <h2 id={useContext(TittelId)}>{children}</h2>
}

// Felles ramme for dialogene. Bruker nettleserens egen <dialog> åpnet med showModal(), som gir det samme i Chrome,
// Edge, Firefox og Safari: resten av siden blir utilgjengelig så lenge dialogen er åpen, Tab blir i dialogen,
// Esc lukker, fokus går tilbake dit det var, og skjermlesere leser opp dialogen med navnet i overskriften.
// Uten lukk kan dialogen ikke lukkes med Esc eller klikk utenfor (brukes når brukeren må ta et valg).
export function Modal({ className, lukk, children }: { className?: string; lukk?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const tittelId = useId()
  const sistLukk = useRef(lukk)
  useLayoutEffect(() => {
    sistLukk.current = lukk
  })

  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    const forrige = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!d.open) d.showModal()
    return () => {
      // Lukk før React fjerner elementet, så nettleseren gir fokus tilbake. Fjernes elementet mens det er åpent,
      // havner fokus på <body> i noen nettlesere, så vi setter det tilbake selv i så fall.
      if (d.open) d.close()
      if (forrige?.isConnected && (document.activeElement === document.body || document.activeElement === null)) forrige.focus({ preventScroll: true })
    }
  }, [])

  // Klikk utenfor lukker, som før. Sjekker posisjonen og ikke e.target, siden dialogen selv også er target for
  // klikk på kantene og mellomrommene inni. Både trykk og slipp må være utenfor, så et merke-og-dra som ender
  // utenfor ikke lukker.
  const trykketUtenfor = useRef(false)
  const utenfor = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return e.target === ref.current && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
  }

  return (
    <dialog
      ref={ref}
      className={'modal' + (className ? ' ' + className : '')}
      aria-labelledby={tittelId}
      onCancel={(e) => {
        // Esc: React styrer om dialogen vises, så nettleseren skal ikke lukke den selv
        e.preventDefault()
        sistLukk.current?.()
      }}
      onClose={() => {
        // Nettleseren kan lukke en modal dialog uten cancel (f.eks. Esc to ganger raskt i Chrome).
        // Er den fortsatt i bruk, lukker vi den ordentlig, eller åpner den igjen hvis den ikke kan lukkes.
        const d = ref.current
        if (!d?.isConnected) return
        if (sistLukk.current) sistLukk.current()
        else if (!d.open) d.showModal()
      }}
      onPointerDown={(e) => (trykketUtenfor.current = utenfor(e))}
      onPointerUp={(e) => {
        if (trykketUtenfor.current && utenfor(e)) sistLukk.current?.()
        trykketUtenfor.current = false
      }}
    >
      <TittelId.Provider value={tittelId}>{children}</TittelId.Provider>
    </dialog>
  )
}
