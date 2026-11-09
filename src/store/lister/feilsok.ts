// Feilsøking når SharePoint avviser lagringen (f.eks. 507 quotaLimitReached på én rad i innstillingslisten).
// Leser plass og versjoner, og prøver å skrive den samme verdien på nytt på ulike måter, så vi ser hva som skiller.
// Endrer ikke innholdet: raden får samme verdi som den har, og prøveraden slettes igjen.
import { batch, graph, graphJson, jsonInit, sisteBatchFeil } from '../graph'
import type { Omraade } from './graphLister'

type Rad = { id: string; eTag?: string; fields?: Record<string, unknown> }

async function svar(r: Response) {
  let body: unknown
  try {
    body = await r.json()
  } catch {
    body = undefined
  }
  const feil = (body as { error?: { code?: string; message?: string } } | undefined)?.error
  return `${r.status}${feil ? ` ${feil.code ?? ''} ${feil.message ?? ''}` : ''}`.trim()
}

async function prov(navn: string, f: () => Promise<string>) {
  try {
    return `${navn}: ${await f()}`
  } catch (e) {
    return `${navn}: unntak ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function feilsok(omraade: Omraade, innstListeId: string | undefined, tilstedeListeId?: string): Promise<string> {
  const ut: string[] = [`Feilsøking ${new Date().toISOString()}`, `Område: ${omraade.webUrl}`, '']
  const sist = sisteBatchFeil
  ut.push('Siste avviste kall:', sist ? JSON.stringify(sist, null, 1) : '(ingen i denne økten)', '')

  ut.push(
    await prov('Lagringsplass (drive.quota)', async () => {
      const d = await graphJson<{ quota?: unknown }>(`/sites/${omraade.id}/drive?$select=quota`)
      return JSON.stringify(d.quota)
    }),
  )
  // Skriving i en annen liste (tilstedeværelse), så vi ser om feilen gjelder hele området eller bare innstillingslisten
  if (tilstedeListeId)
    ut.push(
      await prov('Ny prøverad i tilstedelisten', async () => {
        const l = `/sites/${omraade.id}/lists/${tilstedeListeId}`
        const r = await graph(`${l}/items`, jsonInit('POST', { fields: { Title: 'rr-feilsok' } }))
        const status = await svar(r.clone())
        if (!r.ok) return status
        const sl = await graph(`${l}/items/${((await r.json()) as Rad).id}`, { method: 'DELETE' })
        return `${status}, slettet igjen: ${sl.status}`
      }),
    )
  if (!innstListeId) return [...ut, 'Fant ikke innstillingslisten.'].join('\n')
  const liste = `/sites/${omraade.id}/lists/${innstListeId}`

  // Radene i innstillingslisten: størrelse og versjoner
  let rader: Rad[] = []
  try {
    rader = (await graphJson<{ value: Rad[] }>(`${liste}/items?$expand=fields($select=Title,Verdi,_UIVersionString,Modified)&$top=500`)).value
  } catch (e) {
    ut.push(`Kunne ikke lese innstillingslisten: ${e instanceof Error ? e.message : String(e)}`)
  }
  const versjoner = await batch(rader.map((r) => ({ method: 'GET', url: `${liste}/items/${r.id}/versions?$select=id&$top=500` })))
  ut.push('', 'Rader (id, nøkkel, tegn, versjon, antall versjoner):')
  rader.forEach((r, i) => {
    const v = versjoner[i]
    const antall = v.status === 200 ? `${(v.body as { value: unknown[] }).value.length}${(v.body as Record<string, unknown>)['@odata.nextLink'] ? '+' : ''}` : `feil ${v.status}`
    ut.push(`  ${r.id}  ${r.fields?.Title}  ${String(r.fields?.Verdi ?? '').length}  ${r.fields?._UIVersionString}  ${antall}`)
  })

  // Raden som ble avvist sist, ellers «lister»
  const avvistId = sist?.kall.url.includes(innstListeId) ? /items\/(\d+)/.exec(sist.kall.url)?.[1] : undefined
  const rad = rader.find((r) => r.id === avvistId) ?? rader.find((r) => r.fields?.Title === 'lister')
  if (!rad) return [...ut, '', 'Fant ingen rad å prøve.'].join('\n')
  const verdi = String(rad.fields?.Verdi ?? '')
  ut.push('', `Prøver rad ${rad.id} (${rad.fields?.Title}), samme verdi som den har:`)
  const felt = `${liste}/items/${rad.id}/fields`
  ut.push(await prov('  PATCH direkte', async () => svar(await graph(felt, jsonInit('PATCH', { Verdi: verdi })))))
  ut.push(
    await prov('  PATCH i $batch', async () => {
      const [s] = await batch([{ method: 'PATCH', url: felt, body: { Verdi: verdi } }])
      const f = (s.body as { error?: { code?: string; message?: string } } | undefined)?.error
      return `${s.status}${f ? ` ${f.code} ${f.message}` : ''}`
    }),
  )
  ut.push(await prov('  PATCH av Title alene', async () => svar(await graph(felt, jsonInit('PATCH', { Title: rad.fields?.Title })))))

  // Prøverad i samme liste: med samme verdi og med kort verdi. Slettes igjen med en gang.
  for (const [navn, v] of [
    ['samme verdi', verdi],
    ['kort verdi', 'x'],
  ] as const) {
    ut.push(
      await prov(`  Ny prøverad, ${navn}`, async () => {
        const r = await graph(`${liste}/items`, jsonInit('POST', { fields: { Title: 'rr-feilsok', Verdi: v } }))
        const status = await svar(r.clone())
        if (r.ok) {
          const id = ((await r.json()) as Rad).id
          const sl = await graph(`${liste}/items/${id}`, { method: 'DELETE' })
          return `${status}, slettet igjen: ${sl.status}`
        }
        return status
      }),
    )
  }
  return ut.join('\n')
}
