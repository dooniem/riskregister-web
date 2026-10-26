// Eksempeldata for demomodus. Fiktivt prosjekt.
import type { Register, Risk } from './model'
import { nyttRegister, uid } from './model'

type T = [tekst: string, eier: string, frist: string, beskrivelse: string, status: string]

function risk(nr: number, rm: 'R' | 'M', aarsak: string, hendelse: string, konsekvenser: string, eier: string, kategori: string, s: number, k: number, kost: [number, number, number], tiltak: T[], egendef = '', skarisk = false, status = 'Åpen'): Risk {
  return {
    id: uid(), nr, rm, aarsak, hendelse, konsekvenser, eier, status, kategori, egendef, sannsynlighet: s, konsekvens: k,
    bc: kost[0], ml: kost[1], wc: kost[2], tilSkarisk: skarisk,
    tiltak: tiltak.map(([tekst, e, frist, beskrivelse, st]) => ({ id: uid(), tekst, eier: e, frist, beskrivelse, status: st })),
  }
}

export function eksempelRegister(navn = 'Demo – Nytt kontorbygg'): Register {
  const reg = nyttRegister(navn)
  reg.prosjekt = { nummer: '9999', navn, eier: 'Eiendom AS', sjef: 'Kari Nordmann', leder: 'Ola Hansen', fase: 'B4-B6 Produksjon', virksomhet: 'Bygg', notering: 'Eksempelregister for demonstrasjon. Alle data er oppdiktet.' }
  reg.deltakere = [
    ['KN', 'Kari Nordmann', 'Prosjektsjef', 'Risikoeier'],
    ['OH', 'Ola Hansen', 'Prosjektleder', 'Risikoeier'],
    ['IB', 'Ingrid Berg', 'Prosjekteringsleder', 'Tiltakseier'],
    ['PL', 'Per Larsen', 'Innkjøper', 'Tiltakseier'],
    ['SM', 'Siri Moe', 'HMS-leder', 'Tiltakseier'],
    ['AJ', 'Anders Johansen', 'Prosjektøkonom', 'Fasilitator'],
    ['TS', 'Tone Solberg', 'Arbeidsleder', 'Kompetanseressurs'],
  ].map(([initialer, n, rolleProsjekt, rolleRisk]) => ({ id: uid(), initialer, navn: n, rolleProsjekt, rolleRisk }))
  reg.gjennomganger = [
    { id: uid(), dato: '2026-08-20', signatur: 'KN, OH, IB, PL, AJ', fasilitator: 'Anders Johansen' },
    { id: uid(), dato: '2026-10-01', signatur: 'KN, OH, IB, SM, AJ, TS', fasilitator: 'Anders Johansen' },
  ]
  reg.risker = [
    risk(1, 'R', 'Grunnundersøkelser er mangelfulle i nordre del av tomta.', 'Dårligere grunnforhold enn antatt ved utgraving.', 'Økt omfang av peling og masseutskifting, forsinkelse på grunnarbeider.', 'Ola Hansen', 'Tekniske løsninger', 3, 4, [500, 1500, 4000], [
      ['Supplerende grunnboringer før oppstart graving', 'Ingrid Berg', '2026-11-15', 'Bestilt, venter på rigg', 'Pågår'],
      ['Avklare med byggherre hvem som bærer risikoen for grunnforhold', 'Kari Nordmann', '2026-11-01', '', 'Ikke startet'],
    ], 'BH', true),
    risk(2, 'R', 'Stramt marked for stålleveranser.', 'Forsinket levering av stålkonstruksjoner.', 'Montasje forskyves, følgefag forsinkes.', 'Per Larsen', 'Innkjøp', 4, 3, [200, 800, 2500], [
      ['Inngå avtale med alternativ leverandør', 'Per Larsen', '2026-10-30', 'To tilbud mottatt', 'Pågår'],
      ['Legge inn buffer i fremdriftsplan for montasje', 'Ola Hansen', '2026-10-20', 'Lagt inn 2 uker', 'Utført'],
    ], 'Internt', true),
    risk(3, 'R', 'Mange UE på byggeplass samtidig i innredningsfasen.', 'Fallulykke fra stillas eller kant.', 'Personskade, stans i arbeid, omdømmetap.', 'Siri Moe', 'HMS', 2, 5, [0, 300, 2000], [
      ['Ukentlig vernerunde med fokus på kantsikring', 'Siri Moe', '2026-12-31', 'Gjennomføres hver torsdag', 'Pågår'],
      ['SJA for alt arbeid i høyden', 'Tone Solberg', '', '', 'Pågår'],
    ]),
    risk(4, 'M', 'Byggherre ønsker energiklasse A.', 'Solceller på tak kan prises som tilleggsarbeid.', 'Økt dekningsbidrag.', 'Kari Nordmann', 'Kunde', 3, 3, [300, 700, 1200], [
      ['Utarbeide tilbud på solcelleanlegg', 'Ingrid Berg', '2026-11-20', '', 'Ikke startet'],
    ], 'BH'),
    risk(5, 'R', 'Prosjekteringen av tekniske fag ligger etter plan.', 'Mangelfulle tegninger ved oppstart av tekniske installasjoner.', 'Venting, omprosjektering på byggeplass, kollisjoner mellom fag.', 'Ingrid Berg', 'Prosjektering/ rådgivere', 4, 4, [400, 1200, 3000], [
      ['Ukentlige tverrfaglige BIM-kontroller', 'Ingrid Berg', '2026-11-30', 'Startet uke 41', 'Pågår'],
      ['Varsle rådgiver skriftlig om forsinkelse', 'Kari Nordmann', '2026-10-15', 'Sendt', 'Utført'],
      ['Prioriteringsliste for leveranser per etasje', 'Ola Hansen', '2026-10-28', '', 'Ikke startet'],
    ], 'Internt', true),
    risk(6, 'R', 'Kontrakten har uklar grensesnittbeskrivelse mot byggherres leverandører.', 'Uenighet om ansvar for sikringsanlegg og adgangskontroll.', 'Krav og motkrav, tapt tid i oppfølging.', 'Kari Nordmann', 'Kontrakt', 3, 2, [100, 250, 600], [
      ['Grensesnittmatrise avklares i byggemøte', 'Ola Hansen', '2026-11-05', '', 'Ikke startet'],
    ], 'BH'),
    risk(7, 'M', 'Gjenbruk av rigg fra nabotomt.', 'Lavere riggkostnader enn kalkulert.', 'Redusert kostnad på rigg og drift.', 'Ola Hansen', 'Rigg og logistikk', 4, 2, [150, 300, 450], [
      ['Avtale overtakelse av brakkerigg', 'Per Larsen', '2026-10-25', 'Muntlig enighet', 'Pågår'],
    ], 'Internt'),
    risk(8, 'R', 'Vinterarbeid med betong i desember og januar.', 'Frost og lav temperatur forsinker herding.', 'Behov for oppvarming og tildekking, forsinkelse.', 'Tone Solberg', 'Egenproduksjon', 4, 2, [150, 400, 900], [
      ['Bestille vinterpakke (duk, varme)', 'Tone Solberg', '2026-11-10', '', 'Ikke startet'],
      ['Vurdere akselerator i betongen', 'Ingrid Berg', '2026-11-10', '', 'Ikke startet'],
    ], 'Internt'),
    risk(9, 'R', 'Ny reguleringsplan for gata utenfor.', 'Kommunen krever endret avkjørsel.', 'Ekstra arbeid og byggesøknad.', 'Kari Nordmann', 'Myndigheter', 2, 3, [50, 200, 700], [
      ['Dialogmøte med kommunen', 'Kari Nordmann', '2026-11-12', '', 'Ikke startet'],
    ], 'BH'),
    risk(10, 'R', 'Høy turnover hos UE for tømrerarbeider.', 'Kvalitetsavvik på innvendige vegger.', 'Utbedring og forsinket overlevering.', 'Ola Hansen', 'UE', 3, 3, [100, 350, 800], [
      ['Innføre sjekkliste og stikkprøver per etasje', 'Tone Solberg', '2026-10-31', '', 'Pågår'],
    ], 'Internt'),
    risk(11, 'M', 'Rammeavtale for heis gir mulighet for volumrabatt.', 'Rabatt hvis bestilling skjer samlet med to andre prosjekt.', 'Lavere innkjøpskostnad.', 'Per Larsen', 'Innkjøp', 2, 3, [0, 150, 300], [
      ['Koordinere bestilling med region', 'Per Larsen', '2026-11-30', '', 'Ikke startet'],
    ]),
    risk(12, 'R', 'Overvann fra nabotomt.', 'Vanninntrenging i byggegrop ved kraftig regn.', 'Pumping, skader på armering og forskaling.', 'Ola Hansen', 'Ytre Miljø', 2, 2, [0, 80, 300], [
      ['Midlertidig grøft og pumpekum', 'Tone Solberg', '2026-09-15', 'Etablert', 'Utført'],
    ], '', false, 'Lukket'),
  ]
  // Fag med farger, og hvilke risker som hører til hvilket fag
  const fag = ['Grunnarbeid', 'Betong', 'Stål', 'Tekniske fag', 'Innredning', 'HMS'].map((navn, farge) => ({ id: uid(), navn, kort: navn.slice(0, 3).toUpperCase(), farge }))
  reg.lister.fag = fag
  const fordeling: Record<number, number> = { 1: 0, 2: 2, 3: 5, 4: 3, 5: 3, 7: 0, 8: 1, 9: 0, 10: 4, 11: 3, 12: 0 }
  for (const r of reg.risker) if (fordeling[r.nr] !== undefined) r.fag = fag[fordeling[r.nr]].id
  reg.nesteNr = 13
  // Oppdiktet historikk, så info i høyreklikkmenyen har noe å vise
  const dagerSiden = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
  reg.risker.forEach((r, i) => {
    r.opprettet = dagerSiden(60 - i * 3)
    r.opprettetAv = 'Magnus'
    r.endret = dagerSiden(12 - i)
    r.endretAv = r.eier || 'Magnus'
    if (r.status === 'Lukket') {
      r.lukket = r.endret
      r.lukketAv = r.endretAv
    }
  })
  return reg
}
