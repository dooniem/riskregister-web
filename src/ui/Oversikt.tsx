import { formatEndring, formatTall } from '../columns'
import type { Register, Risk } from '../model'
import { eksponeringFarge } from '../model'
import type { Visning } from '../view'
import { filtrer, iFane, summer } from '../view'

interface Props {
  doc: Register
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  mot?: Register // snapshot det sammenlignes med
  aapneMatrise?: (rm: 'R' | 'M') => void
  moderne?: boolean // alt i ett lavt kort, så tabellen får mer plass
}

// Summer for risiko og mulighet (som M:/R:-radene øverst i Excel) og en klikkbar risikomatrise
export function Oversikt({ doc, visning, setVisning, mot, aapneMatrise, moderne }: Props) {
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
            {tittel} ⤢
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
