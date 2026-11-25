/** Street scans cut into tiles (<= 4096 px wide, 448 px tall) so they load and render smoothly on phones.
 *  u0/u1: share of the whole strip (along the street) covered by each tile. */
export interface PlanTile { file: string; u0: number; u1: number }

export const planTiles: Record<string, PlanTile[]> = {
  "badgasse": [
    {
      "file": "badgasse-0.jpg",
      "u0": 0.0,
      "u1": 0.49987948903350204
    },
    {
      "file": "badgasse-1.jpg",
      "u0": 0.49987948903350204,
      "u1": 1.0
    }
  ],
  "fechtergasse": [
    {
      "file": "fechtergasse-0.jpg",
      "u0": 0.0,
      "u1": 1.0
    }
  ],
  "lichtentaler": [
    {
      "file": "lichtentaler-0.jpg",
      "u0": 0.0,
      "u1": 0.4998797209526101
    },
    {
      "file": "lichtentaler-1.jpg",
      "u0": 0.4998797209526101,
      "u1": 1.0
    }
  ],
  "marktgasse": [
    {
      "file": "marktgasse-0.jpg",
      "u0": 0.0,
      "u1": 0.5000662163951795
    },
    {
      "file": "marktgasse-1.jpg",
      "u0": 0.5000662163951795,
      "u1": 1.0
    }
  ],
  "reznicekgasse": [
    {
      "file": "reznicekgasse-0.jpg",
      "u0": 0.0,
      "u1": 1.0
    }
  ],
  "salzergasse": [
    {
      "file": "salzergasse-0.jpg",
      "u0": 0.0,
      "u1": 0.50011460004584
    },
    {
      "file": "salzergasse-1.jpg",
      "u0": 0.50011460004584,
      "u1": 1.0
    }
  ],
  "simondenk": [
    {
      "file": "simondenk-0.jpg",
      "u0": 0.0,
      "u1": 1.0
    }
  ],
  "wiesengasse": [
    {
      "file": "wiesengasse-0.jpg",
      "u0": 0.0,
      "u1": 0.5001105460977228
    },
    {
      "file": "wiesengasse-1.jpg",
      "u0": 0.5001105460977228,
      "u1": 1.0
    }
  ],
  "badgasseReznicek": [
    {
      "file": "Badgasse-Reznicekgasse.jpg",
      "u0": 0,
      "u1": 1
    }
  ]
}
