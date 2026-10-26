import { useMemo } from 'react'
import { formatDato, formatTall } from '../columns'
import type { Register } from '../model'
import { eksponering, eksponeringFarge, fv } from '../model'
import type { Tilstede } from '../store/backend'
import type { Okt } from '../sync'
import type { Visning } from '../view'
import { filtrer, grupper, sorter } from '../view'
import { Laas } from './Ikoner'

// Mobilvisning: ett kort per risk. Trykk åpner risken i panelet, der alt kan redigeres.
export function Kortliste({ okt, doc, andre, visning, aapne }: { okt: Okt; doc: Register; andre: Tilstede[]; visning: Visning; aapne: (id: string) => void }) {
  const grupperte = useMemo(() => grupper(doc, sorter(filtrer(doc, visning), visning.sortering), visning.gruppering), [doc, visning])
  const idag = new Date().toISOString().slice(0, 10)
  return (
    <div className="kortliste">
      {grupperte.map((g) => (
        <section key={g.navn || '_'}>
          {g.navn && (
            <h3 className="kort-gruppe">
              {g.navn} <span className="liten">({g.risker.length})</span>
            </h3>
          )}
          {g.risker.map((r) => {
            const e = eksponering(r)
            const f = eksponeringFarge(r.rm, e)
            const her = andre.filter((t) => t.riskId === r.id)
            const laast = okt.laastAv(r.id)
            const aapneTiltak = r.tiltak.filter((t) => t.tekst && t.status !== 'Utført' && t.status !== 'Utføres ikke')
            const forfalt = aapneTiltak.some((t) => t.frist && t.frist < idag)
            return (
              <button key={r.id} className={'riskkort' + (laast ? ' laast' : '')} onClick={() => aapne(r.id)} style={her[0] ? { borderLeftColor: her[0].farge } : undefined}>
                <div className="riskkort-topp">
                  <span className="nr">{r.nr}</span>
                  <span className={'rm rm-' + r.rm}>{r.rm === '-' ? '' : r.rm}</span>
                  <span className="eksp-merke" style={{ background: f?.bg, color: f?.fg }} title="Eksponering">
                    {e || '–'}
                  </span>
                  <span className="fv">FV {formatTall(fv(r))}</span>
                </div>
                <div className="riskkort-tittel">{r.hendelse || <em>Uten beskrivelse</em>}</div>
                {r.aarsak && <div className="riskkort-tekst">{r.aarsak}</div>}
                <div className="riskkort-bunn">
                  <span>{r.eier || 'Ingen eier'}</span>
                  {r.kategori && <span>· {r.kategori}</span>}
                  <span className={forfalt ? 'forfalt' : ''}>
                    · {aapneTiltak.length} åpne tiltak
                    {forfalt && ' (forfalt)'}
                  </span>
                </div>
                {aapneTiltak.slice(0, 2).map((t) => (
                  <div key={t.id} className="riskkort-tiltak">
                    {t.tekst}
                    <span className="liten">
                      {' '}
                      {[t.eier, formatDato(t.frist), t.status].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))}
                {(laast || her.length > 0) && (
                  <div className="riskkort-tilstede">
                    {laast ? (
                      <span className="laas-merke" style={{ background: laast.farge }}>
                        <Laas /> {laast.navn} skriver
                      </span>
                    ) : (
                      her.map((t) => (
                        <span key={t.brukerId} className="navnemerke" style={{ background: t.farge }}>
                          {t.navn}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
