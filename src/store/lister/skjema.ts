// Hvordan registeret ligger i SharePoint-lister. Ett register per SharePoint-område, fordelt på disse listene.
// All kobling mellom appens datamodell og kolonnene i SharePoint er samlet her, slik at det er enkelt å
// tilpasse til et annet listeoppsett (f.eks. det piloten i organisasjonen bruker).
//
// Kolonnene er bevisst enkle (tekst, tall og ja/nei), slik at dataene er lette å lese direkte i SharePoint
// og å hente ut til et datavarehus. Datoer lagres som tekst på formen ÅÅÅÅ-MM-DD eller ISO-tid.
import type { Register, Risk, Tiltak } from '../../model'
import { DEFAULT_LISTER, migrer, SCHEMA_VERSION, uid } from '../../model'

export type ListeNavn = 'risker' | 'tiltak' | 'innstillinger' | 'tilstede' | 'snapshots' | 'snapshotdata'

export type Kolonnetype = 'tekst' | 'langtekst' | 'tall' | 'janei'

export interface Kolonne {
  navn: string // internt navn i SharePoint
  type: Kolonnetype
  indeksert?: boolean // kolonner det filtreres på
}

export interface ListeDef {
  visningsnavn: string // navnet listen får i SharePoint
  tidligereNavn?: string[] // navn listen hadde i tidligere versjoner, slik at eldre registre fortsatt åpnes
  beskrivelse: string
  kolonner: Kolonne[]
}

const t = (navn: string): Kolonne => ({ navn, type: 'tekst' })
const lt = (navn: string): Kolonne => ({ navn, type: 'langtekst' })
const n = (navn: string): Kolonne => ({ navn, type: 'tall' })
const jn = (navn: string): Kolonne => ({ navn, type: 'janei' })
const idx = (k: Kolonne): Kolonne => ({ ...k, indeksert: true })

// Kolonnene for en risk. Brukes både i listen med risker og i snapshotdata.
const RISK_KOLONNER: Kolonne[] = [
  idx(t('RiskId')),
  n('Nr'),
  t('RM'),
  lt('Aarsak'),
  lt('Hendelse'),
  lt('Konsekvenser'),
  t('Eier'),
  t('Status'),
  t('Kategori'),
  t('Egendef'),
  t('Egendef2'),
  t('FagId'),
  n('Sannsynlighet'),
  n('Konsekvens'),
  n('BC'),
  n('ML'),
  n('WC'),
  jn('TilSkarisk'),
  lt('Kilde'),
  t('EndretTid'),
  t('EndretAv'),
  t('OpprettetTid'),
  t('OpprettetAv'),
  t('LukketTid'),
  t('LukketAv'),
]

export const LISTER: Record<ListeNavn, ListeDef> = {
  risker: {
    visningsnavn: 'Riskregister Risker',
    beskrivelse: 'Én rad per risk. Tiltakene ligger i Riskregister Tiltak.',
    kolonner: RISK_KOLONNER,
  },
  tiltak: {
    visningsnavn: 'Riskregister Tiltak',
    beskrivelse: 'Én rad per tiltak. RiskId peker på risken i Riskregister Risker.',
    kolonner: [idx(t('RiskId')), t('TiltakId'), n('Rekkefolge'), lt('Tekst'), t('Eier'), t('Frist'), lt('Beskrivelse'), t('Status')],
  },
  innstillinger: {
    visningsnavn: 'Riskregister Klientinnstillinger',
    tidligereNavn: ['Riskregister Innstillinger'],
    beskrivelse: 'Riskregister-appens innstillinger: prosjektinfo, deltakere, gjennomganger og nedtrekkslister. Én rad per nøkkel, verdien er JSON.',
    kolonner: [lt('Verdi')],
  },
  tilstede: {
    visningsnavn: 'Riskregister Klienttilstede',
    tidligereNavn: ['Riskregister Tilstede'],
    beskrivelse: 'Riskregister-appen: hvem som har registeret åpent nå, og hvilken risk de redigerer. Radene slettes når brukeren lukker appen.',
    kolonner: [lt('Data')],
  },
  snapshots: {
    visningsnavn: 'Riskregister Snapshots',
    beskrivelse: 'Én rad per snapshot (lagret utgave av registeret). Riskene ligger i Riskregister Snapshotdata.',
    kolonner: [idx(t('SnapshotId')), t('Tidspunkt'), t('TattAv'), n('AntallRisker'), lt('Kommentar'), lt('Register')],
  },
  snapshotdata: {
    visningsnavn: 'Riskregister Snapshotdata',
    beskrivelse: 'Riskene slik de var da snapshotet ble tatt. SnapshotId peker på Riskregister Snapshots.',
    kolonner: [idx(t('SnapshotId')), ...RISK_KOLONNER.map((k) => ({ ...k, indeksert: false })), lt('Tiltak')],
  },
}

// Listene som utgjør selve registeret. Endringer i disse gjør at andre henter registeret på nytt.
export const REGISTERLISTER: ListeNavn[] = ['risker', 'tiltak', 'innstillinger']

export type Felt = Record<string, string | number | boolean | null>

// SharePoint tillater maks 255 tegn i tittelkolonnen
const tittel = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 255)
const tekst = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const tall = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const valgfri = (v: unknown) => tekst(v) || undefined

export function riskTilFelt(r: Risk): Felt {
  return {
    Title: tittel(r.hendelse || r.aarsak || `Risk ${r.nr}`),
    RiskId: r.id,
    Nr: r.nr,
    RM: r.rm,
    Aarsak: r.aarsak,
    Hendelse: r.hendelse,
    Konsekvenser: r.konsekvenser,
    Eier: r.eier,
    Status: r.status,
    Kategori: r.kategori,
    Egendef: r.egendef,
    Egendef2: r.egendef2 ?? '',
    FagId: r.fag ?? '',
    Sannsynlighet: r.sannsynlighet,
    Konsekvens: r.konsekvens,
    BC: r.bc,
    ML: r.ml,
    WC: r.wc,
    TilSkarisk: r.tilSkarisk,
    Kilde: r.kilde ?? '',
    EndretTid: r.endret ?? '',
    EndretAv: r.endretAv ?? '',
    OpprettetTid: r.opprettet ?? '',
    OpprettetAv: r.opprettetAv ?? '',
    LukketTid: r.lukket ?? '',
    LukketAv: r.lukketAv ?? '',
  }
}

export function feltTilRisk(f: Record<string, unknown>): Risk {
  const rm = tekst(f.RM)
  return {
    id: tekst(f.RiskId),
    nr: tall(f.Nr),
    rm: rm === 'R' || rm === 'M' ? rm : '-',
    aarsak: tekst(f.Aarsak),
    hendelse: tekst(f.Hendelse),
    konsekvenser: tekst(f.Konsekvenser),
    eier: tekst(f.Eier),
    status: tekst(f.Status) || 'Åpen',
    kategori: tekst(f.Kategori),
    egendef: tekst(f.Egendef),
    egendef2: valgfri(f.Egendef2),
    fag: valgfri(f.FagId),
    sannsynlighet: tall(f.Sannsynlighet),
    konsekvens: tall(f.Konsekvens),
    bc: tall(f.BC),
    ml: tall(f.ML),
    wc: tall(f.WC),
    tilSkarisk: f.TilSkarisk === true || f.TilSkarisk === 'true' || f.TilSkarisk === 1,
    tiltak: [],
    kilde: valgfri(f.Kilde),
    endret: valgfri(f.EndretTid),
    endretAv: valgfri(f.EndretAv),
    opprettet: valgfri(f.OpprettetTid),
    opprettetAv: valgfri(f.OpprettetAv),
    lukket: valgfri(f.LukketTid),
    lukketAv: valgfri(f.LukketAv),
  }
}

export function tiltakTilFelt(tt: Tiltak, riskId: string, rekkefolge: number): Felt {
  return {
    Title: tittel(tt.tekst || 'Tiltak'),
    RiskId: riskId,
    TiltakId: tt.id,
    Rekkefolge: rekkefolge,
    Tekst: tt.tekst,
    Eier: tt.eier,
    Frist: tt.frist,
    Beskrivelse: tt.beskrivelse,
    Status: tt.status,
  }
}

export function feltTilTiltak(f: Record<string, unknown>): Tiltak & { riskId: string; rekkefolge: number } {
  return {
    id: tekst(f.TiltakId),
    riskId: tekst(f.RiskId),
    rekkefolge: tall(f.Rekkefolge),
    tekst: tekst(f.Tekst),
    eier: tekst(f.Eier),
    frist: tekst(f.Frist).slice(0, 10),
    beskrivelse: tekst(f.Beskrivelse),
    status: tekst(f.Status),
  }
}

// Alt i registeret som ikke er risker og tiltak, med én rad per nøkkel i innstillingslisten.
// Felt som endres sjelden og av få, så det holder at hver nøkkel er én JSON-verdi.
export const INNSTILLINGER = ['registerId', 'opprettet', 'prosjekt', 'deltakere', 'gjennomganger', 'lister', 'nesteNr', 'excelNokkel'] as const
export type Innstilling = (typeof INNSTILLINGER)[number]

export function innstillingerFraRegister(doc: Register): Record<Innstilling, string> {
  const ut = {} as Record<Innstilling, string>
  for (const k of INNSTILLINGER) ut[k] = JSON.stringify(doc[k] ?? null)
  return ut
}

// Innstillinger som ikke kan leses (f.eks. JSON som er ødelagt ved redigering i SharePoint)
export function odelagteInnstillinger(innst: Partial<Record<string, string>>): Innstilling[] {
  return INNSTILLINGER.filter((k) => {
    try {
      if (innst[k]) JSON.parse(innst[k]!)
      return false
    } catch {
      return true
    }
  })
}

export function byggRegister(innst: Partial<Record<string, string>>, risker: Risk[], tiltak: ReturnType<typeof feltTilTiltak>[]): Register {
  const verdi = <T>(k: Innstilling, standard: T): T => {
    try {
      const v = innst[k] ? JSON.parse(innst[k]!) : null
      return v ?? standard
    } catch {
      return standard
    }
  }
  const perRisk = new Map<string, typeof tiltak>()
  for (const tt of tiltak) perRisk.set(tt.riskId, [...(perRisk.get(tt.riskId) ?? []), tt])
  const medTiltak = risker
    .map((r) => ({
      ...r,
      tiltak: (perRisk.get(r.id) ?? []).sort((a, b) => a.rekkefolge - b.rekkefolge).map(({ riskId: _r, rekkefolge: _n, ...rest }) => rest),
    }))
    .sort((a, b) => a.nr - b.nr)
  return migrer({
    schemaVersion: SCHEMA_VERSION,
    registerId: verdi('registerId', uid()),
    opprettet: verdi('opprettet', new Date().toISOString()),
    prosjekt: verdi('prosjekt', { nummer: '', navn: '', eier: '', sjef: '', leder: '', fase: '', virksomhet: '', notering: '' }),
    deltakere: verdi('deltakere', []),
    gjennomganger: verdi('gjennomganger', []),
    lister: verdi('lister', structuredClone(DEFAULT_LISTER)),
    nesteNr: verdi<number | undefined>('nesteNr', undefined),
    excelNokkel: verdi<Register['excelNokkel']>('excelNokkel', undefined),
    risker: medTiltak,
  })
}

// Snapshot: selve registeret uten riskene lagres som JSON på snapshot-raden, riskene som egne rader i snapshotdata
export function snapshotRegisterJson(doc: Register) {
  const { risker: _r, ...resten } = doc
  return JSON.stringify(resten)
}

export function riskTilSnapshotFelt(r: Risk, snapshotId: string): Felt {
  return { ...riskTilFelt(r), SnapshotId: snapshotId, Tiltak: JSON.stringify(r.tiltak) }
}

export function snapshotFeltTilRisk(f: Record<string, unknown>): Risk {
  let tiltak: Tiltak[] = []
  try {
    tiltak = JSON.parse(tekst(f.Tiltak) || '[]')
  } catch {
    tiltak = []
  }
  return { ...feltTilRisk(f), tiltak }
}
