// Demomodus: registeret ligger i nettleserens localStorage og deles mellom faner.
// Hver fane kan være en egen bruker, slik at samtidig redigering og låsing kan vises uten SharePoint.
import type { Register } from '../model'
import type { Bruker } from '../ops'
import type { Backend, LagreSvar, Tilstede, Versjon } from './backend'

const PREFIX = 'rr-demo:'
const minne = new Map<string, string>()

function les(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return minne.get(k) ?? null
  }
}
function skriv(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    minne.set(k, v)
  }
}
function slett(k: string) {
  try {
    localStorage.removeItem(k)
  } catch {
    minne.delete(k)
  }
}
function nokler(): string[] {
  try {
    return Object.keys(localStorage)
  } catch {
    return [...minne.keys()]
  }
}

let kanal: BroadcastChannel | null = null
try {
  kanal = new BroadcastChannel('rr-demo')
} catch {
  kanal = null
}

export function demoRegistre(): string[] {
  return nokler()
    .filter((k) => k.startsWith(PREFIX) && k.endsWith(':doc'))
    .map((k) => k.slice(PREFIX.length, -4))
    .sort()
}

export function demoFinnes(navn: string) {
  return les(PREFIX + navn + ':doc') !== null
}

export function opprettDemo(navn: string, doc: Register) {
  skriv(PREFIX + navn + ':doc', JSON.stringify({ doc, etag: crypto.randomUUID() }))
  kanal?.postMessage({ navn })
}

export function slettDemo(navn: string) {
  for (const k of nokler()) if (k.startsWith(PREFIX + navn + ':')) slett(k)
}

export class DemoBackend implements Backend {
  readonly type = 'demo' as const
  readonly pollMs = 1500
  readonly hjerteslagMs = 5000
  kanSkrive = true
  readonly tittel: string
  private navn: string
  bruker: Bruker
  // Kunstig forsinkelse gjør det lettere å se hva som skjer ved samtidige lagringer
  forsinkelseMs = 150
  private kanal: BroadcastChannel | null = null

  constructor(navn: string, bruker: Bruker) {
    this.navn = navn
    try {
      this.kanal = new BroadcastChannel('rr-demo')
    } catch {
      this.kanal = null
    }
    this.bruker = bruker
    this.tittel = `Demo › ${navn}`
  }

  private vent() {
    return new Promise((r) => setTimeout(r, this.forsinkelseMs))
  }

  private lesDoc(): Versjon {
    const raw = les(PREFIX + this.navn + ':doc')
    if (!raw) throw new Error(`Fant ikke demoregisteret «${this.navn}»`)
    return JSON.parse(raw)
  }

  async hent(): Promise<Versjon> {
    await this.vent()
    return this.lesDoc()
  }

  async sjekk(): Promise<string> {
    return this.lesDoc().etag
  }

  async lagre(doc: Register, hvisEtag: string): Promise<LagreSvar> {
    await this.vent()
    const naa = this.lesDoc()
    if (naa.etag !== hvisEtag) return { ok: false, konflikt: true }
    const etag = crypto.randomUUID()
    skriv(PREFIX + this.navn + ':doc', JSON.stringify({ doc, etag }))
    this.kanal?.postMessage({ navn: this.navn })
    return { ok: true, etag }
  }

  async publiserTilstede(t: Tilstede) {
    skriv(PREFIX + this.navn + ':tilstede:' + t.brukerId, JSON.stringify(t))
    this.kanal?.postMessage({ navn: this.navn })
  }

  async hentTilstede(): Promise<Tilstede[]> {
    const p = PREFIX + this.navn + ':tilstede:'
    return nokler()
      .filter((k) => k.startsWith(p))
      .map((k) => JSON.parse(les(k) || 'null'))
      .filter(Boolean)
  }

  async fjernTilstede() {
    slett(PREFIX + this.navn + ':tilstede:' + this.bruker.id)
    this.kanal?.postMessage({ navn: this.navn })
  }

  lytt(cb: () => void) {
    const h = (e: MessageEvent) => {
      if (e.data?.navn === this.navn) cb()
    }
    this.kanal?.addEventListener('message', h)
    const s = (e: StorageEvent) => {
      if (e.key?.startsWith(PREFIX + this.navn + ':')) cb()
    }
    window.addEventListener('storage', s)
    return () => {
      this.kanal?.removeEventListener('message', h)
      window.removeEventListener('storage', s)
    }
  }
}
