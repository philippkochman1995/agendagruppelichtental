// The start screen shows Vienna from above with a few clouds drifting over it. On entering, the clouds slide up and out
// at different speeds (parallax) while the map zooms down to the Grätzl. See the exit timeline in App.tsx.
function mulberry(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Cloud = { x: number; y: number; w: number; v: 1 | 2 | 3 | 4; flip: boolean; o: number }

// x in % of the width, y in vh from the top of the layer, w in vw
function makeLayer(seed: number, n: number, y: [number, number], w: [number, number], o: number, wisps = 0): Cloud[] {
  const rnd = mulberry(seed)
  const out: Cloud[] = []
  for (let i = 0; i < n; i++) {
    let x = -8 + ((i + rnd() * 0.9) / n) * 116
    // keep the middle clear, so the map of Vienna is easy to read; the clouds frame it
    if (x > 22 && x < 78) x = x < 50 ? x - 34 : x + 34
    out.push({
      x,
      y: y[0] + rnd() * (y[1] - y[0]),
      w: w[0] + rnd() * (w[1] - w[0]),
      v: (1 + Math.floor(rnd() * 4)) as 1 | 2 | 3 | 4,
      flip: rnd() > 0.5,
      o,
    })
  }
  // a few small high clouds in the open sky
  for (let i = 0; i < wisps; i++) {
    out.push({ x: rnd() > 0.5 ? 4 + rnd() * 16 : 80 + rnd() * 16, y: 6 + rnd() * 30, w: 22 + rnd() * 16, v: (1 + Math.floor(rnd() * 4)) as 1 | 2 | 3 | 4, flip: rnd() > 0.5, o: 0.6 })
  }
  return out
}

// Where a layer lies at the start: the top ~100vh is what you see first.
// Clouds frame the view at the start (left and right), Vienna stays clearly visible in the middle
const LAYERS = [
  { name: 'far', clouds: makeLayer(5, 9, [0, 100], [38, 56], 0.85, 3) },
  { name: 'mid', clouds: makeLayer(17, 7, [4, 108], [60, 82], 0.92) },
  { name: 'near', clouds: makeLayer(29, 6, [20, 130], [86, 120], 0.96) },
]

// A few smaller clouds pass high behind the poster artwork and leave the story clear.
const POSTER_LAYERS = [
  { name: 'far', clouds: [
    { x: 10, y: 9, w: 34, v: 1, flip: false, o: 0.8 },
    { x: 81, y: 15, w: 38, v: 3, flip: true, o: 0.7 },
  ] },
  { name: 'mid', clouds: [
    { x: 28, y: 28, w: 30, v: 2, flip: true, o: 0.72 },
    { x: 92, y: 34, w: 40, v: 4, flip: false, o: 0.7 },
  ] },
  { name: 'near', clouds: [
    { x: 4, y: 43, w: 36, v: 4, flip: false, o: 0.66 },
  ] },
] satisfies { name: string; clouds: Cloud[] }[]

export function IntroClouds({ variant = 'default' }: { variant?: 'default' | 'poster' } = {}) {
  const layers = variant === 'poster' ? POSTER_LAYERS : LAYERS
  return (
    <div className="intro-clouds" aria-hidden="true">
      <div className="intro-sky" />
      {layers.map((layer) => (
        <div key={layer.name} className={`cl-layer cl-${layer.name}`}>
          {layer.clouds.map((c, i) => (
            <i
              key={i}
              className={`cl cl-v${c.v}`}
              style={{ left: `${c.x}%`, top: `${c.y}vh`, width: `${c.w}vw`, opacity: c.o, '--flip': c.flip ? -1 : 1, '--drift': `${(i % 4) * 5 + 26}s`, '--delay': `${-i * 3.3}s` } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
