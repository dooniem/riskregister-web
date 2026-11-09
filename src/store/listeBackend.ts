// Registeret lagret i lister (SharePoint-lister, eller liksomlister i nettleseren i demomodus).
//
// Hver risk og hvert tiltak er en egen rad. Ved lagring sammenlignes registeret med det som sist ble hentet,
// og bare radene som faktisk er endret, skrives. Hver rad lagres med etag (If-Match): har noen andre endret samme
// rad i mellomtiden, avvises lagringen, registeret hentes på nytt og endringene legges oppå (se sync.ts).
// To brukere som endrer ulike risker, kommer dermed aldri i konflikt.
import type { Register } from '../model'
import { aktivLaas, migrer, uid, type RegisterLaas } from '../model'
import type { Bruker } from '../ops'
import type { Avvik, Backend, IndeksVarsel, LaasBrudd, LagreSvar, RadHistorikk, SnapshotInfo, Snapshots, Tilstede, Versjon } from './backend'
import { INDEKS_VARSEL_RADER } from './backend'
import { GraphFeil } from './graph'
import type { Element, Endring, ListeLager } from './lister/lager'
import type { Felt, ListeNavn } from './lister/skjema'
import {
  byggRegister,
  feltTilRisk,
  feltTilTiltak,
  innstillingerFraRegister,
  LISTER,
  odelagteInnstillinger,
  REGISTERLISTER,
  riskTilFelt,
  riskTilSnapshotFelt,
  snapshotFeltTilRisk,
  snapshotRegisterJson,
  tiltakTilFelt,
} from './lister/skjema'

// Rad i SharePoint og innholdet slik vi sist så det
interface Rad {
  id: string
  etag: string
  verdi: string
}

// Endringer som appen selv lagrer like etter at låsen trer i kraft (gjort under nedtellingen), regnes ikke som brudd
const LAAS_SLINGRING_MS = 20_000

// Registeret hentes uansett på nytt så ofte, i tilfelle en endring ikke ble fanget opp av sistEndret
const FULL_HENT_MS = 30_000
const oktId = Math.random().toString(36).slice(2, 8)

type Jobb = { nokkel: string; cache: Map<string, Rad>; endring: Endring; verdi: string }

export class ListeBackend implements Backend {
  readonly type: 'demo' | 'sharepoint'
  readonly pollMs: number
  readonly hjerteslagMs: number
  readonly samleMs?: number
  kanSkrive = true
  readonly bruker: Bruker
  readonly lager: ListeLager
  readonly snapshots?: Snapshots
  private risker = new Map<string, Rad>()
  private tiltak = new Map<string, Rad>()
  private innst = new Map<string, Rad>()
  private tilstedeRad?: string
  private tilstedeKo: Promise<unknown> = Promise.resolve()
  private ryddet = false
  avvik: Avvik = { innstillinger: [], doble: [], forelderlose: [] }
  laasBrudd?: LaasBrudd
  // Låsen og riskene ved forrige henting, for å se om noe er slettet eller låsen fjernet i SharePoint
  private forrige?: { laas: RegisterLaas | null; risker: Map<string, { nr: number; tittel: string }> }

  constructor(lager: ListeLager, bruker: Bruker) {
    this.lager = lager
    this.bruker = bruker
    this.type = lager.type
    this.pollMs = lager.type === 'demo' ? 1500 : 3000
    this.hjerteslagMs = lager.type === 'demo' ? 5000 : 10000
    // Endringer som kommer tett, samles i én lagring for å spare kall mot SharePoint
    this.samleMs = lager.type === 'demo' ? undefined : 2000
    if (lager.har('snapshots') && lager.har('snapshotdata')) this.snapshots = new ListeSnapshots(lager, bruker)
  }

  get tittel() {
    return this.lager.type === 'demo' ? `Demo › ${this.lager.tittel}` : this.lager.tittel
  }
  get webUrl() {
    return this.lager.webUrl
  }

  private etagFra(tid: string) {
    return `${tid}#${Math.floor(Date.now() / FULL_HENT_MS)}`
  }

  async sjekk() {
    return this.etagFra(await this.lager.sistEndret(REGISTERLISTER))
  }

  async hent(): Promise<Versjon> {
    // Tidsstempelet hentes før radene, så en endring som kommer mens vi leser, fanges opp ved neste sjekk
    const tid = await this.lager.sistEndret(REGISTERLISTER)
    const [ie, re, te] = await Promise.all([this.lager.har('innstillinger') ? this.lager.hentAlle('innstillinger') : [], this.lager.hentAlle('risker'), this.lager.hentAlle('tiltak')])
    this.innst.clear()
    this.risker.clear()
    this.tiltak.clear()
    const innst: Record<string, string> = {}
    for (const e of ie) {
      const k = String(e.felt.Title ?? '')
      if (!k || this.innst.has(k)) continue
      innst[k] = String(e.felt.Verdi ?? '')
      this.innst.set(k, { id: e.id, etag: e.etag, verdi: JSON.stringify({ Title: k, Verdi: innst[k] }) })
    }
    const odelagt = odelagteInnstillinger(innst)
    const risker = []
    const doble = new Map<string, Avvik['doble'][number]>()
    // Eldste rad først, så det er den som brukes når samme RiskId finnes flere ganger
    for (const e of [...re].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id))) {
      const r = feltTilRisk(e.felt)
      if (!r.id) continue
      if (this.risker.has(r.id)) {
        const d = doble.get(r.id) ?? { riskId: r.id, nr: r.nr, tittel: r.hendelse || r.aarsak, kopier: [] }
        d.kopier.push({ radId: e.id, risk: r })
        doble.set(r.id, d)
        continue
      }
      if (!r.opprettet) {
        r.opprettet = e.opprettet
        r.opprettetAv = e.opprettetAv
      }
      this.risker.set(r.id, { id: e.id, etag: e.etag, verdi: JSON.stringify(riskTilFelt(r)) })
      risker.push(r)
    }
    const tiltak = []
    for (const e of te) {
      const t = feltTilTiltak(e.felt)
      if (!t.id || this.tiltak.has(t.id)) continue
      this.tiltak.set(t.id, { id: e.id, etag: e.etag, verdi: JSON.stringify(tiltakTilFelt(t, t.riskId, t.rekkefolge)) })
      tiltak.push(t)
    }
    // Tiltak til risker som er slettet direkte i SharePoint. De ligger i cache, men slettes ikke ved lagring før brukeren bestemmer det.
    const forelderlose = new Map<string, Avvik['forelderlose'][number]>()
    for (const t of tiltak) {
      if (this.risker.has(t.riskId)) continue
      const { riskId, rekkefolge: _n, ...tt } = t
      const f = forelderlose.get(riskId) ?? { riskId, tiltak: [] }
      f.tiltak.push(tt)
      forelderlose.set(riskId, f)
    }
    this.avvik = { innstillinger: odelagt, doble: [...doble.values()], forelderlose: [...forelderlose.values()] }
    const doc = byggRegister(innst, risker, tiltak)
    this.sjekkLaas(doc, re, te, ie.find((e) => e.felt.Title === 'laas'))
    return { doc, etag: this.etagFra(tid) }
  }

  // Mens registeret er låst, skriver ikke appen til riskene og tiltakene. En rad som er endret etter at låsen trådte i kraft,
  // er derfor endret direkte i SharePoint. Fjernes låsen før tiden av en annen enn den som låste, er det også gjort utenfor appen.
  private sjekkLaas(doc: Register, re: Element[], te: Element[], laasRad?: Element) {
    const naa = Date.now()
    const laas = aktivLaas(doc, naa)
    const forrige = this.forrige
    const riskerNa = new Map(doc.risker.map((r) => [r.id, { nr: r.nr, tittel: r.hendelse || r.aarsak }]))
    this.forrige = { laas, risker: riskerNa }
    const forrigeLaas = forrige?.laas && Date.parse(forrige.laas.til) > naa ? forrige.laas : null
    if (!laas) {
      // Låsen er borte før tiden, og raden er sist endret av en annen enn den som låste (eller slettet)
      if (forrigeLaas && !doc.laas && (!laasRad || laasRad.endretAv !== forrigeLaas.av)) {
        const nokkel = `${forrigeLaas.fra ?? forrigeLaas.tid}|${forrigeLaas.til}`
        const endringer = this.laasBrudd?.laas === nokkel ? this.laasBrudd.endringer : []
        this.laasBrudd = { laas: nokkel, endringer, fjernet: { av: laasRad?.endretAv, tid: laasRad?.endret, laastAv: forrigeLaas.av } }
      }
      return
    }
    const nokkel = `${laas.fra ?? laas.tid}|${laas.til}`
    const fra = Date.parse(laas.fra ?? laas.tid) + LAAS_SLINGRING_MS
    // Den som låste, kan fortsatt endre i appen, så endringene deres er ikke brudd
    const etter = (e: Element) => !!e.endret && Date.parse(e.endret) > fra && e.endretAv !== laas.av
    type Endring = LaasBrudd['endringer'][number]
    const ut = new Map<string, Endring>()
    for (const e of re) {
      if (!etter(e)) continue
      const r = feltTilRisk(e.felt)
      if (r.id) ut.set(r.id, { riskId: r.id, nr: r.nr, tittel: r.hendelse || r.aarsak, hva: 'risk', av: e.endretAv, tid: e.endret })
    }
    for (const e of te) {
      if (!etter(e)) continue
      const t = feltTilTiltak(e.felt)
      const r = riskerNa.get(t.riskId)
      const f = ut.get(t.riskId)
      // Én linje per risk: den siste endringen vises
      if (r && (!f || (e.endret ?? '') > (f.tid ?? ''))) ut.set(t.riskId, { riskId: t.riskId, nr: r.nr, tittel: r.tittel, hva: f ? 'risk' : 'tiltak', av: e.endretAv, tid: e.endret })
    }
    // Slettede risker: de var med ved forrige henting under samme lås. SharePoint sier ikke hvem som slettet.
    const tidligere = this.laasBrudd?.laas === nokkel ? this.laasBrudd.endringer.filter((x) => x.hva === 'slettet') : []
    for (const x of tidligere) ut.set(x.riskId, x)
    if (forrigeLaas && `${forrigeLaas.fra ?? forrigeLaas.tid}|${forrigeLaas.til}` === nokkel && Date.parse(forrigeLaas.fra ?? forrigeLaas.tid) <= naa) {
      for (const [id, r] of forrige!.risker) if (!riskerNa.has(id) && !laas.slettet?.includes(id)) ut.set(id, { riskId: id, nr: r.nr, tittel: r.tittel, hva: 'slettet', tid: new Date(naa).toISOString() })
    }
    this.laasBrudd = { laas: nokkel, endringer: [...ut.values()].sort((a, b) => (b.tid ?? '').localeCompare(a.tid ?? '')) }
  }

  // Radene til risken og tiltakene den har nå. Tiltak som er slettet, er ikke med.
  async historikk(riskId: string): Promise<RadHistorikk[]> {
    const lager = this.lager
    if (!lager.versjoner) return []
    const rad = this.risker.get(riskId)
    const tiltak = [...this.tiltak.values()].filter((t) => {
      try {
        return JSON.parse(t.verdi).RiskId === riskId
      } catch {
        return false
      }
    })
    const rader: [RadHistorikk['liste'], string][] = [...(rad ? [['risker', rad.id] as [RadHistorikk['liste'], string]] : []), ...tiltak.map((t): [RadHistorikk['liste'], string] => ['tiltak', t.id])]
    return Promise.all(rader.map(async ([liste, id]) => ({ liste, versjoner: await lager.versjoner!(liste, id) })))
  }

  // Skriver verdien som vises (standardverdien) over innstillinger som ikke kan leses
  async overskrivInnstillinger(doc: Register) {
    const verdier = innstillingerFraRegister(doc) as Record<string, string>
    const nokler = this.avvik.innstillinger.filter((k) => this.innst.has(k))
    await this.skrivDirekte(nokler.map((k): Endring => ({ type: 'endre', liste: 'innstillinger', id: this.innst.get(k)!.id, felt: { Verdi: verdier[k] } })))
    this.avvik = { ...this.avvik, innstillinger: [] }
  }

  // Sletter radene som er kopier av en annen risk
  async slettKopier(riskId: string) {
    const d = this.avvik.doble.find((x) => x.riskId === riskId)
    if (!d) return
    await this.skrivDirekte(d.kopier.map((k): Endring => ({ type: 'slett', liste: 'risker', id: k.radId })))
    this.avvik = { ...this.avvik, doble: this.avvik.doble.filter((x) => x !== d) }
  }

  // Sletter tiltakene til en risk som ikke finnes lenger
  async slettForelderlose(riskId: string) {
    const f = this.avvik.forelderlose.find((x) => x.riskId === riskId)
    if (!f) return
    const ider = f.tiltak.map((t) => this.tiltak.get(t.id)?.id).filter(Boolean) as string[]
    await this.skrivDirekte(ider.map((id): Endring => ({ type: 'slett', liste: 'tiltak', id })))
    f.tiltak.forEach((t) => this.tiltak.delete(t.id))
    this.avvik = { ...this.avvik, forelderlose: this.avvik.forelderlose.filter((x) => x !== f) }
  }

  private async skrivDirekte(endringer: Endring[]) {
    const res = await this.lager.skriv(endringer)
    const feil = res.find((r) => !r.ok)
    if (feil) throw 'feil' in feil ? feil.feil : new Error('Noen av radene er endret av andre. Prøv igjen.')
  }

  // Lager endringene som skal til for at radene i cache blir lik ønsket innhold
  private jobber(cache: Map<string, Rad>, onsket: Map<string, Felt>, liste: Endring['liste']): Jobb[] {
    const ut: Jobb[] = []
    for (const [nokkel, felt] of onsket) {
      const verdi = JSON.stringify(felt)
      const c = cache.get(nokkel)
      if (!c) ut.push({ nokkel, cache, verdi, endring: { type: 'ny', liste, felt } })
      else if (c.verdi !== verdi) ut.push({ nokkel, cache, verdi, endring: { type: 'endre', liste, id: c.id, etag: c.etag, felt } })
    }
    for (const [nokkel, c] of cache) if (!onsket.has(nokkel)) ut.push({ nokkel, cache, verdi: '', endring: { type: 'slett', liste, id: c.id } })
    return ut
  }

  // Skriver endringene og oppdaterer cache. Returnerer false ved konflikt.
  private async utfor(jobber: Jobb[]): Promise<boolean> {
    if (!jobber.length) return true
    const res = await this.lager.skriv(jobber.map((j) => j.endring))
    let ok = true
    let feil: Error | undefined
    res.forEach((r, i) => {
      const j = jobber[i]
      if (r.ok) {
        if (j.endring.type === 'slett') j.cache.delete(j.nokkel)
        else if (j.endring.type === 'ny') j.cache.set(j.nokkel, { id: r.element!.id, etag: r.element!.etag, verdi: j.verdi })
        else j.cache.set(j.nokkel, { ...j.cache.get(j.nokkel)!, etag: r.etag ?? j.cache.get(j.nokkel)!.etag, verdi: j.verdi })
      } else if (r.konflikt) ok = false
      else feil ??= r.feil
    })
    if (feil) {
      if (feil instanceof GraphFeil && feil.status === 403) {
        this.kanSkrive = false
        throw new GraphFeil(403, 'Du har bare lesetilgang til dette registeret.')
      }
      throw feil
    }
    return ok
  }

  async lagre(doc: Register): Promise<LagreSvar> {
    // Innstillingene først. Der ligger nesteNr, som hindrer at to som legger til risker samtidig gir dem samme nummer:
    // den andre får konflikt her før riskene skrives, henter på nytt og får neste ledige nummer.
    const innst = new Map(Object.entries(innstillingerFraRegister(doc)).map(([k, v]) => [k, { Title: k, Verdi: v } as Felt]))
    // Nøkler som ikke er i bruk, slettes ikke
    // Innstillinger som ikke kan leses, skrives ikke over før brukeren har bestemt det
    const innstJobber = this.jobber(this.innst, innst, 'innstillinger').filter((j) => j.endring.type !== 'slett' && !this.avvik.innstillinger.includes(j.nokkel))
    // Feiler en innstilling av andre grunner enn konflikt (f.eks. 507 fra SharePoint), lagres riskene likevel, og feilen kastes etterpå.
    // Ellers blir en ny risk aldri lagret, og den får nytt nummer og skriver nesteNr på nytt ved hvert forsøk.
    let innstFeil: unknown
    try {
      if (!(await this.utfor(innstJobber))) return { ok: false, konflikt: true }
    } catch (e) {
      if (e instanceof GraphFeil && e.status === 403) throw e
      innstFeil = e
    }

    const risker = new Map(doc.risker.map((r) => [r.id, riskTilFelt(r)]))
    const tiltak = new Map(doc.risker.flatMap((r) => r.tiltak.map((t, i) => [t.id, tiltakTilFelt(t, r.id, i)] as const)))
    // Tiltak uten risk slettes ikke før brukeren har bestemt det. Gjenopprettes risken, er de med i registeret igjen.
    const forelderlose = new Set(this.avvik.forelderlose.flatMap((f) => (risker.has(f.riskId) ? [] : f.tiltak.map((t) => t.id))))
    const tiltakJobber = this.jobber(this.tiltak, tiltak, 'tiltak').filter((j) => !(j.endring.type === 'slett' && forelderlose.has(j.nokkel)))
    const ok = await this.utfor([...this.jobber(this.risker, risker, 'risker'), ...tiltakJobber])
    if (!ok) return { ok: false, konflikt: true }
    if (innstFeil) throw innstFeil
    // Egen etag som ikke stemmer med listene, så neste sjekk henter registeret med eventuelle endringer fra andre
    return { ok: true, etag: 'lokal:' + uid() }
  }

  // ---- Tilstedeværelse: én rad per åpen økt ----
  publiserTilstede(t: Tilstede) {
    if (!this.kanSkrive || !this.lager.har('tilstede')) return Promise.resolve()
    // Kø, så to publiseringer tett etter hverandre ikke lager to rader
    const p = this.tilstedeKo.then(async () => {
      const felt = { Title: `${t.brukerId}~${oktId}`, Data: JSON.stringify(t) }
      if (this.tilstedeRad) {
        const [r] = await this.lager.skriv([{ type: 'endre', liste: 'tilstede', id: this.tilstedeRad, felt }])
        if (r.ok) return
        this.tilstedeRad = undefined
      }
      const [r] = await this.lager.skriv([{ type: 'ny', liste: 'tilstede', felt }])
      if (r.ok && r.element) this.tilstedeRad = r.element.id
    })
    this.tilstedeKo = p.catch(() => {})
    return p
  }

  async hentTilstede(): Promise<Tilstede[]> {
    if (!this.lager.har('tilstede')) return []
    const el = await this.lager.hentAlle('tilstede')
    const naa = Date.now()
    // Én gang per økt: rydd bort rader fra økter som ble avsluttet uten å slette raden sin
    if (!this.ryddet && this.kanSkrive) {
      this.ryddet = true
      const gamle = el.filter((e) => e.endret && naa - Date.parse(e.endret) > 3_600_000 && e.id !== this.tilstedeRad)
      if (gamle.length) void this.lager.skriv(gamle.map((e) => ({ type: 'slett', liste: 'tilstede', id: e.id }))).catch(() => {})
    }
    const nyest = new Map<string, Tilstede>()
    for (const e of el) {
      try {
        const t = JSON.parse(String(e.felt.Data ?? '')) as Tilstede
        // Samme bruker i flere faner: vis den nyeste
        if (t?.brukerId && (nyest.get(t.brukerId)?.ts ?? 0) < t.ts) nyest.set(t.brukerId, t)
      } catch {
        // ødelagt rad, hopp over
      }
    }
    return [...nyest.values()]
  }

  async fjernTilstede() {
    if (!this.tilstedeRad) return
    this.lager.slettVedLukk('tilstede', this.tilstedeRad)
    this.tilstedeRad = undefined
  }

  lytt(cb: () => void) {
    return this.lager.lytt?.(cb) ?? (() => {})
  }
}

// Skriver et helt register til tomme lister (nytt register)
export async function skrivNyttRegister(lager: ListeLager, doc: Register) {
  const endringer: Endring[] = [
    ...Object.entries(innstillingerFraRegister(doc)).map(([k, v]): Endring => ({ type: 'ny', liste: 'innstillinger', felt: { Title: k, Verdi: v } })),
    ...doc.risker.map((r): Endring => ({ type: 'ny', liste: 'risker', felt: riskTilFelt(r) })),
    ...doc.risker.flatMap((r) => r.tiltak.map((t, i): Endring => ({ type: 'ny', liste: 'tiltak', felt: tiltakTilFelt(t, r.id, i) }))),
  ]
  const res = await lager.skriv(endringer)
  const feil = res.find((r) => !r.ok)
  if (feil) throw 'feil' in feil ? feil.feil : new Error('Klarte ikke å skrive registeret til listene.')
}

class ListeSnapshots implements Snapshots {
  private lager: ListeLager
  private bruker: Bruker
  constructor(lager: ListeLager, bruker: Bruker) {
    this.lager = lager
    this.bruker = bruker
  }

  private info(e: Element): SnapshotInfo {
    const f = e.felt
    return {
      id: String(f.SnapshotId ?? ''),
      navn: String(f.Title ?? ''),
      tidspunkt: String(f.Tidspunkt || e.opprettet || ''),
      tattAv: String(f.TattAv || e.opprettetAv || ''),
      antallRisker: Number(f.AntallRisker) || 0,
      kommentar: String(f.Kommentar ?? ''),
    }
  }

  async sjekkIndekser(liste: SnapshotInfo[]): Promise<IndeksVarsel | null> {
    if (!this.lager.uindekserte) return null
    // Snapshotdata har én rad per risk per snapshot. Antallet regnes fra snapshot-radene, så listen ikke må hentes.
    const rader: Partial<Record<ListeNavn, number>> = { snapshots: liste.length, snapshotdata: liste.reduce((s, x) => s + x.antallRisker, 0) }
    const store = (Object.keys(rader) as ListeNavn[]).filter((l) => (rader[l] ?? 0) >= INDEKS_VARSEL_RADER)
    if (!store.length) return null
    const mangler = await this.lager.uindekserte(store)
    const feilet: IndeksVarsel['kolonner'] = []
    for (const k of mangler) {
      try {
        await this.lager.indekser!(k.liste, k.kolonne)
      } catch {
        feilet.push({ liste: LISTER[k.liste].visningsnavn, kolonne: k.kolonne, rader: rader[k.liste] ?? 0 })
      }
    }
    return feilet.length ? { kolonner: feilet } : null
  }

  async liste() {
    const el = await this.lager.hentAlle('snapshots')
    return el
      .map((e) => this.info(e))
      .filter((s) => s.id)
      .sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt))
  }

  // Riskene skrives først og snapshot-raden til slutt, så et snapshot som ble avbrutt underveis, aldri vises
  async ta(navn: string, kommentar: string, doc: Register, fremdrift?: (ferdig: number, totalt: number) => void) {
    const id = uid()
    // I bolker på 20 (det samme som én Graph-batch), så brukeren ser hvor langt det har kommet
    const totalt = doc.risker.length
    fremdrift?.(0, totalt)
    for (let i = 0; i < totalt; i += 20) {
      const res = await this.lager.skriv(doc.risker.slice(i, i + 20).map((r) => ({ type: 'ny', liste: 'snapshotdata', felt: riskTilSnapshotFelt(r, id) })))
      const feil = res.find((r) => !r.ok)
      if (feil) throw 'feil' in feil ? feil.feil : new Error('Klarte ikke å lagre snapshotet.')
      fremdrift?.(Math.min(i + 20, totalt), totalt)
    }
    const info: SnapshotInfo = { id, navn: navn.slice(0, 255), tidspunkt: new Date().toISOString(), tattAv: this.bruker.navn, antallRisker: doc.risker.length, kommentar }
    const [h] = await this.lager.skriv([
      {
        type: 'ny',
        liste: 'snapshots',
        felt: { Title: info.navn, SnapshotId: id, Tidspunkt: info.tidspunkt, TattAv: info.tattAv, AntallRisker: info.antallRisker, Kommentar: kommentar, Register: snapshotRegisterJson(doc) },
      },
    ])
    if (!h.ok) throw 'feil' in h ? h.feil : new Error('Klarte ikke å lagre snapshotet.')
    return info
  }

  async hent(id: string) {
    const filter = { kolonne: 'SnapshotId', verdi: id }
    const [hode, data] = await Promise.all([this.lager.hentAlle('snapshots', filter), this.lager.hentAlle('snapshotdata', filter)])
    if (!hode[0]) throw new Error('Fant ikke snapshotet. Det kan være slettet.')
    let reg: Partial<Register> = {}
    try {
      reg = JSON.parse(String(hode[0].felt.Register ?? '{}'))
    } catch {
      reg = {}
    }
    const risker = data.map((e) => snapshotFeltTilRisk(e.felt)).sort((a, b) => a.nr - b.nr)
    return { info: this.info(hode[0]), doc: migrer({ ...(reg as Register), risker }) }
  }

  async slett(id: string) {
    const filter = { kolonne: 'SnapshotId', verdi: id }
    const [hode, data] = await Promise.all([this.lager.hentAlle('snapshots', filter), this.lager.hentAlle('snapshotdata', filter)])
    // Snapshot-raden først, så det ikke ligger et halvt snapshot synlig hvis slettingen stopper underveis
    await this.lager.skriv(hode.map((e) => ({ type: 'slett', liste: 'snapshots', id: e.id })))
    await this.lager.skriv(data.map((e) => ({ type: 'slett', liste: 'snapshotdata', id: e.id })))
  }
}

// Viser et snapshot skrivebeskyttet med samme visning som registeret
export class SnapshotBackend implements Backend {
  readonly type: 'demo' | 'sharepoint'
  readonly pollMs = 60_000
  readonly hjerteslagMs = 60_000
  readonly kanSkrive = false
  readonly bruker: Bruker
  readonly tittel: string
  readonly webUrl?: string
  readonly lager: ListeLager
  readonly snapshots?: Snapshots
  readonly snapshot: SnapshotInfo
  private doc: Register

  constructor(fra: ListeBackend, info: SnapshotInfo, doc: Register) {
    this.type = fra.type
    this.bruker = fra.bruker
    this.tittel = fra.tittel
    this.webUrl = fra.webUrl
    this.lager = fra.lager
    this.snapshots = fra.snapshots
    this.snapshot = info
    this.doc = doc
  }
  async hent() {
    return { doc: this.doc, etag: 'snapshot' }
  }
  async sjekk() {
    return 'snapshot'
  }
  async lagre(): Promise<LagreSvar> {
    return { ok: false, konflikt: true }
  }
  async publiserTilstede() {}
  async hentTilstede() {
    return []
  }
  async fjernTilstede() {}
}
