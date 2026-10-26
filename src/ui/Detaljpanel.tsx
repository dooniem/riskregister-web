import { useEffect, useState } from 'react'
import { KOL, formatTall } from '../columns'
import type { Register, Tiltak } from '../model'
import { KONSEKVENS, SANNSYNLIGHET, eksponering, eksponeringFarge, fagFarge, fv, nyttTiltak } from '../model'
import type { Op, RiskFelt, TiltakFelt } from '../ops'
import type { Okt } from '../sync'
import { Laas } from './Ikoner'

interface Props {
  okt: Okt
  doc: Register
  riskId: string
  endre: (...ops: Op[]) => void
  lukk: () => void
  kanSkrive: boolean
}

// Hele risken i et sidepanel. Nyttig for lange tekster og for å se alle tiltak samlet.
export function Detaljpanel({ okt, doc, riskId, endre, lukk, kanSkrive }: Props) {
  const r = doc.risker.find((x) => x.id === riskId)
  const laastAv = r ? okt.laastAv(r.id)?.navn : undefined
  const sperret = !kanSkrive || !!laastAv

  useEffect(() => {
    okt.settPosisjon(riskId, undefined)
    return () => okt.slippLaas()
  }, [okt, riskId])

  if (!r) return null

  const fokus = () => {
    const av = okt.laas(r.id)
    return !av
  }
  const settRisk = (felt: RiskFelt, verdi: unknown) => {
    if (r[felt] !== verdi) endre({ t: 'setRisk', riskId: r.id, felt, verdi, fra: r[felt] })
  }
  const settTiltak = (t: Tiltak, felt: TiltakFelt, verdi: string) => {
    if (t[felt] !== verdi) endre({ t: 'setTiltak', riskId: r.id, tiltakId: t.id, felt, verdi, fra: t[felt] })
  }
  const e = eksponering(r)
  const farge = eksponeringFarge(r.rm, e)

  return (
    <aside className="detaljpanel">
      <header>
        <div>
          <div className="liten">Risk {r.nr}</div>
          <h2>{r.hendelse || 'Uten beskrivelse'}</h2>
        </div>
        <button className="ikonknapp" onClick={lukk} title="Lukk (Esc)">
          ✕
        </button>
      </header>
      {laastAv && (
        <div className="banner laas">
          <Laas /> {laastAv} redigerer denne risken akkurat nå. Feltene låses opp når de er ferdige.
        </div>
      )}
      <div className="skjema">
        <div className="rad4">
          <label className="felt">
            <span>Fag</span>
            <select
              value={r.fag && doc.lister.fag.some((f) => f.id === r.fag) ? r.fag : ''}
              disabled={sperret}
              onChange={(ev) => fokus() && (settRisk('fag', ev.target.value), okt.slippLaas())}
              style={fagStil(doc, r.fag)}
            >
              <option value="">Ingen fag</option>
              {doc.lister.fag.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.navn}
                </option>
              ))}
            </select>
          </label>
          <Valg tittel="R&M" verdi={r.rm} valg={['R', 'M', '-']} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('rm', v)} />
          <Valg tittel="Status risk" verdi={r.status} valg={doc.lister.statusRisk} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('status', v)} />
          <label className="felt">
            <span>Til Skarisk</span>
            <input type="checkbox" checked={r.tilSkarisk} disabled={sperret} onChange={(ev) => fokus() && (settRisk('tilSkarisk', ev.target.checked), okt.slippLaas())} />
          </label>
        </div>
        <Tekst tittel="Årsak – kjente situasjonen hvor risiko/mulighet kan skje" verdi={r.aarsak} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('aarsak', v)} />
        <Tekst tittel="Hendelse som kanskje kan skje" verdi={r.hendelse} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('hendelse', v)} />
        <Tekst tittel="Konsekvenser hvis det skjer" verdi={r.konsekvenser} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('konsekvenser', v)} />
        <div className="rad3">
          <Valg tittel="Risikoeier" verdi={r.eier} valg={KOL.eier.valg!(doc)} fri sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('eier', v)} />
          <Valg tittel="Kategori" verdi={r.kategori} valg={doc.lister.kategorier} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('kategori', v)} />
          <Valg tittel={doc.lister.egendefNavn} verdi={r.egendef} valg={doc.lister.egendef} fri sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('egendef', v)} />
          {doc.lister.egendef2Aktiv && (
            <Valg tittel={doc.lister.egendef2Navn} verdi={r.egendef2 ?? ''} valg={doc.lister.egendef2} fri sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk('egendef2', v)} />
          )}
        </div>
        <div className="rad3">
          <Valg
            tittel="Sannsynlighet"
            verdi={r.sannsynlighet ? SANNSYNLIGHET[r.sannsynlighet - 1] : ''}
            valg={SANNSYNLIGHET}
            sperret={sperret}
            onFokus={fokus}
            onBlur={() => okt.slippLaas()}
            onEndre={(v) => settRisk('sannsynlighet', parseInt(v, 10) || 0)}
          />
          <Valg
            tittel="Konsekvens"
            verdi={r.konsekvens ? KONSEKVENS[r.konsekvens - 1] : ''}
            valg={KONSEKVENS}
            sperret={sperret}
            onFokus={fokus}
            onBlur={() => okt.slippLaas()}
            onEndre={(v) => settRisk('konsekvens', parseInt(v, 10) || 0)}
          />
          <div className="felt">
            <span>Eksponering</span>
            <div className="eksp" style={{ background: farge?.bg, color: farge?.fg }}>
              {e || '-'}
            </div>
          </div>
        </div>
        <div className="rad4">
          {(['bc', 'ml', 'wc'] as const).map((f) => (
            <Tall key={f} tittel={f.toUpperCase()} verdi={r[f]} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settRisk(f, v)} />
          ))}
          <div className="felt">
            <span>FV</span>
            <div className="eksp">{formatTall(fv(r))}</div>
          </div>
        </div>

        <h3>
          Tiltak <span className="liten">({r.tiltak.length})</span>
        </h3>
        {r.tiltak.map((t, i) => (
          <div className="tiltakkort" key={t.id}>
            <div className="tiltak-topp">
              <strong>Tiltak {i + 1}</strong>
              {!sperret && (
                <button className="lenkeknapp fare" onClick={() => fokus() && (endre({ t: 'deleteTiltak', riskId: r.id, tiltakId: t.id }), okt.slippLaas())}>
                  Slett
                </button>
              )}
            </div>
            <Tekst tittel="Tiltak" verdi={t.tekst} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settTiltak(t, 'tekst', v)} />
            <div className="rad3">
              <Valg tittel="Tiltakseier" verdi={t.eier} valg={KOL.eier.valg!(doc)} fri sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settTiltak(t, 'eier', v)} />
              <label className="felt">
                <span>Frist</span>
                <input type="date" value={t.frist} disabled={sperret} onFocus={fokus} onBlur={() => okt.slippLaas()} onChange={(ev) => settTiltak(t, 'frist', ev.target.value)} />
              </label>
              <Valg tittel="Status" verdi={t.status} valg={doc.lister.statusTiltak} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settTiltak(t, 'status', v)} />
            </div>
            <Tekst tittel="Statusbeskrivelse" verdi={t.beskrivelse} sperret={sperret} onFokus={fokus} onBlur={() => okt.slippLaas()} onEndre={(v) => settTiltak(t, 'beskrivelse', v)} />
          </div>
        ))}
        {!sperret && (
          <button className="knapp" onClick={() => fokus() && (endre({ t: 'addTiltak', riskId: r.id, tiltak: nyttTiltak() }), okt.slippLaas())}>
            + Nytt tiltak
          </button>
        )}
        {r.endretAv && (
          <p className="liten metadata">
            Sist endret av {r.endretAv}, {r.endret ? new Date(r.endret).toLocaleString('nb-NO') : ''}
          </p>
        )}
      </div>
    </aside>
  )
}

interface FeltProps<T> {
  tittel: string
  verdi: T
  sperret: boolean
  onFokus: () => boolean
  onBlur: () => void
  onEndre: (v: T) => void
}

function Tekst({ tittel, verdi, sperret, onFokus, onBlur, onEndre }: FeltProps<string>) {
  const [lokal, setLokal] = useState(verdi)
  const [aktiv, setAktiv] = useState(false)
  useEffect(() => {
    if (!aktiv) setLokal(verdi)
  }, [verdi, aktiv])
  return (
    <label className="felt">
      <span>{tittel}</span>
      <textarea
        value={lokal}
        disabled={sperret}
        rows={Math.min(8, Math.max(2, lokal.split('\n').length + Math.floor(lokal.length / 60)))}
        onFocus={(e) => (onFokus() ? setAktiv(true) : e.currentTarget.blur())}
        onChange={(e) => setLokal(e.target.value)}
        onBlur={() => {
          setAktiv(false)
          onEndre(lokal)
          onBlur()
        }}
      />
    </label>
  )
}

function Tall({ tittel, verdi, sperret, onFokus, onBlur, onEndre }: FeltProps<number>) {
  const [lokal, setLokal] = useState(String(verdi || ''))
  useEffect(() => setLokal(String(verdi || '')), [verdi])
  return (
    <label className="felt">
      <span>{tittel}</span>
      <input
        inputMode="decimal"
        value={lokal}
        disabled={sperret}
        onFocus={(e) => !onFokus() && e.currentTarget.blur()}
        onChange={(e) => setLokal(e.target.value)}
        onBlur={() => {
          onEndre(Number(lokal.replace(/\s/g, '').replace(',', '.')) || 0)
          onBlur()
        }}
      />
    </label>
  )
}

function Valg({ tittel, verdi, valg, fri, sperret, onFokus, onBlur, onEndre }: FeltProps<string> & { valg: string[]; fri?: boolean }) {
  const id = 'dl-' + tittel.replace(/\W/g, '')
  if (fri)
    return (
      <label className="felt">
        <span>{tittel}</span>
        <FriValg id={id} verdi={verdi} valg={valg} sperret={sperret} onFokus={onFokus} onBlur={onBlur} onEndre={onEndre} />
      </label>
    )
  return (
    <label className="felt">
      <span>{tittel}</span>
      <select
        value={verdi}
        disabled={sperret}
        onFocus={(e) => !onFokus() && e.currentTarget.blur()}
        onBlur={onBlur}
        onChange={(e) => onEndre(e.target.value)}
      >
        <option value="">-</option>
        {valg.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
        {verdi && !valg.includes(verdi) && <option value={verdi}>{verdi}</option>}
      </select>
    </label>
  )
}

function FriValg({ id, verdi, valg, sperret, onFokus, onBlur, onEndre }: Omit<FeltProps<string>, 'tittel'> & { id: string; valg: string[] }) {
  const [lokal, setLokal] = useState(verdi)
  useEffect(() => setLokal(verdi), [verdi])
  return (
    <>
      <input
        list={id}
        value={lokal}
        disabled={sperret}
        onFocus={(e) => !onFokus() && e.currentTarget.blur()}
        onChange={(e) => setLokal(e.target.value)}
        onBlur={() => {
          onEndre(lokal)
          onBlur()
        }}
      />
      <datalist id={id}>
        {valg.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  )
}

// Fag-feltet får fagets farge som en stripe til venstre
function fagStil(doc: Register, id?: string): React.CSSProperties | undefined {
  const f = doc.lister.fag.find((x) => x.id === id)
  return f ? { boxShadow: `inset 4px 0 0 ${fagFarge(f).bg}` } : undefined
}
