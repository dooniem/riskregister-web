// Demomodus: registeret ligger i liksom-SharePoint-lister i nettleseren og deles mellom faner.
// Samme lagringskode som mot SharePoint, så demoen viser hvordan registeret oppfører seg der.
import type { Register } from '../model'
import type { Bruker } from '../ops'
import { DemoLister, demoPrefix, les, nokler, slett } from './lister/demoLister'
import { ListeBackend, skrivNyttRegister } from './listeBackend'

const PREFIX = 'rr-demo:'
const LISTEMERKE = ':l:innstillinger'
// Eldre demoregistre lå som ett JSON-dokument under rr-demo:<navn>:doc
const GAMMELT = ':doc'

export function demoRegistre(): string[] {
  const navn = new Set<string>()
  for (const k of nokler()) {
    if (!k.startsWith(PREFIX)) continue
    if (k.endsWith(LISTEMERKE)) navn.add(k.slice(PREFIX.length, -LISTEMERKE.length))
    else if (k.endsWith(GAMMELT)) navn.add(k.slice(PREFIX.length, -GAMMELT.length))
  }
  return [...navn].sort()
}

export function demoFinnes(navn: string) {
  return les(PREFIX + navn + LISTEMERKE) !== null || les(PREFIX + navn + GAMMELT) !== null
}

export async function opprettDemo(navn: string, doc: Register) {
  const lager = new DemoLister(navn)
  lager.forsinkelseMs = 0
  await skrivNyttRegister(lager, doc)
}

export function slettDemo(navn: string) {
  for (const k of nokler()) if (k.startsWith(demoPrefix(navn))) slett(k)
}

// Flytter et demoregister fra det gamle formatet (ett JSON-dokument) over i lister
async function migrerGammel(navn: string) {
  const raw = les(PREFIX + navn + GAMMELT)
  if (!raw || les(PREFIX + navn + LISTEMERKE) !== null) return
  const { doc } = JSON.parse(raw) as { doc: Register }
  slettDemo(navn)
  await opprettDemo(navn, doc)
}

export async function demoBackend(navn: string, bruker: Bruker) {
  await migrerGammel(navn)
  return new ListeBackend(new DemoLister(navn, bruker.navn), bruker)
}
