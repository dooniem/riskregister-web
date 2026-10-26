import { formatTall } from '../columns'
import type { Register, Risk } from '../model'
import { eksponeringFarge } from '../model'
import type { Visning } from '../view'
import { filtrer, iFane, summer } from '../view'

// Summer for risiko og mulighet (som M:/R:-radene øverst i Excel) og en klikkbar risikomatrise
export function Oversikt({ doc, visning, setVisning }: { doc: Register; visning: Visning; setVisning: (f: (v: Visning) => Visning) => void }) {
  const filtrerte = filtrer(doc, visning)
  const grunnlag: Risk[] = visning.kunFiltrerteSummer ? filtrerte : doc.risker.filter((r) => iFane(r, visning.fane))
  const r = summer(grunnlag, 'R')
  const m = summer(grunnlag, 'M')
  const matriseRisker = filtrer(doc, { ...visning, filter: { ...visning.filter, matrise: undefined } })

  const rad = (navn: string, s: ReturnType<typeof summer>, kl: string) => (
    <tr className={kl}>
      <th>{navn}</th>
      <td>{s.antall}</td>
      <td>{formatTall(s.bc)}</td>
      <td>{formatTall(s.ml)}</td>
      <td>{formatTall(s.wc)}</td>
      <td className="fv">{formatTall(s.fv)}</td>
    </tr>
  )

  return (
    <div className="oversikt">
      <div className="kort">
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
              <th>BC</th>
              <th>ML</th>
              <th>WC</th>
              <th>FV</th>
            </tr>
          </thead>
          <tbody>
            {rad('Risiko (R)', r, 'rm-R')}
            {rad('Mulighet (M)', m, 'rm-M')}
          </tbody>
        </table>
      </div>
      <Matrise risker={matriseRisker} valgt={visning.filter.matrise} setVisning={setVisning} rm="R" tittel="Risikomatrise" />
      <Matrise risker={matriseRisker} valgt={visning.filter.matrise} setVisning={setVisning} rm="M" tittel="Mulighetsmatrise" />
    </div>
  )
}

function Matrise({
  risker,
  valgt,
  setVisning,
  rm,
  tittel,
}: {
  risker: Risk[]
  valgt?: { s: number; k: number }
  setVisning: (f: (v: Visning) => Visning) => void
  rm: 'R' | 'M'
  tittel: string
}) {
  const antall = (s: number, k: number) => risker.filter((r) => r.rm === rm && r.sannsynlighet === s && r.konsekvens === k).length
  return (
    <div className="kort">
      <div className="kort-tittel">
        {tittel}
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
