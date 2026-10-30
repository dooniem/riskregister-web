// Simulert kollega for demonstrasjon: flytter seg rundt i registeret, låser en risk,
// skriver i et tiltak og slipper låsen. Kjører som en egen bruker mot samme lagring.
import { demoBackend } from './store/demoBackend'
import { Okt } from './sync'

const FRASER = [
  'Fulgt opp i byggemøte, ny frist avtalt.',
  'Venter på tilbakemelding fra rådgiver.',
  'Avklart med byggherre.',
  'Tilbud mottatt, vurderes denne uken.',
]

const vent = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class SimulertKollega {
  private okt!: Okt
  private stopp = false
  private registerNavn: string
  private navn: string

  constructor(registerNavn: string, navn = 'Kari (simulert)') {
    this.registerNavn = registerNavn
    this.navn = navn
  }

  async start() {
    this.okt = new Okt(await demoBackend(this.registerNavn, { id: 'sim-' + this.navn.replace(/\W/g, ''), navn: this.navn }))
    await this.okt.start()
    if (this.stopp) return this.okt.stopp()
    void this.loop()
  }

  avslutt() {
    this.stopp = true
    if (!this.okt) return
    this.okt.slippLaas()
    this.okt.stopp()
  }

  private async loop() {
    while (!this.stopp) {
      const aapne = this.okt.doc.risker.filter((r) => r.status !== 'Lukket' && r.tiltak.length)
      if (!aapne.length) {
        await vent(3000)
        continue
      }
      const r = aapne[Math.floor(Math.random() * aapne.length)]
      const t = r.tiltak[Math.floor(Math.random() * r.tiltak.length)]
      // Står litt på risken før hun begynner å skrive
      this.okt.settPosisjon(r.id, 'hendelse')
      await vent(2500)
      if (this.stopp) break
      this.okt.settPosisjon(r.id, 'beskrivelse', t.id)
      await vent(1500)
      if (this.stopp) break
      if (this.okt.laas(r.id)) {
        await vent(2000)
        continue
      }
      await vent(5000) // «skriver»
      if (this.stopp) break
      const naa = this.okt.doc.risker.find((x) => x.id === r.id)?.tiltak.find((x) => x.id === t.id)
      if (naa) {
        const tekst = FRASER[Math.floor(Math.random() * FRASER.length)]
        this.okt.utfor({ t: 'setTiltak', riskId: r.id, tiltakId: t.id, felt: 'beskrivelse', verdi: tekst, fra: naa.beskrivelse })
      }
      this.okt.slippLaas()
      await vent(4000)
    }
  }
}
