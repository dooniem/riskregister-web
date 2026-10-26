import { useEffect, useState } from 'react'
import type { Lister, Prosjekt, Register } from '../model'
import { uid } from '../model'
import type { Op } from '../ops'

type Fane = 'prosjekt' | 'deltakere' | 'lister'

interface Props {
  doc: Register
  endre: (...ops: Op[]) => void
  lukk: () => void
  kanSkrive: boolean
  start?: Fane
}

// Tilsvarer arkfanene «Deltagere» og «data» i Excel-filen
export function Prosjektpanel({ doc, endre, lukk, kanSkrive, start = 'prosjekt' }: Props) {
  const [fane, setFane] = useState<Fane>(start)
  return (
    <div className="modal-bakgrunn" onMouseDown={(e) => e.target === e.currentTarget && lukk()}>
      <div className="modal bred">
        <header>
          <h2>Prosjekt</h2>
          <button className="ikonknapp" onClick={lukk}>
            ✕
          </button>
        </header>
        <nav className="faner">
          {(
            [
              ['prosjekt', 'Prosjektinfo'],
              ['deltakere', `Deltakere (${doc.deltakere.length})`],
              ['lister', 'Lister og valg'],
            ] as const
          ).map(([k, t]) => (
            <button key={k} className={fane === k ? 'valgt' : ''} onClick={() => setFane(k)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="modal-innhold">
          {fane === 'prosjekt' && <ProsjektInfo doc={doc} endre={endre} kanSkrive={kanSkrive} />}
          {fane === 'deltakere' && <Deltakere doc={doc} endre={endre} kanSkrive={kanSkrive} />}
          {fane === 'lister' && <ListerRed doc={doc} endre={endre} kanSkrive={kanSkrive} />}
        </div>
      </div>
    </div>
  )
}

function Inn({ verdi, onLagre, disabled, ...rest }: { verdi: string; onLagre: (v: string) => void; disabled?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [v, setV] = useState(verdi)
  useEffect(() => setV(verdi), [verdi])
  return <input {...rest} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== verdi && onLagre(v)} />
}

function ProsjektInfo({ doc, endre, kanSkrive }: { doc: Register; endre: Props['endre']; kanSkrive: boolean }) {
  const felt: [keyof Prosjekt, string, string[]?][] = [
    ['nummer', 'Prosjektnummer'],
    ['navn', 'Prosjektnavn'],
    ['eier', 'Prosjekteier'],
    ['sjef', 'Prosjektsjef'],
    ['leder', 'Prosjektleder'],
    ['fase', 'Prosjektfase', doc.lister.faser],
    ['virksomhet', 'Virksomhetsområde', doc.lister.virksomhet],
  ]
  return (
    <div className="skjema">
      {felt.map(([k, t, liste]) => (
        <label className="felt" key={k}>
          <span>{t}</span>
          {liste ? (
            <select value={doc.prosjekt[k]} disabled={!kanSkrive} onChange={(e) => endre({ t: 'setProsjekt', felt: k, verdi: e.target.value })}>
              <option value="">-</option>
              {liste.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : (
            <Inn verdi={doc.prosjekt[k]} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'setProsjekt', felt: k, verdi: v })} />
          )}
        </label>
      ))}
      <label className="felt">
        <span>Notering</span>
        <NoteringFelt verdi={doc.prosjekt.notering} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'setProsjekt', felt: 'notering', verdi: v })} />
      </label>
    </div>
  )
}

function NoteringFelt({ verdi, onLagre, disabled }: { verdi: string; onLagre: (v: string) => void; disabled: boolean }) {
  const [v, setV] = useState(verdi)
  useEffect(() => setV(verdi), [verdi])
  return <textarea rows={4} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== verdi && onLagre(v)} />
}

function Deltakere({ doc, endre, kanSkrive }: { doc: Register; endre: Props['endre']; kanSkrive: boolean }) {
  return (
    <>
      <h3>Interessenter og deltakere</h3>
      <table className="enkel-tabell">
        <thead>
          <tr>
            <th>#</th>
            <th>Initialer</th>
            <th>Navn</th>
            <th>Rolle i prosjektet</th>
            <th>Rolle i riskgjennomgang</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doc.deltakere.map((d, i) => (
            <tr key={d.id}>
              <td>{i + 1}</td>
              <td>
                <Inn verdi={d.initialer} disabled={!kanSkrive} size={5} onLagre={(v) => endre({ t: 'upsertDeltaker', deltaker: { ...d, initialer: v } })} />
              </td>
              <td>
                <Inn verdi={d.navn} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'upsertDeltaker', deltaker: { ...d, navn: v } })} />
              </td>
              <td>
                <select value={d.rolleProsjekt} disabled={!kanSkrive} onChange={(e) => endre({ t: 'upsertDeltaker', deltaker: { ...d, rolleProsjekt: e.target.value } })}>
                  <option value="">-</option>
                  {doc.lister.rollerProsjekt.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </td>
              <td>
                <select value={d.rolleRisk} disabled={!kanSkrive} onChange={(e) => endre({ t: 'upsertDeltaker', deltaker: { ...d, rolleRisk: e.target.value } })}>
                  <option value="">-</option>
                  {doc.lister.rollerRisk.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </td>
              <td>
                {kanSkrive && (
                  <button className="lenkeknapp fare" onClick={() => endre({ t: 'deleteDeltaker', id: d.id })}>
                    Fjern
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {kanSkrive && (
        <button className="knapp" onClick={() => endre({ t: 'upsertDeltaker', deltaker: { id: uid(), initialer: '', navn: '', rolleProsjekt: '', rolleRisk: '' } })}>
          + Legg til deltaker
        </button>
      )}
      <p className="liten">Navnene her brukes i nedtrekkslistene for risikoeier og tiltakseier.</p>

      <h3>Historikk riskgjennomgang</h3>
      <table className="enkel-tabell">
        <thead>
          <tr>
            <th>Dato</th>
            <th>Signatur for deltakere</th>
            <th>Fasilitator</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doc.gjennomganger.map((g) => (
            <tr key={g.id}>
              <td>
                <input type="date" value={g.dato} disabled={!kanSkrive} onChange={(e) => endre({ t: 'upsertGjennomgang', gjennomgang: { ...g, dato: e.target.value } })} />
              </td>
              <td>
                <Inn verdi={g.signatur} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'upsertGjennomgang', gjennomgang: { ...g, signatur: v } })} />
              </td>
              <td>
                <Inn verdi={g.fasilitator} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'upsertGjennomgang', gjennomgang: { ...g, fasilitator: v } })} />
              </td>
              <td>
                {kanSkrive && (
                  <button className="lenkeknapp fare" onClick={() => endre({ t: 'deleteGjennomgang', id: g.id })}>
                    Fjern
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {kanSkrive && (
        <button
          className="knapp"
          onClick={() => endre({ t: 'upsertGjennomgang', gjennomgang: { id: uid(), dato: new Date().toISOString().slice(0, 10), signatur: '', fasilitator: '' } })}
        >
          + Ny gjennomgang
        </button>
      )}
    </>
  )
}

const LISTE_TITLER: [keyof Lister, string][] = [
  ['kategorier', 'Kategorier'],
  ['egendef', 'Egendefinert kolonne'],
  ['egendef2', 'Egendefinert kolonne 2'],
  ['statusTiltak', 'Status tiltak'],
  ['statusRisk', 'Status risk'],
  ['rollerProsjekt', 'Rolle i prosjektet'],
  ['rollerRisk', 'Rolle i riskgjennomgang'],
  ['faser', 'Prosjektfase'],
  ['virksomhet', 'Virksomhetsområde'],
]

function ListerRed({ doc, endre, kanSkrive }: { doc: Register; endre: Props['endre']; kanSkrive: boolean }) {
  return (
    <div className="lister">
      <label className="felt">
        <span>Navn på den egendefinerte kolonnen</span>
        <Inn verdi={doc.lister.egendefNavn} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'setListe', key: 'egendefNavn', verdi: v })} />
      </label>
      <label className="avkrysning">
        <input type="checkbox" checked={doc.lister.egendef2Aktiv} disabled={!kanSkrive} onChange={(e) => endre({ t: 'setListe', key: 'egendef2Aktiv', verdi: e.target.checked })} />
        Bruk en egendefinert kolonne nr. 2
      </label>
      {doc.lister.egendef2Aktiv && (
        <label className="felt">
          <span>Navn på egendefinert kolonne nr. 2</span>
          <Inn verdi={doc.lister.egendef2Navn} disabled={!kanSkrive} onLagre={(v) => endre({ t: 'setListe', key: 'egendef2Navn', verdi: v })} />
        </label>
      )}
      <div className="liste-rutenett">
        {LISTE_TITLER.filter(([k]) => k !== 'egendef2' || doc.lister.egendef2Aktiv).map(([k, t]) => (
          <ListeBoks key={k} tittel={k === 'egendef' ? doc.lister.egendefNavn : k === 'egendef2' ? doc.lister.egendef2Navn : t} verdier={doc.lister[k] as string[]} laast={k === 'statusRisk' || !kanSkrive} onLagre={(v) => endre({ t: 'setListe', key: k, verdi: v })} />
        ))}
      </div>
      <p className="liten">«Status risk» er låst fordi «Lukket» styrer hvilke risker som vises under Åpne og Lukkede.</p>
    </div>
  )
}

function ListeBoks({ tittel, verdier, laast, onLagre }: { tittel: string; verdier: string[]; laast: boolean; onLagre: (v: string[]) => void }) {
  const [tekst, setTekst] = useState(verdier.join('\n'))
  useEffect(() => setTekst(verdier.join('\n')), [verdier])
  return (
    <label className="felt">
      <span>{tittel}</span>
      <textarea
        rows={8}
        value={tekst}
        disabled={laast}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={() => {
          const ny = tekst.split('\n').map((s) => s.trim()).filter(Boolean)
          if (ny.join('\n') !== verdier.join('\n')) onLagre(ny)
        }}
      />
      <small>Ett valg per linje</small>
    </label>
  )
}
