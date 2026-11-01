// Versjonene som vises i «Om»-vinduet, nyeste først. Ny versjon: legg den øverst, med det brukerne merker.
// Skriv for vanlige brukere: hva de kan gjøre nå som de ikke kunne før, ikke hvordan det er laget.
export interface Versjon {
  versjon: string
  dato: string // ÅÅÅÅ-MM-DD
  oppsummering?: string
  nytt?: string[]
}

export const VERSJONER: Versjon[] = [
  {
    versjon: '3.0',
    dato: '2026-11-01',
    oppsummering:
      'Riskregisteret er flyttet fra Excel til nettleseren. Registeret ligger i prosjektets SharePoint-område, og flere kan jobbe i det samtidig.',
  },
]

export const GJELDENDE = VERSJONER[0]
