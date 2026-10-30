// Liksom-SharePoint-lister i nettleserens localStorage for demomodus. Oppfører seg som listene i SharePoint:
// hver rad har id og etag, og en endring med utdatert etag avvises. Delt mellom faner, så flere faner kan
// opptre som ulike brukere i samme register.
import type { Element, Endring, ListeLager, Resultat } from './lager'
import type { ListeNavn } from './skjema'
import { LISTER } from './skjema'

const PREFIX = 'rr-demo:'
const minne = new Map<string, string>()

export function les(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return minne.get(k) ?? null
  }
}
export function skriv(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    minne.set(k, v)
  }
}
export function slett(k: string) {
  try {
    localStorage.removeItem(k)
  } catch {
    minne.delete(k)
  }
}
export function nokler(): string[] {
  try {
    return Object.keys(localStorage)
  } catch {
    return [...minne.keys()]
  }
}

interface Lagret {
  neste: number
  endret: string
  el: Element[]
}

export const demoNokkel = (navn: string, liste: ListeNavn) => `${PREFIX}${navn}:l:${liste}`
export const demoPrefix = (navn: string) => `${PREFIX}${navn}:`

let teller = 0
const etag = () => `"${Date.now().toString(36)}-${(teller++).toString(36)}-${Math.random().toString(36).slice(2, 6)}"`

export class DemoLister implements ListeLager {
  readonly type = 'demo' as const
  readonly navn: string
  private brukernavn: string
  private kanal: BroadcastChannel | null = null
  // Kunstig forsinkelse gjør det lettere å se hva som skjer ved samtidige lagringer
  forsinkelseMs = 150

  constructor(navn: string, brukernavn = 'Demo') {
    this.navn = navn
    this.brukernavn = brukernavn
    try {
      this.kanal = new BroadcastChannel('rr-demo')
    } catch {
      this.kanal = null
    }
  }

  get tittel() {
    return this.navn
  }

  private vent() {
    return new Promise((r) => setTimeout(r, this.forsinkelseMs))
  }

  private lesListe(liste: ListeNavn): Lagret {
    const raw = les(demoNokkel(this.navn, liste))
    return raw ? JSON.parse(raw) : { neste: 1, endret: '', el: [] }
  }

  private skrivListe(liste: ListeNavn, l: Lagret) {
    skriv(demoNokkel(this.navn, liste), JSON.stringify({ ...l, endret: etag() }))
  }

  har(_liste: ListeNavn) {
    return true
  }

  async sistEndret(lister: ListeNavn[]) {
    return lister.map((l) => this.lesListe(l).endret).join('|')
  }

  async hentAlle(liste: ListeNavn, filter?: { kolonne: string; verdi: string }) {
    await this.vent()
    const el = this.lesListe(liste).el
    return filter ? el.filter((e) => String(e.felt[filter.kolonne] ?? '') === filter.verdi) : el
  }

  async skriv(endringer: Endring[]): Promise<Resultat[]> {
    await this.vent()
    const naa = new Date().toISOString()
    const ut = endringer.map((e): Resultat => {
      const l = this.lesListe(e.liste)
      if (e.type === 'ny') {
        const el: Element = { id: String(l.neste++), etag: etag(), felt: { ...e.felt }, opprettet: naa, opprettetAv: this.brukernavn, endret: naa, endretAv: this.brukernavn }
        l.el.push(el)
        this.skrivListe(e.liste, l)
        return { ok: true, element: el }
      }
      const i = l.el.findIndex((x) => x.id === e.id)
      if (e.type === 'slett') {
        if (i >= 0) l.el.splice(i, 1)
        this.skrivListe(e.liste, l)
        return { ok: true }
      }
      if (i < 0 || (e.etag && l.el[i].etag !== e.etag)) return { ok: false, konflikt: true }
      l.el[i] = { ...l.el[i], etag: etag(), felt: { ...l.el[i].felt, ...e.felt }, endret: naa, endretAv: this.brukernavn }
      this.skrivListe(e.liste, l)
      return { ok: true, etag: l.el[i].etag }
    })
    this.kanal?.postMessage({ navn: this.navn })
    return ut
  }

  slettVedLukk(liste: ListeNavn, id: string) {
    const l = this.lesListe(liste)
    this.skrivListe(liste, { ...l, el: l.el.filter((x) => x.id !== id) })
    this.kanal?.postMessage({ navn: this.navn })
  }

  listeUrl() {
    return undefined
  }

  lytt(cb: () => void) {
    const h = (e: MessageEvent) => {
      if (e.data?.navn === this.navn) cb()
    }
    this.kanal?.addEventListener('message', h)
    const s = (e: StorageEvent) => {
      if (e.key?.startsWith(demoPrefix(this.navn))) cb()
    }
    window.addEventListener('storage', s)
    return () => {
      this.kanal?.removeEventListener('message', h)
      window.removeEventListener('storage', s)
    }
  }
}

export const DEMO_LISTER = Object.keys(LISTER) as ListeNavn[]
