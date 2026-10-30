// Kall mot Microsoft Graph med brukerens eget token (delegerte tillatelser)
import { token } from './auth'

export const GRAPH = 'https://graph.microsoft.com/v1.0'

export class GraphFeil extends Error {
  status: number
  constructor(status: number, melding: string) {
    super(melding)
    this.status = status
  }
}

const vent = (ms: number) => new Promise((res) => setTimeout(res, ms))

export async function graph(sti: string, init: RequestInit = {}): Promise<Response> {
  const t = await token()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${t}`)
  for (let forsok = 0; ; forsok++) {
    const r = await fetch(sti.startsWith('http') ? sti : GRAPH + sti, { ...init, headers })
    // Struping fra SharePoint: vent det Graph ber om og prøv igjen
    if ((r.status === 429 || r.status === 503) && forsok < 4) {
      await vent((Number(r.headers.get('Retry-After')) || 2 ** forsok) * 1000)
      continue
    }
    return r
  }
}

export async function graphJson<T>(sti: string, init?: RequestInit): Promise<T> {
  const r = await graph(sti, init)
  if (!r.ok) throw new GraphFeil(r.status, await feiltekst(r))
  return r.json()
}

export const jsonInit = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

export function feilmelding(status: number, melding = '') {
  if (status === 401) return 'Innloggingen er utløpt. Last siden på nytt.'
  if (status === 403) return 'Du har ikke tilgang til dette i SharePoint.'
  if (status === 404) return 'Fant det ikke i SharePoint. Er adressen riktig, og har du tilgang?'
  return melding || `Feil fra SharePoint (${status})`
}

export async function feiltekst(r: Response) {
  let melding = ''
  try {
    const j = await r.json()
    melding = j?.error?.message ?? ''
  } catch {
    // ingen feiltekst i svaret
  }
  return feilmelding(r.status, melding)
}

export interface BatchKall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url: string // relativ til /v1.0, f.eks. /sites/…/lists/…/items
  body?: unknown
  headers?: Record<string, string>
}

export interface BatchSvar {
  status: number
  body?: unknown
}

// Sender mange kall i grupper på 20 med $batch. Kall som blir strupet, sendes på nytt etter ventetiden SharePoint ber om.
export async function batch(kall: BatchKall[]): Promise<BatchSvar[]> {
  const svar: BatchSvar[] = new Array(kall.length)
  let gjenstaar = kall.map((_, i) => i)
  for (let runde = 0; gjenstaar.length && runde < 6; runde++) {
    const neste: number[] = []
    let ventSek = 0
    for (let i = 0; i < gjenstaar.length; i += 20) {
      const gruppe = gjenstaar.slice(i, i + 20)
      const requests = gruppe.map((n) => {
        const k = kall[n]
        const headers = { ...(k.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...k.headers }
        return { id: String(n), method: k.method, url: k.url, ...(k.body !== undefined ? { body: k.body } : {}), ...(Object.keys(headers).length ? { headers } : {}) }
      })
      const r = await graphJson<{ responses: { id: string; status: number; body?: unknown; headers?: Record<string, string> }[] }>('/$batch', jsonInit('POST', { requests }))
      for (const s of r.responses) {
        const n = Number(s.id)
        if (s.status === 429 || s.status === 503) {
          neste.push(n)
          ventSek = Math.max(ventSek, Number(s.headers?.['Retry-After']) || 2 ** runde)
        } else svar[n] = { status: s.status, body: s.body }
      }
    }
    gjenstaar = neste
    if (ventSek) await vent(ventSek * 1000)
  }
  for (const n of gjenstaar) svar[n] = { status: 429 }
  return svar
}

export function batchFeil(s: BatchSvar) {
  const melding = (s.body as { error?: { message?: string } } | undefined)?.error?.message
  return new GraphFeil(s.status, feilmelding(s.status, melding))
}
