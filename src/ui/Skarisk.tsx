import { formatTall } from '../columns'
import type { Register } from '../model'
import { skariskRader } from '../excel'

// Tilsvarer arkfanen «Poster til Skarisk»: åpne risker merket «Til Skarisk», sortert på nummer
export function SkariskVisning({ doc, aapneDetalj, melding }: { doc: Register; aapneDetalj: (id: string) => void; melding: (t: string) => void }) {
  const risker = doc.risker.filter((r) => r.tilSkarisk && r.status !== 'Lukket').sort((a, b) => a.nr - b.nr)
  const kopier = () => {
    const tsv = skariskRader(doc)
      .map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t'))
      .join('\n')
    navigator.clipboard.writeText(tsv).then(
      () => melding(`${risker.length} poster kopiert. Lim dem inn i Skarisk eller Excel.`),
      () => melding('Fikk ikke tilgang til utklippstavlen i denne nettleseren.'),
    )
  }
  return (
    <div className="skarisk-flate">
      <div className="skarisk-topp">
        <div>
          <h2>Poster til Skarisk</h2>
          <p className="liten">Åpne risker der «Til Skarisk» er krysset av. Listen oppdateres når noen endrer registeret. Trykk på en rad for å åpne risken.</p>
        </div>
        <button className="knapp primær" onClick={kopier} disabled={!risker.length}>
          Kopier til utklippstavlen
        </button>
      </div>
      <div className="grid-boks">
        <table className="grid skarisk">
          <colgroup>
            <col style={{ width: 56 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 380 }} />
            <col style={{ width: 440 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr className="gruppe-rad">
              <th colSpan={4} />
              <th colSpan={3}>Mulig kost (i 1000)</th>
            </tr>
            <tr className="kol-rad">
              <th className="hoyre">Nr.</th>
              <th>R&M</th>
              <th>
                Årsak
                <div className="undertekst">Den kjente situasjonen hvor risiko/muligheter kan skje</div>
              </th>
              <th>
                Hendelse
                <div className="undertekst">Det som kanskje kan skje, risiko/mulighet</div>
              </th>
              <th className="hoyre">BC</th>
              <th className="hoyre">ML</th>
              <th className="hoyre">WC</th>
            </tr>
          </thead>
          <tbody>
            {risker.map((r) => (
              <tr key={r.id} className="klikkbar" onClick={() => aapneDetalj(r.id)}>
                <td className="hoyre">{r.nr}</td>
                <td className={'rm-' + r.rm}>{r.rm === '-' ? '' : r.rm}</td>
                <td className="langtekst">{r.aarsak}</td>
                <td className="langtekst">
                  <span className="id-merke">[ID:{r.nr}]</span> {r.hendelse}
                </td>
                <td className="hoyre">{formatTall(r.bc)}</td>
                <td className="hoyre">{formatTall(r.ml)}</td>
                <td className="hoyre">{formatTall(r.wc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!risker.length && (
          <div className="tomt">Ingen åpne risker er merket «Til Skarisk». Kryss av i kolonnen «Til Skarisk» i registeret for å ta dem med her.</div>
        )}
      </div>
    </div>
  )
}
