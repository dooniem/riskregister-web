import { formatEndring, formatTall } from '../columns'
import type { Register, Risk } from '../model'
import { eksponeringFarge } from '../model'
import type { Visning } from '../view'
import { Utvid } from './Ikoner'
import { filtrer, iFane, summer } from '../view'

interface Props {
  doc: Register
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  mot?: Register // snapshot det sammenlignes med
  aapneMatrise?: (rm: 'R' | 'M') => void
  moderne?: boolean // alt i ett lavt kort, så tabellen får mer plass
  samlet?: boolean // nøkkeltallene som en lav stripe uten kort
}

// Summer for risiko og mulighet (som M:/R:-radene øverst i Excel) og en klikkbar risikomatrise
export function Oversikt({ doc, visning, setVisning, mot, aapneMatrise, moderne, samlet }: Props) {
  const grunnlagFor = (d: Register): Risk[] => (visning.kunFiltrerteSummer ? filtrer(d, visning) : d.risker.filter((r) => iFane(r, visning.fane)))
  const grunnlag = grunnlagFor(doc)
  const r = summer(grunnlag, 'R')
  const m = summer(grunnlag, 'M')
  // Samme utvalg i snapshotet, slik at summene kan sammenlignes
  const gammel = mot && { R: summer(grunnlagFor(mot), 'R'), M: summer(grunnlagFor(mot), 'M') }
  const matriseRisker = filtrer(doc, { ...visning, filter: { ...visning.filter, matrise: undefined } })

  const rad = (navn: string, s: ReturnType<typeof summer>, rm: 'R' | 'M') => {
    const celle = (felt: 'antall' | 'bc' | 'ml' | 'wc' | 'fv', kl?: string) => {
      const d = gammel ? s[felt] - gammel[rm][felt] : 0
      const tekst = formatEndring(d)
      const bra = rm === 'M' ? d > 0 : d < 0
      return (
        <td className={kl}>
          {felt === 'antall' ? s.antall : formatTall(s[felt])}
          {gammel && tekst && <span className={'delta ' + (felt === 'antall' ? '' : bra ? 'bedre' : 'verre')}>{tekst}</span>}
        </td>
      )
    }
    return (
      <tr className={'rm-' + rm}>
        <th>{moderne ? <span className={'rm-merke rm-' + rm}>{navn}</span> : navn}</th>
        {celle('antall')}
        {celle('bc')}
        {celle('ml')}
        {celle('wc')}
        {celle('fv', 'fv')}
      </tr>
    )
  }

  const kost = (
    <div className={moderne ? 'oversikt-kost' : 'kort'}>
      <div className="kort-tittel">
        Mulig kost (i 1000)
        <label className="liten">
          <input
            type="checkbox"
            checked={visning.kunFiltrerteSummer}
            onChange={(e) => setVisning((v) => ({ ...v, kunFiltrerteSummer: e.target.checked }))}
          />{' '}
          summer bare det som vises
        </label>
      </div>
      <table className="summer">
        <thead>
          <tr>
            <th />
            <th>Antall</th>
            <th title="Best case" className="k-bc">{moderne ? 'Best' : 'BC'}</th>
            <th title="Most likely" className="k-ml">{moderne ? 'Mest sannsynlig' : 'ML'}</th>
            <th title="Worst case" className="k-wc">{moderne ? 'Verst' : 'WC'}</th>
            <th title="Forventet verdi">{moderne ? 'Forventet' : 'FV'}</th>
          </tr>
        </thead>
        <tbody>
          {rad(moderne ? 'Risiko' : 'Risiko (R)', r, 'R')}
          {rad(moderne ? 'Mulighet' : 'Mulighet (M)', m, 'M')}
        </tbody>
      </table>
    </div>
  )
  const matriser = (['R', 'M'] as const).map((rm) => (
    <Matrise
      key={rm}
      risker={matriseRisker}
      valgt={visning.filter.matrise}
      setVisning={setVisning}
      rm={rm}
      tittel={rm === 'R' ? (moderne ? 'Risiko' : 'Risikomatrise') : moderne ? 'Mulighet' : 'Mulighetsmatrise'}
      forstorr={aapneMatrise}
      moderne={moderne}
    />
  ))

  // Samlet: forventet kost og spennet for risiko og mulighet, med matrisene til høyre
  const nokkel = (rm: 'R' | 'M', s: ReturnType<typeof summer>) => {
    const d = gammel ? s.fv - gammel[rm].fv : 0
    const tekst = formatEndring(d)
    const bra = rm === 'M' ? d > 0 : d < 0
    // Samme skala for risiko og mulighet, også når noen tall er negative
    const lo = Math.min(0, r.bc, r.wc, m.bc, m.wc)
    const hi = Math.max(1, r.bc, r.wc, m.bc, m.wc)
    const pst = (x: number) => ((x - lo) / (hi - lo)) * 100 + '%'
    const fra = Math.min(s.bc, s.wc)
    return (
      <div className={'nokkel nokkel-' + rm}>
        <span className="nokkel-tittel">
          <b>
            {s.antall} {rm === 'R' ? (s.antall === 1 ? 'risiko' : 'risikoer') : s.antall === 1 ? 'mulighet' : 'muligheter'}
          </b>{' '}
          · forventet {rm === 'R' ? 'kost' : 'gevinst'} i 1000 kr
        </span>
        <span className="nokkel-fv">
          {formatTall(s.fv)}
          {gammel && tekst && <span className={'delta ' + (bra ? 'bedre' : 'verre')}>{tekst}</span>}
        </span>
        <span className="nokkel-spenn" title={`Best ${formatTall(s.bc)}, mest sannsynlig ${formatTall(s.ml)}, verst ${formatTall(s.wc)}`}>
          {formatTall(s.bc)} – {formatTall(s.wc)}
        </span>
        <span className={'kost-spenn' + (rm === 'M' ? ' m' : '')} aria-hidden>
          <i style={{ left: pst(fra), width: `max(3px, calc(${pst(Math.max(s.bc, s.wc))} - ${pst(fra)}))` }} />
          <b style={{ left: pst(s.fv) }} />
        </span>
      </div>
    )
  }
  if (samlet)
    return (
      <div className="oversikt oversikt-samlet">
        <div className="nokkel-rad">
          {nokkel('R', r)}
          {nokkel('M', m)}
          <label className="liten nokkel-valg">
            <input type="checkbox" checked={visning.kunFiltrerteSummer} onChange={(e) => setVisning((v) => ({ ...v, kunFiltrerteSummer: e.target.checked }))} /> summer bare det
            som vises
          </label>
        </div>
        <div className="nokkel-matriser">{matriser}</div>
      </div>
    )
  if (moderne)
    return (
      <div className="oversikt">
        <div className="kort oversikt-stripe">
          {kost}
          {matriser}
        </div>
      </div>
    )
  return (
    <div className="oversikt">
      {kost}
      {matriser}
    </div>
  )
}

function Matrise({
  risker,
  valgt,
  setVisning,
  rm,
  tittel,
  forstorr,
  moderne,
}: {
  risker: Risk[]
  valgt?: { s: number; k: number }
  setVisning: (f: (v: Visning) => Visning) => void
  rm: 'R' | 'M'
  tittel: string
  forstorr?: (rm: 'R' | 'M') => void
  moderne?: boolean
}) {
  const antall = (s: number, k: number) => risker.filter((r) => r.rm === rm && r.sannsynlighet === s && r.konsekvens === k).length
  return (
    <div className={moderne ? 'oversikt-matrise' : 'kort'}>
      <div className="kort-tittel">
        {forstorr ? (
          <button className="lenkeknapp matrise-tittel" onClick={() => forstorr(rm)} title="Åpne stor matrise der riskene kan flyttes">
            {tittel} <Utvid />
          </button>
        ) : (
          tittel
        )}
        {valgt && (
          <button className="lenkeknapp liten" onClick={() => setVisning((v) => ({ ...v, filter: { ...v.filter, matrise: undefined } }))}>
            fjern filter
          </button>
        )}
      </div>
      <div className="matrise">
        <div className="akse-y">Sannsynlighet</div>
        <div className="ruter">
          {[5, 4, 3, 2, 1].map((s) => (
            <div key={s} className="mrad">
              <span className="mlabel">{s}</span>
              {[1, 2, 3, 4, 5].map((k) => {
                const n = antall(s, k)
                const f = eksponeringFarge(rm, s * k)
                const erValgt = valgt?.s === s && valgt?.k === k
                return (
                  <button
                    key={k}
                    className={'rute ' + (erValgt ? 'valgt' : '') + (n ? '' : ' tom')}
                    style={{ background: f?.bg, color: f?.fg }}
                    title={`Sannsynlighet ${s} × konsekvens ${k} = ${s * k}: ${n} stk. Klikk for å filtrere.`}
                    onClick={() => setVisning((v) => ({ ...v, filter: { ...v.filter, matrise: erValgt ? undefined : { s, k } } }))}
                  >
                    {n || ''}
                  </button>
                )
              })}
            </div>
          ))}
          <div className="mrad">
            <span className="mlabel" />
            {[1, 2, 3, 4, 5].map((k) => (
              <span key={k} className="mlabel x">
                {k}
              </span>
            ))}
          </div>
          <div className="akse-x">Konsekvens</div>
        </div>
      </div>
    </div>
  )
}
