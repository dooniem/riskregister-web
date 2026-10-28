// Åpner Excel-filer som er låst med passord (Fil › Info › Beskytt arbeidsbok › Krypter med passord).
// Biblioteket vi leser Excel med (SheetJS) kan ikke dekryptere, så det gjøres her med nettleserens egen kryptografi.
// En kryptert fil er en CFB-beholder med strømmene EncryptionInfo og EncryptedPackage. Excel 2010 og nyere bruker
// «Agile»-kryptering: AES med nøkkel avledet fra passordet med SHA-512 i 100 000 runder (MS-OFFCRYPTO 2.3.4.10–2.3.4.15).
// Passordet forlater aldri nettleseren.
import * as XLSX from 'xlsx'

export class FeilPassord extends Error {
  constructor() {
    super('Feil passord. Prøv igjen.')
  }
}

const BLOKK_NOKKEL = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6])
const BLOKK_VERIFIKATOR = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79])
const BLOKK_VERIFIKATOR_HASH = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e])
const SEGMENT = 4096

type Cfb = { FileIndex: { name: string; content: Uint8Array | number[] }[] }

function les(data: ArrayBuffer): Cfb | null {
  const b = new Uint8Array(data)
  // CFB-filer starter med D0 CF 11 E0. Vanlige xlsx-filer er zip (PK).
  if (b[0] !== 0xd0 || b[1] !== 0xcf || b[2] !== 0x11 || b[3] !== 0xe0) return null
  try {
    return XLSX.CFB.read(b, { type: 'array' }) as Cfb
  } catch {
    return null
  }
}

const strom = (cfb: Cfb, navn: string) => {
  const f = cfb.FileIndex.find((x) => x.name === navn)
  return f ? Uint8Array.from(f.content) : null
}

// Er dette en Excel-fil som er låst med passord?
export function erKryptert(data: ArrayBuffer): boolean {
  const cfb = les(data)
  return !!cfb && !!strom(cfb, 'EncryptionInfo') && !!strom(cfb, 'EncryptedPackage')
}

const HASH: Record<string, string> = { SHA512: 'SHA-512', SHA384: 'SHA-384', SHA256: 'SHA-256', SHA1: 'SHA-1' }

const slaaSammen = (...deler: Uint8Array[]) => {
  const ut = new Uint8Array(deler.reduce((n, d) => n + d.length, 0))
  let i = 0
  for (const d of deler) ut.set(d, (i += d.length) - d.length)
  return ut
}
const base64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer) // little endian i alle nettlesere vi støtter
// Kutt eller fyll ut til riktig lengde, som spesifikasjonen sier (utfylling med 0x36)
const tilpass = (b: Uint8Array, n: number) => (b.length >= n ? b.slice(0, n) : slaaSammen(b, new Uint8Array(n - b.length).fill(0x36)))

async function hash(alg: string, ...deler: Uint8Array[]) {
  return new Uint8Array(await crypto.subtle.digest(alg, slaaSammen(...deler)))
}

// AES-CBC uten utfylling. WebCrypto krever PKCS#7-utfylling, så vi lager en gyldig utfyllingsblokk og legger den til.
async function dekrypter(nokkel: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', nokkel as BufferSource, 'AES-CBC', false, ['encrypt', 'decrypt'])
  const siste = data.slice(data.length - 16)
  const fyll = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: siste as BufferSource }, k, new Uint8Array(16).fill(16))).slice(0, 16)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, slaaSammen(data, fyll)))
}

// Låser opp filen og returnerer den vanlige xlsx/xlsm-filen inni
export async function dekrypterExcel(data: ArrayBuffer, passord: string): Promise<ArrayBuffer> {
  const cfb = les(data)
  const info = cfb && strom(cfb, 'EncryptionInfo')
  const pakke = cfb && strom(cfb, 'EncryptedPackage')
  if (!info || !pakke) throw new Error('Filen er ikke kryptert.')
  const versjon = `${info[0] | (info[1] << 8)}.${info[2] | (info[3] << 8)}`
  if (versjon !== '4.4') throw new Error('Filen er kryptert på en eldre måte appen ikke kan åpne. Åpne den i Excel, fjern passordet, og importer på nytt.')

  const xml = new DOMParser().parseFromString(new TextDecoder().decode(info.slice(8)), 'application/xml')
  const keyData = xml.getElementsByTagName('keyData')[0]
  const ek = [...xml.getElementsByTagName('*')].find((e) => e.localName === 'encryptedKey' && e.getAttribute('spinCount'))
  if (!keyData || !ek) throw new Error('Fant ikke krypteringsinformasjonen i filen.')
  const a = (e: Element, n: string) => e.getAttribute(n) ?? ''

  // Nøkkelen fra passordet: H0 = H(salt + passord), så H(i + H) spinCount ganger
  const alg = HASH[a(ek, 'hashAlgorithm')] ?? 'SHA-512'
  const pw = new Uint8Array(passord.length * 2)
  for (let i = 0; i < passord.length; i++) {
    const c = passord.charCodeAt(i)
    pw[i * 2] = c & 0xff
    pw[i * 2 + 1] = c >> 8
  }
  let h = await hash(alg, base64(a(ek, 'saltValue')), pw)
  const runder = Number(a(ek, 'spinCount'))
  for (let i = 0; i < runder; i++) h = await hash(alg, u32(i), h)

  const nokkelLengde = Number(a(ek, 'keyBits')) / 8
  const ekSalt = base64(a(ek, 'saltValue'))
  const avled = async (blokk: Uint8Array) => tilpass(await hash(alg, h, blokk), nokkelLengde)

  // Sjekk passordet med verifikatoren før vi dekrypterer hele filen
  const input = await dekrypter(await avled(BLOKK_VERIFIKATOR), ekSalt, base64(a(ek, 'encryptedVerifierHashInput')))
  const forventet = await dekrypter(await avled(BLOKK_VERIFIKATOR_HASH), ekSalt, base64(a(ek, 'encryptedVerifierHashValue')))
  const faktisk = await hash(alg, input.slice(0, Number(a(ek, 'saltSize')) || 16))
  if (faktisk.some((b, i) => b !== forventet[i])) throw new FeilPassord()

  const hemmelig = (await dekrypter(await avled(BLOKK_NOKKEL), ekSalt, base64(a(ek, 'encryptedKeyValue')))).slice(0, Number(a(keyData, 'keyBits')) / 8)

  // Selve filen: 8 byte lengde, så segmenter på 4096 byte, hver med egen IV = H(salt + segmentnummer)
  const lengde = new DataView(pakke.buffer, pakke.byteOffset).getUint32(0, true)
  const kdAlg = HASH[a(keyData, 'hashAlgorithm')] ?? alg
  const kdSalt = base64(a(keyData, 'saltValue'))
  const blokk = Number(a(keyData, 'blockSize')) || 16
  const ut = new Uint8Array(Math.ceil((pakke.length - 8) / SEGMENT) * SEGMENT)
  for (let s = 0, pos = 8; pos < pakke.length; s++, pos += SEGMENT) {
    const iv = tilpass(await hash(kdAlg, kdSalt, u32(s)), blokk)
    ut.set(await dekrypter(hemmelig, iv, pakke.slice(pos, Math.min(pos + SEGMENT, pakke.length))), s * SEGMENT)
  }
  return ut.slice(0, lengde).buffer
}
