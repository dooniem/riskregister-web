import { useEffect, useMemo, useState } from 'react'
import type { Register } from '../model'
import { hvileStatus } from '../model'
import type { Op } from '../ops'
import type { Snapshots } from '../store/backend'
import { FaseVelger } from './FaseVelger'
import { Modal, ModalTittel } from './Modal'

interface Props {
  doc: Register
  snapshots?: Snapshots
  endre: (...ops: Op[]) => void
  lukk: () => void
  melding: (tekst: string) => void
}

const STEG = ['Milepæl-snapshot', 'Ny fase']
const iDag = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD i lokal tid

// Mer › Bytt fase: tar et milepæl-snapshot av registeret slik det er nå, og setter ny fase. Riskene er gjennomgått i
// riskmøtene før fasebyttet, så de åpne riskene blir stående som de er. Hvile settes i registeret (høyreklikk › Hvil risken…).
// Byttet lagres i fasehistorikken, så appen vet hvilken fase hver risk ble opprettet og lukket i.
export function ByttFaseDialog({ doc, snapshots, endre, lukk, melding }: Props) {
  const gammel = doc.prosjekt.fase
  const [steg, setSteg] = useState(0)
  const [taSnapshot, setTaSnapshot] = useState(!!snapshots)
  const [navn, setNavn] = useState(`Sluttstatus ${gammel || 'før fasebytte'}`)
  const [tar, setTar] = useState<{ ferdig: number; totalt: number } | null>(null)
  const [snapshotId, setSnapshotId] = useState<string>()
  const [feil, setFeil] = useState('')

  const aapne = useMemo(() => doc.risker.filter((r) => r.status !== 'Lukket').sort((a, b) => a.nr - b.nr), [doc.risker])

  // Neste fase i listen foreslås, ellers den første som ikke er den gamle
  const faser = doc.lister.faser
  const [fase, setFase] = useState(() => faser[faser.indexOf(gammel) + 1] ?? faser.find((f) => f !== gammel) ?? '')
  const [dato, setDato] = useState(iDag)
  const ny = !!fase.trim() && !faser.includes(fase.trim())
  // Risker som hviler til fasen det byttes til
  const vaakner = aapne.filter((r) => hvileStatus(doc, r) === 'hviler' && !!fase.trim() && doc.hviler?.[r.id]?.fase === fase.trim())

  // Advarer hvis fanen lukkes mens snapshotet lagres
  useEffect(() => {
    if (!tar) return
    const f = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [tar])

  const taSnapshotOgFortsett = async () => {
    if (!snapshots || !taSnapshot || snapshotId) return setSteg(1)
    setFeil('')
    setTar({ ferdig: 0, totalt: doc.risker.length })
    try {
      const s = await snapshots.ta(navn.trim() || `Sluttstatus ${gammel}`, `Tatt ved fasebytte${gammel ? ` fra ${gammel}` : ''}`, doc, (ferdig, totalt) => setTar({ ferdig, totalt }))
      endre({ t: 'setMilepael', snapshotId: s.id, paa: true })
      setSnapshotId(s.id)
      setSteg(1)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setTar(null)
    }
  }

  const fullfor = () => {
    if (!fase.trim()) return setFeil('Velg den nye fasen eller skriv et navn.')
    if (fase.trim() === gammel) return setFeil(`Prosjektet er allerede i fasen «${gammel}».`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return setFeil('Velg datoen den nye fasen gjelder fra.')
    endre(
      // Et eget fasenavn legges til i fase-listen, så det kan velges i prosjektinfo og ved neste bytte
      ...(ny ? [{ t: 'setListe', key: 'faser', verdi: [...faser, fase.trim()] } as Op] : []),
      { t: 'byttFase', fase: fase.trim(), dato, snapshotId },
    )
    melding(
      `Prosjektet er nå i fasen «${fase.trim()}».${vaakner.length ? ` ${vaakner.length} ${vaakner.length === 1 ? 'risk' : 'risker'} våknet.` : ''}`,
    )
    lukk()
  }

  return (
    <Modal className="bred fasebytte" lukk={tar ? undefined : lukk}>
      <header>
        <ModalTittel>Bytt fase{gammel ? ` fra ${gammel}` : ''}</ModalTittel>
        <button className="ikonknapp" onClick={lukk} disabled={!!tar} aria-label="Lukk" title={tar ? 'Vent til snapshotet er lagret' : 'Lukk'}>
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <ol className="fasebytte-steg">
          {STEG.map((t, i) => (
            <li key={t} className={i === steg ? 'aktiv' : i < steg ? 'ferdig' : ''} aria-current={i === steg ? 'step' : undefined}>
              <span className="steg-nr">{i < steg ? '✓' : i + 1}</span> {t}
            </li>
          ))}
        </ol>

        {steg === 0 && (
          <div className="skjema">
            {/* Fasebyttet lagres med dato og styrer «Lukket i … · fase» og risker som hviler til en fase, så det skal ikke brukes til å rette en feil */}
            <div className="fasebytte-merknad liten">
              <p>
                <b>Bytt fase</b> er for når prosjektet går over i neste fase, etter at riskene er gjennomgått i riskmøtene. De åpne riskene blir stående som de er. Byttet lagres med dato, og brukes til å vise hvilken fase risker ble lukket i og til å vekke risker
                som hviler til en fase.
              </p>
              <p>
                <b>Står det feil fase?</b> Rett den under Prosjekt og deltakere › Prosjektfase. Da endres fasen uten at det lagres som et fasebytte.
              </p>
              <p>
                <b>Milepæl uten fasebytte,</b> for eksempel for hvert tilbud som leveres: ta et snapshot under Mer › Snapshots og sammenligning og merk det som milepæl.
              </p>
            </div>
            <p>
              Ta et snapshot av registeret slik det står ved slutten av fasen. Det merkes som milepæl, så det står øverst i snapshotlisten og kan brukes til å se hva som har
              skjedd i den nye fasen.
            </p>
            {snapshots ? (
              <>
                <label className="avkrysning">
                  <input type="checkbox" checked={taSnapshot} disabled={!!tar} onChange={(e) => setTaSnapshot(e.target.checked)} />
                  Ta milepæl-snapshot
                </label>
                {taSnapshot && (
                  <label className="felt">
                    <span>Navn på snapshotet</span>
                    <input value={navn} disabled={!!tar} onChange={(e) => setNavn(e.target.value)} />
                  </label>
                )}
              </>
            ) : (
              <p className="liten">Snapshots er ikke tilgjengelig for dette registeret, så fasen byttes uten snapshot.</p>
            )}
            {tar && (
              <div className="snapshot-fremdrift" role="status" aria-live="polite">
                <div className="liten">{tar.ferdig >= tar.totalt ? 'Gjør ferdig snapshotet…' : `Lagrer riskene … ${tar.ferdig} av ${tar.totalt}`}</div>
                <progress max={tar.totalt + 1} value={tar.ferdig >= tar.totalt ? tar.totalt + 1 : tar.ferdig} aria-label="Fremdrift" />
              </div>
            )}
          </div>
        )}

        {steg === 1 && (
          <div className="skjema">
            <label className="felt">
              <span>Ny fase</span>
              {/* Fasene kommer fra fase-listen under Lister og valg, men fasen kan også få et eget navn */}
              <FaseVelger faser={faser.filter((f) => f !== gammel)} verdi={fase} sett={setFase} etikett="Ny fase" egetHint="Skriv navnet på fasen" />
              <span className="liten">
                {ny
                  ? `«${fase.trim()}» er et nytt navn. Det legges til i fase-listen (Prosjekt › Lister og valg) når du bytter fase.`
                  : 'Velg en fase fra listen, eller velg «Eget navn…». Et nytt navn legges til i fase-listen når du bytter fase.'}
              </span>
            </label>
            <label className="felt">
              <span>Gjelder fra</span>
              <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} style={{ maxWidth: 200 }} />
            </label>
            <div className="fasebytte-oppsummering">
              <b>Dette skjer når du bytter fase:</b>
              <ul>
                {snapshotId && <li>Milepælen «{navn.trim()}» er lagret.</li>}
                <li>
                  De {aapne.length} åpne riskene blir stående som de er.
                </li>
                {vaakner.length > 0 && (
                  <li>
                    {vaakner.length} {vaakner.length === 1 ? 'risk' : 'risker'} som hviler til «{fase.trim()}», våkner og kommer tilbake under Åpne.
                  </li>
                )}
                <li>
                  Fasen i prosjektinfo endres {gammel ? `fra «${gammel}» ` : ''}til «{fase || '…'}».
                </li>
              </ul>
            </div>
          </div>
        )}

        {feil && <div className="banner feil">{feil}</div>}
        <div className="knapperad">
          {steg > 0 && (
            <button className="knapp" onClick={() => (setFeil(''), setSteg(steg - 1))}>
              Tilbake
            </button>
          )}
          {steg === 0 && (
            <button className="knapp primær" disabled={!!tar} onClick={() => void taSnapshotOgFortsett()}>
              {snapshots && taSnapshot && !snapshotId ? (tar ? 'Tar snapshot…' : 'Ta snapshot og gå videre') : 'Gå videre'}
            </button>
          )}
          {steg === 1 && (
            <button className="knapp primær" onClick={fullfor}>
              Bytt fase
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
