// Holder registeret i synk med lagringen: lokale endringer legges i kø og lagres med en gang,
// endringer fra andre hentes jevnlig, og tilstedeværelse/låser publiseres.
import type { Register } from './model'
import { migrer } from './model'
import type { Konflikt, Op } from './ops'
import { brukAlle } from './ops'
import type { Backend, Tilstede } from './store/backend'
import { fargeFor, TILSTEDE_UTLOP_MS } from './store/backend'

export type Status = 'laster' | 'lagret' | 'lagrer' | 'frakoblet' | 'feil'

export interface Snapshot {
  doc: Register
  status: Status
  feil?: string
  andre: Tilstede[] // andre brukere som er inne nå
  sistHentet: number
  ventende: number
}

export class Okt {
  readonly backend: Backend
  private base!: Register
  private etag = ''
  private ventende: Op[] = []
  private visning!: Register
  private status: Status = 'laster'
  private feil?: string
  private andre: Tilstede[] = []
  private sistHentet = 0
  private lagrer = false
  private lyttere = new Set<() => void>()
  private snap!: Snapshot
  private timere: number[] = []
  private avlytt?: () => void
  private meg: Tilstede
  private sistPublisert = 0
  private publiserTimer?: number
  private samleTimer?: number
  onKonflikt?: (k: Konflikt[]) => void
  onLaasTapt?: (riskId: string, av: string) => void

  constructor(backend: Backend) {
    this.backend = backend
    this.meg = { brukerId: backend.bruker.id, navn: backend.bruker.navn, farge: fargeFor(backend.bruker.id), ts: Date.now() }
  }

  async start() {
    const v = await this.backend.hent()
    this.base = migrer(v.doc)
    this.etag = v.etag
    this.visning = this.base
    this.status = 'lagret'
    this.sistHentet = Date.now()
    this.oppdaterSnap()
    this.timere.push(window.setInterval(() => this.poll(), this.backend.pollMs))
    this.timere.push(window.setInterval(() => this.publiser(true), this.backend.hjerteslagMs))
    this.avlytt = this.backend.lytt?.(() => this.poll())
    window.addEventListener('beforeunload', this.vedLukk)
    this.publiser(true)
  }

  private vedLukk = (e: BeforeUnloadEvent) => {
    void this.backend.fjernTilstede()
    // Endringer som ikke er lagret ennå: lagre med en gang og be nettleseren spørre før fanen lukkes
    if (this.ventende.length) {
      window.clearTimeout(this.samleTimer)
      this.samleTimer = undefined
      void this.lagre()
      e.preventDefault()
    }
  }

  stopp() {
    this.timere.forEach((t) => clearInterval(t))
    this.avlytt?.()
    window.removeEventListener('beforeunload', this.vedLukk)
    void this.backend.fjernTilstede()
  }

  // ---- React-binding ----
  abonner = (cb: () => void) => {
    this.lyttere.add(cb)
    return () => this.lyttere.delete(cb)
  }
  hentSnap = () => this.snap
  private oppdaterSnap() {
    this.snap = {
      doc: this.visning,
      status: this.status,
      feil: this.feil,
      andre: this.andre,
      sistHentet: this.sistHentet,
      ventende: this.ventende.length,
    }
    this.lyttere.forEach((l) => l())
  }

  get doc() {
    return this.visning
  }

  // ---- Endringer ----
  utfor(...ops: Op[]) {
    if (!this.backend.kanSkrive) return
    this.ventende.push(...ops)
    this.visning = brukAlle(this.base, this.ventende, this.backend.bruker).doc
    this.oppdaterSnap()
    // Hver lagring blir en ny filversjon i SharePoint, så endringer som kommer tett samles i én lagring
    if (!this.backend.samleMs) void this.lagre()
    else this.planleggLagring()
  }

  private planleggLagring() {
    this.samleTimer ??= window.setTimeout(() => {
      this.samleTimer = undefined
      void this.lagre()
    }, this.backend.samleMs)
  }

  private async lagre() {
    if (this.lagrer) return
    this.lagrer = true
    let senere = false
    try {
      for (let forsok = 0; this.ventende.length && forsok < 8; forsok++) {
        this.status = 'lagrer'
        this.oppdaterSnap()
        const n = this.ventende.length
        const { doc, konflikter } = brukAlle(this.base, this.ventende.slice(0, n), this.backend.bruker)
        const svar = await this.backend.lagre(doc, this.etag)
        if (svar.ok) {
          this.base = doc
          this.etag = svar.etag
          this.ventende.splice(0, n)
          if (konflikter.length) this.onKonflikt?.(konflikter)
          // Endringer som kom mens vi lagret, venter til neste samlede lagring
          if (this.backend.samleMs && this.ventende.length) {
            senere = true
            break
          }
          forsok = -1
        } else {
          // Noen andre har lagret i mellomtiden: hent ny versjon og legg endringene oppå
          const v = await this.backend.hent()
          this.base = migrer(v.doc)
          this.etag = v.etag
          this.sistHentet = Date.now()
        }
        this.visning = brukAlle(this.base, this.ventende, this.backend.bruker).doc
      }
      this.visning = brukAlle(this.base, this.ventende, this.backend.bruker).doc
      this.status = senere || !this.ventende.length ? 'lagret' : 'feil'
      this.feil = this.status === 'feil' ? 'Klarte ikke å lagre etter flere forsøk' : undefined
      if (senere) this.planleggLagring()
    } catch (e) {
      this.status = 'frakoblet'
      this.feil = e instanceof Error ? e.message : String(e)
      window.setTimeout(() => void this.lagre(), 5000)
    } finally {
      this.lagrer = false
      this.oppdaterSnap()
    }
  }

  private async poll() {
    try {
      const [etag, tilstede] = await Promise.all([this.backend.sjekk(), this.backend.hentTilstede()])
      const naa = Date.now()
      const andre = tilstede.filter((t) => t.brukerId !== this.meg.brukerId && naa - t.ts < TILSTEDE_UTLOP_MS)
      const endretTilstede = JSON.stringify(andre) !== JSON.stringify(this.andre)
      this.andre = andre
      this.sjekkLaas()
      let endret = endretTilstede || this.status === 'frakoblet'
      if (etag !== this.etag && !this.lagrer) {
        endret = true
        const v = await this.backend.hent()
        if (!this.lagrer) {
          this.base = migrer(v.doc)
          this.etag = v.etag
          this.visning = brukAlle(this.base, this.ventende, this.backend.bruker).doc
        }
      }
      this.sistHentet = naa
      if (this.status === 'frakoblet') {
        this.status = 'lagret'
        this.feil = undefined
      }
      if (endret) this.oppdaterSnap()
    } catch (e) {
      this.status = 'frakoblet'
      this.feil = e instanceof Error ? e.message : String(e)
      this.oppdaterSnap()
    }
  }

  // ---- Tilstedeværelse og låser ----
  settPosisjon(riskId?: string, kolonne?: string, tiltakId?: string) {
    if (this.meg.riskId === riskId && this.meg.kolonne === kolonne && this.meg.tiltakId === tiltakId) return
    this.meg = { ...this.meg, riskId, kolonne, tiltakId }
    this.publiser(false)
  }

  // Prøver å låse risken for redigering. Returnerer navnet på den som har låsen hvis det er en annen.
  laas(riskId: string): string | null {
    const annen = this.laastAv(riskId)
    if (annen) return annen.navn
    if (this.meg.laas?.riskId !== riskId) {
      this.meg = { ...this.meg, riskId, laas: { riskId, siden: Date.now() } }
      this.publiser(false, true)
    }
    return null
  }

  slippLaas() {
    if (!this.meg.laas) return
    this.meg = { ...this.meg, laas: undefined }
    this.publiser(false, true)
  }

  get minLaas() {
    return this.meg.laas?.riskId
  }

  // Hvem (andre enn meg) har låst risken? Ved samtidig låsing vinner den som var først.
  laastAv(riskId: string): Tilstede | undefined {
    const naa = Date.now()
    const holdere = this.andre.filter((t) => t.laas?.riskId === riskId && naa - t.ts < TILSTEDE_UTLOP_MS)
    if (!holdere.length) return undefined
    const mine = this.meg.laas?.riskId === riskId ? this.meg.laas.siden : Infinity
    return holdere.find((t) => t.laas!.siden < mine || (t.laas!.siden === mine && t.brukerId < this.meg.brukerId))
  }

  private sjekkLaas() {
    const r = this.meg.laas?.riskId
    if (!r) return
    const annen = this.laastAv(r)
    if (annen) {
      this.slippLaas()
      this.onLaasTapt?.(r, annen.navn)
    }
  }

  private publiser(hjerteslag: boolean, straks = false) {
    const naa = Date.now()
    if (!hjerteslag && !straks && naa - this.sistPublisert < 400) {
      clearTimeout(this.publiserTimer)
      this.publiserTimer = window.setTimeout(() => this.publiser(false, true), 400)
      return
    }
    this.sistPublisert = naa
    this.meg = { ...this.meg, ts: naa }
    void this.backend.publiserTilstede(this.meg).catch(() => {})
  }
}
