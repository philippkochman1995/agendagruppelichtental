export interface StreetPlan {
  id: string
  name: string
  image: string
  source: string
  /** Street centreline in the same local metre coordinates as graetzl.json. */
  route: [number, number][]
  width: number
}

export const streetPlans: Record<string, StreetPlan> = {
  badgasse: {
    id: 'badgasse', name: 'Badgasse', image: 'plans/badgasse-0.jpg',
    source: 'https://drive.google.com/file/d/1K-GBHXeHHhVumUgv9vF-L4WQ0hZ0qvDu/view',
    route: [[38.8,  199.3],  [42.8,  184.8],  [82.5,  41.2],  [109,  -58.7],  [111.7,  -68.9]], width: 29.7,
  },
  fechtergasse: {
    id: 'fechtergasse', name: 'Fechtergasse', image: 'plans/fechtergasse-0.jpg',
    source: 'https://drive.google.com/file/d/18ql51mGwebnErDWfswqSsI7NJ1I1cJOk/view',
    route: [[-15.3,  -117.5],  [-1.4,  -110.8],  [49.5,  -86.6],  [77.8,  -73.5],  [109,  -58.7],  [153.5,  -40.2],  [166.1,  -35.0]], width: 29.7,
  },
  lichtentaler: {
    id: 'lichtentaler', name: 'Lichtentaler Gasse', image: 'plans/lichtentaler-0.jpg',
    source: 'https://drive.google.com/file/d/1FQlQfJDpTjywtiBz2QeEIySDJ8xLmsWr/view',
    route: [[-126.1, -16.7], [-84.4, -5.2], [-34.5, 8.6], [19.9, 24.1], [82.5, 41.2], [138.1, 56.4]], width: 29.7,
  },
  marktgasse: {
    id: 'marktgasse', name: 'Marktgasse', image: 'plans/marktgasse-0.jpg',
    source: 'https://drive.google.com/file/d/1TumdeKzccZ7Mfb09ZSpcXgVN1y7X4Oyc/view',
    route: [[-94.6,  225.4],  [-67.9,  129.9],  [-34.5,  8.6],  [-1.4,  -110.8],  [15.2,  -172.3],  [33.3,  -237]], width: 29.7,
  },
  reznicekgasse: {
    id: 'reznicekgasse', name: 'Reznicekgasse', image: 'plans/reznicekgasse-0.jpg',
    source: 'https://drive.google.com/file/d/1_d0Mh3572__3Z3ojOEmWBC0Gw00Ukdqe/view',
    route: [[-153.1, 108.6], [-119.5, 116.5], [-67.9, 129.9], [-15.2, 151.2], [42.8, 184.8]], width: 29.7,
  },
  salzergasse: {
    id: 'salzergasse', name: 'Salzergasse', image: 'plans/salzergasse-0.jpg',
    source: 'https://drive.google.com/file/d/1_ZFPigvHV5fFzXofIYYyjws4Go7rCG7J/view',
    route: [[-122.2,  125.8],  [-119.5,  116.5],  [-84.4,  -5.2],  [-47.8,  -133.3],  [-45.5,  -141.4]], width: 29.7,
  },
  simondenk: {
    id: 'simondenk', name: 'Simon-Denk-Gasse', image: 'plans/simondenk-0.jpg',
    source: 'https://drive.google.com/file/d/1AzOV2R4Ze5u8wqeeYn7HK1rWu6kTxMXh/view',
    route: [[75.4,  -63.5],  [77.8,  -73.5],  [112.5,  -216.1],  [116.0,  -230.3]], width: 29.7,
  },
  wiesengasse: {
    id: 'wiesengasse', name: 'Wiesengasse', image: 'plans/wiesengasse-0.jpg',
    source: 'https://drive.google.com/file/d/1kCEa0M5IAe6duJn1ezW5egulN4kdVO82/view',
    route: [[-24.0,  183.0],  [-15.2,  151.2],  [19.9,  24.1],  [49.5,  -86.6],  [53.2,  -100.6]], width: 29.7,
  },
  badgasseReznicek: {
    id: 'badgasseReznicek', name: 'Badgasse / Reznicekgasse', image: 'plans/Badgasse-Reznicekgasse.jpg',
    source: 'https://drive.google.com/file/d/1FReV56ugER-QgYTqxMYpvSDGJ9ISbD5p/view',
    route: [[52, 151], [42.8, 184.8], [53.8, 214.6]], width: 29.7,
  },
}

// the three areas of the start view (north, middle, south)
const zonePlanIds: Record<string, string[]> = {
  'Newaldgasse & Reznicekgasse': ['reznicekgasse', 'badgasseReznicek'],
  'Lichtentaler Gasse & Badgasse': ['lichtentaler', 'wiesengasse', 'salzergasse', 'badgasse', 'simondenk'],
  'Fechtergasse & Thurygasse': ['marktgasse', 'fechtergasse'],
}

export function plansForZone(zoneName: string) {
  return (zonePlanIds[zoneName] ?? []).map((id) => streetPlans[id])
}

export function firstPlanForZone(zoneName: string) {
  return zonePlanIds[zoneName]?.[0] ?? null
}

export function hasStreetPlans(zoneName: string) {
  return Boolean(zonePlanIds[zoneName]?.length)
}
