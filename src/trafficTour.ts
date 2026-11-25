import type { TrafficMode } from './traffic'

/**
 * Guided tour through the traffic concept: Bestand first, then Neu.
 * Texts follow the project documents (Forderungen Website, Supergrätzl-Infobroschüre der Stadt Wien).
 */
export interface TourStep {
  concept: TrafficMode
  title: string
  text: string
  /** whole Grätzl, or close up on the Lichtentaler Park and the lanes around it */
  focus: 'all' | 'park'
  /** show the pedestrian zones of the new concept in this step */
  pedestrians: boolean
}

/** The park and the lanes around it, from Reznicekgasse to Fechtergasse and Salzergasse to Althanstraße (metres east / north of the Grätzl centre) */
export const PARK_FOCUS = { x: 8, y: -5, width: 260, height: 270 }

export const tourSteps: TourStep[] = [
  {
    concept: 'bestand',
    title: 'Aktuell',
    text: 'Heute nehmen Fahrbahnen und parkende Autos den Platz ein, den die Ideen der Nachbar:innen brauchen: Bäume, Sitzplätze, Spielflächen. Ohne neues Verkehrskonzept bleibt für mehr Lebensqualität zu wenig Raum.',
    focus: 'all',
    pedestrians: false,
  },
  {
    concept: 'neu',
    title: 'Neu: Verkehr in Schlaufen',
    text: 'Einbahn-Schlaufen führen von den Hauptstraßen hinein und wieder hinaus: keine Abkürzungen, weniger Autos, Ziele im Grätzl bleiben erreichbar. Wohnstraßen in Blau.',
    focus: 'all',
    pedestrians: false,
  },
  {
    concept: 'neu',
    title: 'Neu: Fußgängerzonen',
    text: 'Rund um den Park werden die Gassen zu Fußgängerzonen (grün). Radfahren und die Zufahrt zu Stellplätzen bleiben erlaubt.',
    focus: 'park',
    pedestrians: true,
  },
]

export const firstStepOf = (concept: TrafficMode) => tourSteps.findIndex((step) => step.concept === concept)

/** Tree tour: first the trees as they stand (Aktuell), then the new ones (Neu), then what they do to a street in summer */
export type TreesView = 'aktuell' | 'neu'
export interface TreeStep { view: TreesView; title: string; text: string; /** bluish cool zone on the Reznicekgasse, camera on that street */ cool: boolean }

export const treeSteps: TreeStep[] = [
  {
    view: 'aktuell',
    title: 'Aktuell',
    text: 'Studio LAUT hat kartiert, wo im Lichtental Bäume wirklich Platz haben, auch unter Garageneinfahrten und Einbauten hindurch. Das Ergebnis: 134 neue Stadtbäume sind möglich.',
    cool: false,
  },
  {
    view: 'neu',
    title: 'Neu: 100 neue Bäume',
    text: 'Hier stehen alle 134 möglichen Standorte aus der Kartierung (gelb bis orange). Viele davon haben Nachbar:innen in den Workshops eingefordert. Wir fordern 100 neue Bäume fürs Lichtental.',
    cool: false,
  },
  {
    view: 'neu',
    title: 'Neu: Kühler im Sommer',
    text: 'Wie wirkt das? Neue Bäume spenden Schatten und kühlen die Luft, hier in der Reznicekgasse (blau). Das hilft gegen Hitzeinseln und ist eine Frage der sozialen Gerechtigkeit.',
    cool: true,
  },
]

export const firstTreeStepOf = (view: TreesView) => treeSteps.findIndex((step) => step.view === view)

/**
 * Garagen-Initiative: four measures from the neighbourhood, each a station of its own (texts from the Forderungen).
 * The map shows parked cars on the streets that move into the garages step by step.
 */
export type GarageMeasure = 'station' | 'garage' | 'sharing' | 'loading'
export interface GarageStep { stage: GarageMeasure; label: string; title: string; text: string }

export const garageSteps: GarageStep[] = [
  {
    stage: 'station',
    label: 'Bahnhof',
    title: 'Garagenstellplätze unter dem Franz-Josefs-Bahnhof schaffen',
    text: 'Unter dem Franz-Josefs-Bahnhof stehen noch viele Flächen frei, die ohne große Umbauten ideal für Parkplätze genutzt werden können. Gerade für Anrainer:innen, die ihr Auto einmal pro Woche nutzen, ist das eine sehr passende Alternative zum Parken im öffentlichen Raum.',
  },
  {
    stage: 'garage',
    label: 'Garage',
    title: 'Leerstehende Garagen im Grätzl besser nutzen',
    text: 'Die Garagen im Grätzl sind zu einem Großteil nicht ausgelastet. Durch gezielte Förderungen wird das Parken dort attraktiver. Das bietet sich vor allem für Nachbar:innen an, die in ihrer Mobilität eingeschränkt sind, da für sie ein weiter entfernter Garagenplatz keine Lösung ist.',
  },
  {
    stage: 'sharing',
    label: 'Sharing',
    title: 'Die gemeinsame Nutzung von Verkehrsmitteln',
    text: 'Damit nicht jede:r auf ein eigenes Auto angewiesen ist, braucht es ein niederschwelliges und leistbares Shared Mobility Angebot.',
  },
  {
    stage: 'loading',
    label: 'Ladezonen',
    title: 'Spezialisierte Parkplätze',
    text: 'Für Geschäfte und Dienstleister:innen im Lichtental gibt es ausgewiesene Ladezonen. Und natürlich werden bei Bedarf auch Behindertenparkplätze gezielt ausgebaut, damit die, die sie dringend brauchen, auch tatsächlich einen freien Platz finden. Diese Maßnahmen entfalten ihre größte Wirkung nicht einzeln, sondern zusammen.',
  },
]
