/** overview / park: Grätzl-Ideen; traffic-*: the traffic tour (Bestand loud, Neu calmer, pedestrian zones with birds) */
export type AudioMode = 'overview' | 'park' | 'traffic-busy' | 'traffic-calm' | 'traffic-quiet'

interface AmbientHandle {
  stop: () => void
}

export interface AudioRuntime {
  context: AudioContext
  master: GainNode
  ambient: AmbientHandle | null
  mode: AudioMode | null
}

function createNoiseSource(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function stopNodes(nodes: Array<AudioNode | AudioScheduledSourceNode>, gain?: GainNode) {
  const context = gain?.context
  if (gain && context) {
    gain.gain.cancelScheduledValues(context.currentTime)
    gain.gain.setTargetAtTime(0, context.currentTime, 0.08)
  }
  window.setTimeout(() => {
    nodes.forEach((node) => {
      if ('stop' in node) {
        try { node.stop() } catch { /* source may already be stopped */ }
      }
      try { node.disconnect() } catch { /* node may already be disconnected */ }
    })
  }, 260)
}

export function createOverviewAmbient(runtime: AudioRuntime): AmbientHandle {
  const { context, master } = runtime
  const group = context.createGain()
  group.gain.value = 0.001
  group.connect(master)
  group.gain.setTargetAtTime(0.72, context.currentTime, 0.18)

  const city = createNoiseSource(context)
  const cityFilter = context.createBiquadFilter()
  cityFilter.type = 'lowpass'
  cityFilter.frequency.value = 760
  cityFilter.Q.value = 0.55
  const cityGain = context.createGain()
  cityGain.gain.value = 0.19
  city.connect(cityFilter).connect(cityGain).connect(group)

  const distance = createNoiseSource(context)
  const distanceFilter = context.createBiquadFilter()
  distanceFilter.type = 'bandpass'
  distanceFilter.frequency.value = 260
  distanceFilter.Q.value = 0.7
  const distanceGain = context.createGain()
  distanceGain.gain.value = 0.09
  distance.connect(distanceFilter).connect(distanceGain).connect(group)

  const hum = context.createOscillator()
  hum.type = 'sine'
  hum.frequency.value = 86
  const humGain = context.createGain()
  humGain.gain.value = 0.025
  hum.connect(humGain).connect(group)

  city.start()
  distance.start()
  hum.start()

  return { stop: () => stopNodes([city, distance, hum, cityFilter, distanceFilter, cityGain, distanceGain, humGain, group], group) }
}

export function createParkAmbient(runtime: AudioRuntime): AmbientHandle {
  const { context, master } = runtime
  const group = context.createGain()
  group.gain.value = 0.001
  group.connect(master)
  group.gain.setTargetAtTime(0.78, context.currentTime, 0.18)

  const leaves = createNoiseSource(context)
  const leafFilter = context.createBiquadFilter()
  leafFilter.type = 'bandpass'
  leafFilter.frequency.value = 1550
  leafFilter.Q.value = 0.8
  const leafGain = context.createGain()
  leafGain.gain.value = 0.075
  leaves.connect(leafFilter).connect(leafGain).connect(group)

  const softCity = createNoiseSource(context)
  const softCityFilter = context.createBiquadFilter()
  softCityFilter.type = 'lowpass'
  softCityFilter.frequency.value = 420
  const softCityGain = context.createGain()
  softCityGain.gain.value = 0.045
  softCity.connect(softCityFilter).connect(softCityGain).connect(group)

  const playBird = () => {
    const start = context.currentTime
    const birdGain = context.createGain()
    birdGain.gain.setValueAtTime(0.0001, start)
    birdGain.gain.exponentialRampToValueAtTime(0.07, start + 0.025)
    birdGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
    birdGain.connect(group)

    const bird = context.createOscillator()
    bird.type = 'sine'
    bird.frequency.setValueAtTime(1450 + Math.random() * 700, start)
    bird.frequency.exponentialRampToValueAtTime(2300 + Math.random() * 900, start + 0.08)
    bird.frequency.exponentialRampToValueAtTime(1700 + Math.random() * 600, start + 0.17)
    bird.connect(birdGain)
    bird.start(start)
    bird.stop(start + 0.2)
    window.setTimeout(() => {
      try { bird.disconnect(); birdGain.disconnect() } catch { /* already disconnected */ }
    }, 320)
  }

  leaves.start()
  softCity.start()
  const birdInterval = window.setInterval(playBird, 1700)
  window.setTimeout(playBird, 260)

  return {
    stop: () => {
      window.clearInterval(birdInterval)
      stopNodes([leaves, softCity, leafFilter, softCityFilter, leafGain, softCityGain, group], group)
    },
  }
}

/** A soft sweep: up when you zoom in, down when you zoom out (delay in seconds, e.g. after a click) */
export function playZoomSound(runtime: AudioRuntime, direction: 'in' | 'out' = 'in', delay = 0) {
  const { context, master } = runtime
  const start = context.currentTime + delay
  const [low, high] = direction === 'in' ? [180, 820] : [760, 170]
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.19, start + 0.06)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62)
  gain.connect(master)

  const sweep = context.createOscillator()
  sweep.type = 'triangle'
  sweep.frequency.setValueAtTime(low, start)
  sweep.frequency.exponentialRampToValueAtTime(high, start + 0.48)
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(direction === 'in' ? 500 : 1900, start)
  filter.frequency.exponentialRampToValueAtTime(direction === 'in' ? 1900 : 450, start + 0.5)
  sweep.connect(filter).connect(gain)
  sweep.start(start)
  sweep.stop(start + 0.64)

  window.setTimeout(() => {
    try { sweep.disconnect(); filter.disconnect(); gain.disconnect() } catch { /* already disconnected */ }
  }, 850 + delay * 1000)
}

export function playModalClickSound(runtime: AudioRuntime) {
  const { context, master } = runtime
  const start = context.currentTime
  const snapGain = context.createGain()
  snapGain.gain.setValueAtTime(0.0001, start)
  snapGain.gain.exponentialRampToValueAtTime(0.22, start + 0.004)
  snapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.038)
  snapGain.connect(master)

  const snap = createNoiseSource(context)
  const snapFilter = context.createBiquadFilter()
  snapFilter.type = 'bandpass'
  snapFilter.frequency.value = 2400
  snapFilter.Q.value = 1.8
  snap.connect(snapFilter).connect(snapGain)
  snap.start(start)
  snap.stop(start + 0.045)

  const knockGain = context.createGain()
  knockGain.gain.setValueAtTime(0.0001, start + 0.012)
  knockGain.gain.exponentialRampToValueAtTime(0.17, start + 0.018)
  knockGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095)
  knockGain.connect(master)

  const knock = context.createOscillator()
  knock.type = 'square'
  knock.frequency.setValueAtTime(185, start + 0.012)
  knock.frequency.exponentialRampToValueAtTime(105, start + 0.08)
  const knockFilter = context.createBiquadFilter()
  knockFilter.type = 'lowpass'
  knockFilter.frequency.value = 520
  knock.connect(knockFilter).connect(knockGain)
  knock.start(start + 0.012)
  knock.stop(start + 0.1)

  window.setTimeout(() => {
    try {
      snap.disconnect(); snapFilter.disconnect(); snapGain.disconnect()
      knock.disconnect(); knockFilter.disconnect(); knockGain.disconnect()
    } catch { /* already disconnected */ }
  }, 180)
}

/** A car passing by: filtered noise swelling up and away, with a falling engine tone */
function playCarPass(context: AudioContext, out: AudioNode, loudness: number) {
  const start = context.currentTime
  const length = 1.8 + Math.random() * 1.4
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(loudness, start + length * 0.45)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  gain.connect(out)
  const noise = createNoiseSource(context)
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(380, start)
  filter.frequency.linearRampToValueAtTime(720, start + length * 0.45)
  filter.frequency.linearRampToValueAtTime(300, start + length)
  noise.connect(filter).connect(gain)
  const engine = context.createOscillator()
  engine.type = 'sawtooth'
  engine.frequency.setValueAtTime(95 + Math.random() * 40, start)
  engine.frequency.linearRampToValueAtTime(70 + Math.random() * 20, start + length)
  const engineFilter = context.createBiquadFilter()
  engineFilter.type = 'lowpass'
  engineFilter.frequency.value = 260
  const engineGain = context.createGain()
  engineGain.gain.value = 0.35
  engine.connect(engineFilter).connect(engineGain).connect(gain)
  noise.start(start)
  engine.start(start)
  noise.stop(start + length + 0.05)
  engine.stop(start + length + 0.05)
  window.setTimeout(() => {
    try { noise.disconnect(); filter.disconnect(); engine.disconnect(); engineFilter.disconnect(); engineGain.disconnect(); gain.disconnect() } catch { /* already disconnected */ }
  }, (length + 0.3) * 1000)
}

/** A short car horn (two detuned tones) */
function playHorn(context: AudioContext, out: AudioNode) {
  const start = context.currentTime
  const length = 0.18 + Math.random() * 0.35
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02)
  gain.gain.setValueAtTime(0.09, start + length)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length + 0.06)
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1600
  filter.connect(gain).connect(out)
  const base = 380 + Math.random() * 90
  const tones = [base, base * 1.26].map((frequency) => {
    const tone = context.createOscillator()
    tone.type = 'square'
    tone.frequency.value = frequency
    tone.connect(filter)
    tone.start(start)
    tone.stop(start + length + 0.08)
    return tone
  })
  window.setTimeout(() => {
    try { tones.forEach((tone) => tone.disconnect()); filter.disconnect(); gain.disconnect() } catch { /* already disconnected */ }
  }, (length + 0.4) * 1000)
}

/** A bird call: two or three quick chirps */
function playChirps(context: AudioContext, out: AudioNode) {
  const count = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < count; i++) {
    const start = context.currentTime + i * 0.13
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11)
    gain.connect(out)
    const bird = context.createOscillator()
    bird.type = 'sine'
    bird.frequency.setValueAtTime(2200 + Math.random() * 900, start)
    bird.frequency.exponentialRampToValueAtTime(3200 + Math.random() * 800, start + 0.05)
    bird.frequency.exponentialRampToValueAtTime(2400 + Math.random() * 500, start + 0.1)
    bird.connect(gain)
    bird.start(start)
    bird.stop(start + 0.12)
    window.setTimeout(() => { try { bird.disconnect(); gain.disconnect() } catch { /* already disconnected */ } }, 600)
  }
}

/** Traffic tour: Bestand busy (dense traffic, horns), Neu calm (now and then a car), pedestrian zones quiet (birds, far-off city) */
export function createTrafficAmbient(runtime: AudioRuntime, level: 'busy' | 'calm' | 'quiet'): AmbientHandle {
  const { context, master } = runtime
  const group = context.createGain()
  group.gain.value = 0.001
  group.connect(master)
  group.gain.setTargetAtTime(level === 'busy' ? 0.95 : 0.78, context.currentTime, 0.25)

  const road = createNoiseSource(context)
  const roadFilter = context.createBiquadFilter()
  roadFilter.type = 'lowpass'
  roadFilter.frequency.value = level === 'busy' ? 900 : level === 'calm' ? 520 : 360
  const roadGain = context.createGain()
  roadGain.gain.value = level === 'busy' ? 0.3 : level === 'calm' ? 0.1 : 0.04
  road.connect(roadFilter).connect(roadGain).connect(group)
  road.start()

  const timers: number[] = []
  const every = (min: number, max: number, play: () => void) => {
    const next = () => {
      timers.push(window.setTimeout(() => { play(); next() }, min + Math.random() * (max - min)))
    }
    next()
  }
  if (level === 'busy') {
    every(350, 1100, () => playCarPass(context, group, 0.22 + Math.random() * 0.12))
    every(2200, 5200, () => playHorn(context, group))
    timers.push(window.setTimeout(() => playHorn(context, group), 700))
  } else if (level === 'calm') {
    every(3500, 7000, () => playCarPass(context, group, 0.1))
    every(4000, 8000, () => playChirps(context, group))
  } else {
    every(900, 2600, () => playChirps(context, group))
    timers.push(window.setTimeout(() => playChirps(context, group), 300))
  }

  return {
    stop: () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      stopNodes([road, roadFilter, roadGain, group], group)
    },
  }
}
