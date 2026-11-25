/**
 * Traffic organisation of the Grätzl, read off the two plans in Drive
 * ("Verkehrsorganisation Bestand" / "Verkehrsorganisation neu", ToB Potenzialanalyse, 6.10.2022).
 * Coordinates are street-junction nodes in the same local metres as graetzl.json (x = east, y = north).
 */
export type TrafficMode = 'bestand' | 'neu'
type Pt = [number, number]

export interface TrafficFlow {
  /** Direction of travel: first point to last point. */
  path: Pt[]
  /** Two-way street: one lane in each direction. */
  both?: boolean
}

const N = {
  thuryW: [-85.5, -191.7], marktThury: [15.2, -172.3], markt0: [33.3, -237],
  marktFecht: [-1.4, -110.8], marktLicht: [-34.5, 8.6], marktRez: [-67.9, 129.9], marktNewald: [-94.6, 225.4],
  salzFecht: [-47.8, -133.3], salzLicht: [-84.4, -5.2], salzRez: [-119.5, 116.5],
  fechtW: [-87.4, -152.2],
  fechtWiese: [49.5, -86.6], fechtSimon: [77.8, -73.5], fechtBad: [109, -58.7], fechtAlt: [153.5, -40.2],
  wiesLicht: [19.9, 24.1], wiesRez: [-15.2, 151.2],
  lichtW: [-126.1, -16.7], lichtBad: [82.5, 41.2], lichtAlt: [138.1, 56.4],
  badRez: [42.8, 184.8], badAlt: [53.8, 214.6],
  simonS: [112.5, -216.1],
  rezW: [-153.1, 108.6],
  newaldW: [-153.6, 225], newaldAlt: [-56.5, 269.2],
} satisfies Record<string, Pt>

export const trafficConcepts: Record<TrafficMode, { label: string; color: string; flows: TrafficFlow[]; pedestrian?: Pt[][] }> = {
  bestand: {
    label: 'Bestand',
    color: '#d9453b',
    flows: [
      // one-way streets (light blue in the plan)
      { path: [N.fechtW, N.salzFecht, N.salzLicht, N.salzRez] },
      { path: [N.markt0, N.marktThury, N.marktFecht, N.marktLicht, N.marktRez, N.marktNewald] },
      { path: [N.newaldW, N.marktNewald, N.newaldAlt] },
      { path: [N.wiesRez, N.wiesLicht, N.fechtWiese] },
      { path: [N.fechtBad, N.lichtBad, N.badRez] },
      { path: [N.fechtSimon, N.simonS] },
      { path: [N.thuryW, N.marktThury] },
      // two-way streets (dark blue)
      { path: [N.rezW, N.salzRez, N.marktRez, N.wiesRez, N.badRez, N.badAlt], both: true },
      // Lichtentaler Gasse is cut by the park: no through traffic between Marktgasse and Wiesengasse
      { path: [N.lichtW, N.salzLicht, N.marktLicht], both: true },
      // east of Wiesengasse it is a one-way street towards Althanstraße
      { path: [N.wiesLicht, N.lichtBad, N.lichtAlt] },
      { path: [N.marktFecht, N.fechtWiese, N.fechtSimon, N.fechtBad, N.fechtAlt], both: true },
    ],
  },
  neu: {
    label: 'Neu',
    color: '#1b72f2',
    flows: [
      // Wohnstraßen neu (orange in the plan): one-way, entering and leaving via Liechtenstein-, Alserbach- and Althanstraße
      { path: [N.fechtW, N.salzFecht, N.salzLicht, N.salzRez, N.rezW] },
      { path: [N.thuryW, N.marktThury] },
      { path: [N.markt0, N.marktThury, N.marktFecht, N.fechtWiese, N.fechtSimon, N.simonS] },
      // Reznicekgasse runs WEST: it starts without an arrowhead at the Badgasse corner and ends in Marktgasse
      { path: [N.badRez, N.wiesRez, N.marktRez] },
      { path: [N.marktRez, N.marktNewald, N.newaldAlt] },
      { path: [N.wiesRez, N.wiesLicht, N.lichtBad, N.badRez] },
      // top right: Althanstraße can be entered and left here
      { path: [N.badRez, N.badAlt], both: true },
    ],
    // Fußgängerzonen neu (light green in the plan): cycling and access to private parking only
    pedestrian: [
      [N.newaldW, N.marktNewald],
      [N.salzRez, N.marktRez],
      [N.marktRez, N.marktLicht],
      [N.lichtW, N.salzLicht, N.marktLicht, N.wiesLicht, N.lichtBad, N.lichtAlt],
      [N.marktLicht, N.marktFecht],
      [N.wiesLicht, N.fechtWiese],
      [N.lichtBad, N.fechtBad],
      [N.marktFecht, N.fechtWiese, N.fechtSimon, N.fechtBad, N.fechtAlt],
    ],
  },
}
