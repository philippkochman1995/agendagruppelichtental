import { IntroUnicorn } from './IntroUnicorn'
import { IntroScenery } from './IntroScenery'
import { IntroClouds } from './IntroClouds'
import { IntroPhotos } from './IntroPhotos'
import { PosterBackdrop, PosterIntro } from './PosterIntro'

// Select the active start screen design.
const INTRO_THEME = 'poster' as 'poster' | 'green' | 'cloudy' | 'classic' | 'illustrated'
import { createIntroCloudReveal } from './introCloudReveal'
import { glyphDataUrl } from './cleanMarkers'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrafficMode } from './traffic'
import { AboutPanel } from './AboutPanel'
import { MapDock, readTourDone, writeTourDone, type AppMode, type GarageView, type TourInsets, type TreesView } from './MapDock'
import { PARK_FOCUS, firstStepOf, firstTreeStepOf, garageSteps, tourSteps, treeSteps } from './trafficTour'
import { categories, initialVisibleCategoryIds, mapLayers } from './layers'
import { featureHasDetail, getDemoDetail } from './demoDetails'
import { MAP_LOOK } from './mapConfig'
import { featureId, queryUrl } from './arcgis'
import { gsap } from 'gsap'
import { IsoMap, type IsoFeature } from './iso/IsoMap'
import {
  createOverviewAmbient,
  createParkAmbient,
  createTrafficAmbient,
  playModalClickSound,
  playZoomSound,
  type AudioMode,
  type AudioRuntime,
} from './mapAudio'
import type { CategoryId, FeatureSummary, GeoJsonFeatureCollection } from './types'

/** Trees, Aktuell: close on the Lichtentaler Park and a little around it */
const TREES_PARK_FOCUS = { x: 8, y: -5, width: 165, height: 175 }

function App() {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const isoRef = useRef<IsoMap | null>(null)
  const isoHandlersRef = useRef<{ click(feature: IsoFeature): void; zone(name: string): void; background(): void }>({ click: () => {}, zone: () => {}, background: () => {} })
  const parkFocusedRef = useRef(false)
  const zoneFocusedRef = useRef(false)
  const audioRuntimeRef = useRef<AudioRuntime | null>(null)
  const detailCloseTimerRef = useRef<number | null>(null)
  const legendTriggerRef = useRef<HTMLButtonElement>(null)
  const legendPanelRef = useRef<HTMLElement>(null)
  const detailPanelRef = useRef<HTMLElement>(null)
  const skyRef = useRef<HTMLDivElement>(null)
  const introDrawRef = useRef<((progress: number) => void) | null>(null)
  const introCloudRef = useRef<HTMLCanvasElement>(null)
  // Constant from the first frame on, so nothing is restyled at the moment of the click.
  const introVeilStyle = useMemo(() => ({ '--veil': 1, '--blur': '20px', '--tint': INTRO_THEME === 'green' ? 0.93 : INTRO_THEME === 'cloudy' ? 0.45 : INTRO_THEME === 'classic' ? 0.6 : 0.97 }) as React.CSSProperties, [])
  const [mapWarm, setMapWarm] = useState(false)
  const [uiVisible, setUiVisible] = useState(false)
  /** right after the start screen: a short note on the switch at the bottom, before the area names come in */
  const [startHint, setStartHint] = useState<'off' | 'on' | 'done'>('off')
  const [visible, setVisible] = useState<Set<CategoryId>>(() => new Set(initialVisibleCategoryIds))
  const [legendOpen, setLegendOpen] = useState(false)
  /** the info about the project, from the button at the top right of the start view */
  const [aboutOpen, setAboutOpen] = useState(false)
  const [selected, setSelected] = useState<FeatureSummary | null>(null)
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [holding, setHolding] = useState(false)
  const [holdHintDone, setHoldHintDone] = useState(false)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [tourInsets, setTourInsets] = useState<TourInsets | null>(null)
  const [cardLeft, setCardLeft] = useState<number | null>(null)
  const [treeStep, setTreeStep] = useState<number | null>(null)
  const [garageStep, setGarageStep] = useState<number | null>(null)
  const [garageView, setGarageView] = useState<GarageView>('bestand')
  const [treesView, setTreesView] = useState<TreesView>('neu')
  const holdPlansRef = useRef<(active: boolean) => void>(() => {})
  const [traffic, setTraffic] = useState<TrafficMode>('bestand')
  const [appMode, setAppMode] = useState<AppMode>('ideas')
  const appModeRef = useRef<AppMode>('ideas')
  appModeRef.current = appMode
  const [detailClosing, setDetailClosing] = useState(false)
  const [isZoneFocused, setIsZoneFocused] = useState(false)
  const [isAreaView, setIsAreaView] = useState(false)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState<Set<CategoryId>>(new Set())
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioMode, setAudioMode] = useState<AudioMode>('overview')
  const [introOpen, setIntroOpen] = useState(true)
  const [introLeaving, setIntroLeaving] = useState(false)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [],
  )

  const ensureAudioRuntime = useCallback(() => {
    const existing = audioRuntimeRef.current
    if (existing) return existing
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const context = new AudioContextConstructor()
    const master = context.createGain()
    master.gain.value = 0.42
    master.connect(context.destination)
    const runtime: AudioRuntime = { context, master, ambient: null, mode: null }
    audioRuntimeRef.current = runtime
    return runtime
  }, [])

  const stopAmbient = useCallback(() => {
    const runtime = audioRuntimeRef.current
    if (!runtime) return
    runtime.ambient?.stop()
    runtime.ambient = null
    runtime.mode = null
  }, [])

  const startAmbient = useCallback(async (mode: AudioMode) => {
    const runtime = ensureAudioRuntime()
    await runtime.context.resume()
    if (runtime.mode === mode && runtime.ambient) return runtime
    runtime.ambient?.stop()
    runtime.ambient = mode === 'park' ? createParkAmbient(runtime)
      : mode === 'traffic-busy' ? createTrafficAmbient(runtime, 'busy')
        : mode === 'traffic-calm' ? createTrafficAmbient(runtime, 'calm')
          : mode === 'traffic-quiet' ? createTrafficAmbient(runtime, 'quiet')
            : createOverviewAmbient(runtime)
    runtime.mode = mode
    return runtime
  }, [ensureAudioRuntime])

  const setAudioScene = useCallback((mode: AudioMode, withZoomSound = false) => {
    setAudioMode(mode)
    if (!audioEnabled) return
    void startAmbient(mode).then((runtime) => {
      if (withZoomSound) playZoomSound(runtime)
    })
  }, [audioEnabled, startAmbient])

  const playModalClick = useCallback(() => {
    if (!audioEnabled) return
    void startAmbient(parkFocusedRef.current ? 'park' : 'overview').then(playModalClickSound)
  }, [audioEnabled, startAmbient])

  const openDetail = useCallback((summary: FeatureSummary) => {
    if (detailCloseTimerRef.current !== null) {
      window.clearTimeout(detailCloseTimerRef.current)
      detailCloseTimerRef.current = null
    }
    setDetailClosing(false)
    setLegendOpen(false)
    setSelectedZone(null)
    setSelected(summary)
  }, [])

  const closeDetail = useCallback(() => {
    if (detailCloseTimerRef.current !== null) return
    setDetailClosing(true)
    detailCloseTimerRef.current = window.setTimeout(() => {
      setSelected(null)
      setSelectedZone(null)
      setDetailClosing(false)
      detailCloseTimerRef.current = null
    }, 260)
  }, [])

  const unlockAudioRef = useRef(() => {})
  unlockAudioRef.current = () => {
    try { void ensureAudioRuntime().context.resume() } catch { /* no audio on this device */ }
  }
  // the sound starts by itself as soon as the map is there (after "Supergrätzl entdecken")
  const audioAutoStarted = useRef(false)
  useEffect(() => {
    if (!uiVisible || introOpen || audioAutoStarted.current) return
    audioAutoStarted.current = true
    setAudioEnabled(true)
    setAudioMode('overview')
    void startAmbient('overview').catch(() => setAudioEnabled(false))
  }, [uiVisible, introOpen, startAmbient])

  // traffic tour: loud for Bestand, calmer for Neu, birds once the pedestrian zones come; trees and garages keep the city sound
  useEffect(() => {
    if (appMode === 'ideas') return
    if (appMode === 'traffic') {
      const step = tourStep !== null ? tourSteps[tourStep] : null
      setAudioScene(traffic === 'bestand' ? 'traffic-busy' : step?.pedestrians ? 'traffic-quiet' : 'traffic-calm')
    } else setAudioScene('overview')
  }, [appMode, traffic, tourStep, setAudioScene])

  const toggleAudio = useCallback(() => {
    if (audioEnabled) {
      stopAmbient()
      setAudioEnabled(false)
      return
    }
    const mode: AudioMode = parkFocusedRef.current ? 'park' : 'overview'
    setAudioMode(mode)
    setAudioEnabled(true)
    void startAmbient(mode)
  }, [audioEnabled, startAmbient, stopAmbient])

  /** Press and hold on the map: the scanned plans show while held (icons step aside) */
  const holdPlans = useCallback((active: boolean) => {
    // only the ideas mode peeks at the scans; trees and traffic keep their own picture
    if (appModeRef.current !== 'ideas') return
    isoRef.current?.setPlansVisible(active)
    isoRef.current?.setPinsHidden(active)
    setHolding(active)
    if (active) setHoldHintDone(true)
  }, [])
  holdPlansRef.current = holdPlans

  // the layover stays for a few seconds once you are in an area, then gets out of the way
  useEffect(() => {
    if (!isAreaView || appMode !== 'ideas' || holdHintDone) return
    const timer = window.setTimeout(() => setHoldHintDone(true), 9000)
    return () => window.clearTimeout(timer)
  }, [isAreaView, appMode, holdHintDone])

  // Grätzl-Ideen: the pedestrian zones of the new concept, once you are inside an area (not at the start view)
  useEffect(() => {
    // while the scans show (hold), the zones step aside so the plans are readable
    isoRef.current?.setBasePedestrianZones(appMode === 'ideas' && isAreaView && !holding)
  }, [appMode, isAreaView, holding])

  // the note shows for a few seconds once the map and its controls are there, then the area names appear
  useEffect(() => {
    if (!uiVisible || introOpen || startHint !== 'off') return
    // once the switch at the bottom has faded in
    const timer = window.setTimeout(() => setStartHint('on'), 900)
    return () => window.clearTimeout(timer)
  }, [uiVisible, introOpen, startHint])
  useEffect(() => {
    if (startHint !== 'on') return
    // about 3 seconds, or gone as soon as you touch or click anywhere
    const timer = window.setTimeout(() => setStartHint('done'), 2900)
    const dismiss = () => setStartHint('done')
    window.addEventListener('pointerdown', dismiss, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', dismiss, true)
    }
  }, [startHint])
  useEffect(() => { if (appMode !== 'ideas' && startHint === 'on') setStartHint('done') }, [appMode, startHint])

  /** Guided tour: Bestand first, then Neu; the concept follows the step */
  const goTour = useCallback((step: number) => {
    const { concept, pedestrians } = tourSteps[step]
    const iso = isoRef.current
    if (concept !== traffic) {
      iso?.setPedestrianZones(pedestrians)
      iso?.setTrafficMode(concept, true)
    } else iso?.setPedestrianZones(pedestrians, true)
    setTraffic(concept)
    setTourStep(step)
  }, [traffic])
  const closeTour = useCallback(() => {
    isoRef.current?.setPedestrianZones(true, true)
    setTourStep(null)
    writeTourDone()
  }, [])

  /** Tree tour: Aktuell, then Neu, then the cooler street; the view follows the step */
  const goTreeStep = useCallback((step: number) => {
    setTreesView(treeSteps[step].view)
    setTreeStep(step)
  }, [])
  const closeTreeTour = useCallback(() => setTreeStep(null), [])
  const chooseTreesView = useCallback((view: TreesView) => {
    if (treeStep !== null) { goTreeStep(firstTreeStepOf(view)); return }
    setTreesView(view)
  }, [goTreeStep, treeStep])

  // the trees on the map follow the view and the step (the bluish cool zone belongs to the last step)
  useEffect(() => {
    const iso = isoRef.current
    if (!iso || appMode !== 'trees') return
    iso.setTreesView(treesView === 'neu')
    iso.setCoolZone(treesView === 'neu' && (treeStep === null || treeSteps[treeStep].cool))
  }, [appMode, treesView, treeStep])

  /** Garagen-Initiative: Bahnhof, Garage, Sharing, Ladezonen. Opening the tour again replays it from the parked streets. */
  const goGarageStep = useCallback((step: number) => {
    if (garageStep === null) isoRef.current?.setGarageStage('start', false)
    setGarageStep(step)
  }, [garageStep])
  const closeGarageTour = useCallback(() => { setGarageView('neu'); setGarageStep(null) }, [])
  /** Bestand: the cars parked on the streets; Neu: all measures at once (the cars glide over) */
  const chooseGarageView = useCallback((view: GarageView) => {
    setGarageStep(null)
    setGarageView(view)
  }, [])

  // the garage scene follows the step; with the tour closed it shows Bestand or Neu
  useEffect(() => {
    const iso = isoRef.current
    if (!iso || appMode !== 'garages') return
    iso.setGarageStage(garageStep !== null ? garageSteps[garageStep].stage : garageView === 'neu' ? 'all' : 'start', garageStep !== null)
  }, [appMode, garageStep, garageView])

  const chooseTraffic = useCallback((mode: TrafficMode) => {
    if (tourStep !== null) { goTour(firstStepOf(mode)); return }
    if (mode !== traffic) {
      isoRef.current?.setPedestrianZones(true)
      isoRef.current?.setTrafficMode(mode, true)
    }
    setTraffic(mode)
  }, [goTour, tourStep, traffic])

  const returnToOverview = useCallback(() => {
    parkFocusedRef.current = false
    zoneFocusedRef.current = false
    setIsZoneFocused(false)
    closeDetail()
    setAudioScene('overview')
    const iso = isoRef.current
    if (iso) void iso.flyTo(iso.startView(), 1050)
  }, [closeDetail, setAudioScene])

  /** Grätzl ideas (icons / scans), the traffic concept, the new trees or the garages; all but the ideas start from above */
  const chooseAppMode = useCallback((next: AppMode) => {
    const iso = isoRef.current
    if (!iso || next === appMode) return
    // leave the current mode
    setTourStep(null)
    setTreeStep(null)
    setGarageStep(null)
    iso.setTrafficMode(null)
    iso.setTreesView(false)
    iso.setCoolZone(false)
    iso.setGarageStage(null)
    iso.setCalmHouses(next === 'traffic' || next === 'garages')
    setAppMode(next)
    if (next === 'ideas') {
      iso.setFreeView(false)
      iso.setPlansVisible(false)
      iso.setPinsHidden(false)
      returnToOverview()
      return
    }
    closeDetail()
    setLegendOpen(false)
    iso.setPlansVisible(false)
    iso.setPinsHidden(true)
    iso.setFreeView(true)
    // the first time each topic opens with its tour (from how it is now to the new concept); after that straight with the new concept
    if (next === 'traffic') {
      const seen = readTourDone()
      iso.setPedestrianZones(true)
      iso.setTrafficMode(seen ? 'neu' : 'bestand')
      setTraffic(seen ? 'neu' : 'bestand')
      setTourStep(seen ? null : 0)
      writeTourDone()
    } else if (next === 'trees') {
      const seen = readTourDone('trees')
      setTreesView(seen ? 'neu' : 'aktuell')
      setTreeStep(seen ? null : 0)
      writeTourDone('trees')
    } else {
      // garages: the first time the parked cars first (Bestand), then straight on to the first station
      const seen = readTourDone('garages')
      if (!seen) iso.setGarageStage('start')
      setGarageView(seen ? 'neu' : 'bestand')
      setGarageStep(seen ? null : 0)
      writeTourDone('garages')
    }
  }, [appMode, closeDetail, returnToOverview])

  // the camera follows the tour: whole Grätzl or the park area, kept clear of the card
  useEffect(() => {
    const iso = isoRef.current
    if (appMode === 'ideas' || !iso) return
    const cardOpen = appMode === 'traffic' ? tourStep !== null : appMode === 'trees' ? treeStep !== null : garageStep !== null
    const focus = appMode === 'traffic' && tourStep !== null && tourSteps[tourStep].focus === 'park' ? PARK_FOCUS
      : appMode === 'trees' && treeStep !== null && treeSteps[treeStep].cool ? iso.coolFocus()
        // trees: Aktuell close on the park, Neu a bit wider (the new trees, not the whole Grätzl)
        : appMode === 'trees' && treeStep === 0 ? TREES_PARK_FOCUS
        : appMode === 'trees' && treeStep === 1 ? PARK_FOCUS
        : appMode === 'garages' ? iso.garageFocus(garageStep === null ? 'all' : garageSteps[garageStep].stage) : undefined
    const beside = cardOpen && tourInsets?.sideWidth ? { width: tourInsets.sideWidth, gap: 28 } : undefined
    const insets = cardOpen ? { left: 8, right: 8, bottom: tourInsets?.bottom } : {}
    const view = iso.trafficView(focus, insets, beside)
    setCardLeft(view.cardLeft ?? null)
    let cancelled = false
    void iso.flyTo(view, 1000).then(() => {
      // at the Bahnhof and the garage the camera moves in closer while the cars arrive
      if (cancelled || appMode !== 'garages' || garageStep === null) return
      const stage = garageSteps[garageStep].stage
      if (stage === 'station' || stage === 'garage') void iso.flyTo(iso.trafficView(iso.garageFocus(stage, true), insets, beside), 2600)
    })
    return () => { cancelled = true }
  }, [appMode, tourStep, tourInsets, treeStep, garageStep])

  // 3D engine: clicks on pins, routes and areas (kept current every render, the scene calls through the ref)
  isoHandlersRef.current = {
    click: (feature: IsoFeature) => {
      const iso = isoRef.current
      if (!iso) return
      if (feature.layer.id === 'stay') {
        if (parkFocusedRef.current) {
          returnToOverview()
          return
        }
        closeDetail()
        parkFocusedRef.current = true
        zoneFocusedRef.current = true
        setIsZoneFocused(true)
        setAudioScene('park', true)
        void iso.flyToBounds(feature.bounds)
        return
      }
      if (!featureHasDetail(feature.properties)) return
      playModalClick()
      openDetail({
        layerId: feature.layer.id,
        layerLabel: feature.layer.label,
        categoryId: feature.category.id,
        featureId: featureId(feature.properties),
        properties: feature.properties,
        zoneName: feature.zoneName,
      })
    },
    zone: (name) => {
      if (detailCloseTimerRef.current !== null) {
        window.clearTimeout(detailCloseTimerRef.current)
        detailCloseTimerRef.current = null
      }
      setDetailClosing(false)
      setLegendOpen(false)
      setSelected(null)
      setSelectedZone(null)
    },
    background: () => {
      if (zoneFocusedRef.current) returnToOverview()
    },
  }

  // 3D engine (three.js): build the city, load every data layer behind the intro, then allow the start
  useEffect(() => {
    if (!mapElementRef.current || isoRef.current) return
    const iso = new IsoMap(mapElementRef.current, {
      onFeatureClick: (feature) => isoHandlersRef.current.click(feature),
      onZoneClick: (name) => isoHandlersRef.current.zone(name),
      onBackgroundClick: () => isoHandlersRef.current.background(),
      onHoldPlans: (active) => holdPlansRef.current(active),
      onAreaViewChange: (inArea) => {
        setIsAreaView(inArea)
        if (!inArea) {
        }
      },
      // the drifting clouds fade away as soon as you zoom in
      onZoom: (zoom) => skyRef.current?.style.setProperty('--sky-zoom', String(Math.max(0, Math.min(1, (17.3 - zoom) / 1.1)))),
    })
    // start screen: Lichtental is not highlighted yet, it looks like the rest of the city
    if (INTRO_THEME === 'poster' && introOpen) iso.setGraetzlHighlighted(false)
    isoRef.current = iso
    let cancelled = false
    if (!introOpen) void iso.ready.then(() => {
      if (cancelled) return
      iso.jumpTo(iso.startView())
      iso.setGraetzlHighlighted(true)
      iso.setRevealed(true)
      iso.setInteractive(true)
      setUiVisible(true)
    })
    void (async () => {
      await iso.ready
      await Promise.allSettled(mapLayers.map(async (layer) => {
        const category = categoryById.get(layer.categoryId)!
        try {
          const response = await fetch(queryUrl(layer), { signal: AbortSignal.timeout(12_000) })
          if (!response.ok) throw new Error(`${layer.label}: ${response.status}`)
          const geojson = await response.json() as GeoJsonFeatureCollection
          if (cancelled) return
          iso.addLayer(layer, category, geojson, visibleRef.current.has(layer.categoryId))
        } catch {
          if (!cancelled) setErrors((current) => new Set(current).add(layer.id))
        }
      }))
      if (cancelled) return
      setLoaded(new Set(categories.map((category) => category.id)))
      setMapWarm(true)
    })()
    return () => {
      cancelled = true
      iso.dispose()
      isoRef.current = null
    }
  }, [categoryById])

  useEffect(() => {
    const iso = isoRef.current
    if (iso) categories.forEach((category) => iso.setCategoryVisible(category.id, visible.has(category.id)))
  }, [visible])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (aboutOpen) return
      if (selected || selectedZone) closeDetail()
      else if (legendOpen) setLegendOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeDetail, selected, selectedZone, legendOpen, aboutOpen])

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (legendOpen && !legendPanelRef.current?.contains(target) && !legendTriggerRef.current?.contains(target)) setLegendOpen(false)
      if ((selected || selectedZone) && !detailPanelRef.current?.contains(target) && !(target instanceof Element && target.closest('.plan-lightbox'))) closeDetail()
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer, true)
  }, [closeDetail, legendOpen, selected, selectedZone])

  useEffect(() => () => {
    const runtime = audioRuntimeRef.current
    if (detailCloseTimerRef.current !== null) window.clearTimeout(detailCloseTimerRef.current)
    if (!runtime) return
    runtime.ambient?.stop()
    void runtime.context.close()
    audioRuntimeRef.current = null
  }, [])

  const enterMap = useCallback((categoryIds: CategoryId[] | null) => {
    if (categoryIds) setVisible(new Set(categoryIds))
    // the click may start sound: unlock it now, it plays once the map is there
    unlockAudioRef.current()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const iso = isoRef.current
      if (iso) {
        iso.jumpTo(iso.startView())
        revealIso()
      }
      setIntroOpen(false)
    } else setIntroLeaving(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3D engine: markers, UI and interaction only after the intro flight
  const revealIso = useCallback(() => {
    setUiVisible(true)
    isoRef.current?.setRevealed(true)
    isoRef.current?.setInteractive(true)
  }, [])

  // Build the cloud mask ahead of time so the click can start the animation without a hitch.
  useEffect(() => {
    if (!introOpen || introDrawRef.current) return
    const canvas = introCloudRef.current
    if (canvas && canvas.clientWidth > 0) introDrawRef.current = createIntroCloudReveal(canvas)
  }, [introOpen, mapWarm])

  useEffect(() => {
    if (!introLeaving) return
    const flyIso = isoRef.current
    let restrictTimer: number | undefined
    if (flyIso) restrictTimer = window.setTimeout(revealIso, 7800)
    const canvas = introCloudRef.current
    if (!canvas) {
      setIntroOpen(false)
      return
    }

    const draw = introDrawRef.current ?? createIntroCloudReveal(canvas)
    const reveal = { progress: 0 }
    draw(0)
    const overlay = canvas.parentElement
    if (!overlay) {
      setIntroOpen(false)
      return
    }
    const panel = overlay.querySelector('.intro-panel')
    const sky = overlay.querySelectorAll('.intro-scenery, .sketch-sky, .poster-art')
    const partSelector = INTRO_THEME === 'poster'
      ? '.poster-brand, .poster-statement, .poster-story, .intro-button'
      : 'h1, .sketch-unicorn, .intro-photos, p, .intro-button'
    const parts = panel ? Array.from(panel.querySelectorAll(partSelector)) : []
    gsap.set(parts, { transition: 'none' })
    const timeline = gsap.timeline({ defaults: { ease: 'sine.inOut' }, onComplete: () => setIntroOpen(false) })
    if (INTRO_THEME === 'green') {
      // the green panel simply clears while the camera zooms down into the Grätzl
      timeline
        .to(parts, { opacity: 0, y: -10, duration: .22, ease: 'power1.out' }, 0)
        .call(() => {
          if (flyIso) void flyIso.flyTo(flyIso.startView(), 3000).then(revealIso)
        }, [], 0.02)
        .to(overlay, { '--veil': 0, duration: 1, ease: 'power1.inOut' }, 0.12)
      return () => { timeline.kill(); if (restrictTimer !== undefined) window.clearTimeout(restrictTimer) }
    }
    const clouds = INTRO_THEME === 'cloudy'
    const flyCamera = () => {
      if (INTRO_THEME === 'poster') {
        // Zoom from directly above first; only tilt after the Grätzl fills the view.
        flyIso?.setGraetzlHighlighted(true)
        if (flyIso) void flyIso.flyTo(flyIso.topView(), 3600).then(() => flyIso.flyTo(flyIso.startView(), 1500)).then(revealIso)
        return
      }
      if (flyIso) void flyIso.flyTo(flyIso.startView(), 2650).then(revealIso)
    }
    if (clouds) {
      // The camera dives through the clouds: they grow towards the viewer and dissolve (the nearer, the sooner),
      // a short fog thickens and clears, and the map zooms in to the Grätzl at the same time.
      const layer = (name: string) => overlay.querySelector(`.cl-${name}`)
      const origin = `${Math.round(window.innerWidth / 2)}px ${Math.round(window.innerHeight * 0.48)}px`
      const fog = overlay.querySelector('.intro-sky')
      timeline
        .to(parts, { opacity: 0, duration: .18, ease: 'power1.out' }, 0)
        .call(() => {
          // 3D map: from Vienna straight down onto the Grätzl, still from above; the tilt comes once we are there
          if (flyIso) void flyIso.flyTo(flyIso.topView(), 4000).then(() => flyIso.flyTo(flyIso.startView(), 1600)).then(revealIso)
        }, [], 0.02)
        .set([layer('near'), layer('mid'), layer('far')], { transformOrigin: origin }, 0)
        .to(layer('near'), { scale: 4.2, duration: 1.7, ease: 'power2.in' }, 0)
        .to(layer('near'), { opacity: 0, duration: .8, ease: 'power1.in' }, .8)
        .to(layer('mid'), { scale: 3, duration: 2.1, ease: 'power2.in' }, .05)
        .to(layer('mid'), { opacity: 0, duration: .9, ease: 'power1.in' }, 1.15)
        .to(layer('far'), { scale: 2.2, duration: 2.5, ease: 'power2.in' }, .1)
        .to(layer('far'), { opacity: 0, duration: 1, ease: 'power1.in' }, 1.55)
        .to(fog, { '--fog': .85, duration: .7, ease: 'sine.out' }, .25)
        .to(fog, { '--fog': 0, duration: 1.3, ease: 'sine.in' }, 1)
    } else {
      timeline
        // the type simply fades; the clouds thin out and the camera flies into the map
        .to(parts, { opacity: 0, duration: .25, ease: 'power1.out' }, 0)
        .to(sky, { opacity: 0, duration: .3, ease: 'power1.out' }, 0)
        .to(canvas, { opacity: 1, duration: .25, ease: 'power1.out' }, 0)
        .call(flyCamera, [], 0.04)
        .to(reveal, { progress: 1, duration: 2.35, onUpdate: () => draw(reveal.progress) }, 0.05)
        // once the clouds cover the map, the expensive blur is dropped unnoticed
        .call(() => overlay.classList.add('is-veil-flat'), [], 0.3)
        .to(overlay, { '--veil': 0, duration: 2.05 }, 0.35)
    }
    return () => { timeline.kill(); if (restrictTimer !== undefined) window.clearTimeout(restrictTimer) }
  }, [introLeaving, revealIso])

  const toggleCategory = (id: CategoryId) => {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setAll = (on: boolean) => setVisible(new Set(on ? categories.map((category) => category.id) : []))
  const detail = selected ? getDemoDetail(selected) : null
  const selectedCategory = selected ? categoryById.get(selected.categoryId) : null

  return (
    <main className={`app-shell look-${MAP_LOOK} engine-iso ${uiVisible ? '' : 'ui-pending'}`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <filter id="sketch-line" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="sketch-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <section className={`map-stage ${isAreaView || isZoneFocused ? 'is-area-view' : ''} ${startHint !== 'done' ? 'is-start-hint' : ''}`} id="map" aria-label="Interaktive 3D-Karte von Liechtenthal">
        <div ref={mapElementRef} className="map-canvas" inert={introOpen} />

        {!introOpen && (
          <div className="map-title" aria-hidden="true">
            <span className="map-title-script" data-text="Supergrätzl">Supergrätzl</span>
            <span className="map-title-block">Lichtental</span>
          </div>
        )}

        <div ref={skyRef} className={`sky-overlay ${isZoneFocused ? 'is-hidden' : ''}`} aria-hidden="true">
          <span className="cloud cloud-one" />
          <span className="cloud cloud-two" />
          <span className="cloud cloud-three" />
        </div>

        <button className="overview-back" type="button" aria-label="Zurück zur Startansicht" onClick={() => (appMode !== 'ideas' && isoRef.current ? void isoRef.current.flyTo(isoRef.current.trafficView(), 1050) : returnToOverview())} inert={introOpen || (!isAreaView && !isZoneFocused) || appMode !== 'ideas'} style={appMode !== 'ideas' ? { display: 'none' } : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5 4 10l5 5" /><path d="M4 10h10a6 6 0 0 1 0 12" /></svg>
          <span>Zurück</span>
        </button>

        {startHint === 'on' && (
          <div className="start-hint" role="status" onClick={() => setStartHint('done')}>
            Unten findest du unsere Forderungen. Einfach draufklicken und entdecken!
          </div>
        )}

        {!introOpen && appMode === 'ideas' && (holding || (isAreaView && !holdHintDone)) && (
          <div className={`hold-hint ${holding ? 'is-holding' : ''}`} role="status">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v8" /><path d="M9 7.5V6a1.5 1.5 0 0 1 3 0M15 9.5V8a1.5 1.5 0 0 0-3 0M18 12v-1a1.5 1.5 0 0 0-3 0" /><path d="M9 7.5v5.2l-1.6-1.7a1.6 1.6 0 0 0-2.3 2.2L9 18a5 5 0 0 0 3.6 1.5H14a4 4 0 0 0 4-4V12" /></svg>
            <span>{holding ? 'Gescannte Pläne aus den Workshops' : 'Karte gedrückt halten, um die Pläne aus den Workshops zu sehen'}</span>
          </div>
        )}

        {!introOpen && (
          <MapDock
            mode={appMode}
            onMode={chooseAppMode}
            traffic={traffic}
            onTraffic={chooseTraffic}
            tourStep={tourStep}
            onTourStep={goTour}
            onTourClose={closeTour}
            cardLeft={cardLeft}
            treeStep={treeStep}
            onTreeStep={goTreeStep}
            onTreeClose={closeTreeTour}
            treesView={treesView}
            onTreesView={chooseTreesView}
            garageStep={garageStep}
            onGarageStep={goGarageStep}
            onGarageClose={closeGarageTour}
            garageView={garageView}
            onGarageView={chooseGarageView}
            onTourInsets={(insets) => setTourInsets((current) => (current?.sideWidth === insets?.sideWidth && current?.bottom === insets?.bottom ? current : insets))}
          />
        )}

        <button className={`audio-trigger ${audioEnabled ? 'is-on' : ''}`} type="button" aria-label={audioEnabled ? 'Audio ausschalten' : 'Audio einschalten'} aria-pressed={audioEnabled} onClick={toggleAudio} inert={introOpen || appMode !== 'ideas' || isAreaView || isZoneFocused} style={appMode !== 'ideas' || isAreaView || isZoneFocused ? { opacity: 0, pointerEvents: 'none' } : undefined}>
          <svg className="audio-icon" viewBox="0 0 28 28" aria-hidden="true">
            <path d="M6.6 23.2c-.5-3 .2-6.3-.1-9.4" />
            <path d="M12.3 23c.3-4.4-.4-8.6.1-13.6" />
            <path d="M18.2 23.3c-.4-6.2.5-12.1-.2-18.4" />
            <path d="M24 22.8c-.2-3.4.4-6.4-.1-10.2" />
          </svg>
        </button>

        {!introOpen && (
          <button
            className="about-trigger"
            type="button"
            aria-label="Über das Supergrätzl Lichtental"
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen(true)}
            inert={appMode !== 'ideas' || isAreaView || isZoneFocused}
            style={appMode !== 'ideas' || isAreaView || isZoneFocused ? { opacity: 0, pointerEvents: 'none' } : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" /><path d="M12 11v5.5" /><circle cx="12" cy="7.6" r=".6" /></svg>
            <span>Info</span>
          </button>
        )}

        {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}

        {!introOpen && appMode === 'ideas' && !isAreaView && !isZoneFocused && (
          <a className="made-by" href="https://studiovis.at" target="_blank" rel="noopener">made by studiovis</a>
        )}

        {legendOpen && (
          <aside ref={legendPanelRef} className="legend-panel" id="legend-panel" aria-label="Kartenfilter">
            <div className="panel-heading">
              <div><span className="kicker">Karteninhalt</span><h2>Was möchtest du sehen?</h2></div>
              <button className="icon-button" type="button" onClick={() => setLegendOpen(false)} aria-label="Filter schließen"><svg className="sketch-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
            <div className="legend-actions">
              <button type="button" onClick={() => setAll(true)}>Alle zeigen</button><span aria-hidden="true">·</span><button type="button" onClick={() => setAll(false)}>Alle aus</button>
            </div>
            <div className="category-list">
              {categories.map((category) => {
                const layerCount = mapLayers.filter((layer) => layer.categoryId === category.id).length
                const errorCount = mapLayers.filter((layer) => layer.categoryId === category.id && errors.has(layer.id)).length
                const isVisible = visible.has(category.id)
                return (
                  <label className={`category-row ${isVisible ? 'is-active' : ''}`} key={category.id}>
                    <input type="checkbox" checked={isVisible} onChange={() => toggleCategory(category.id)} />
                    <span className="category-swatch" style={{ '--category-color': category.color } as React.CSSProperties} aria-hidden="true"><img src={glyphDataUrl(category.id)} alt="" /></span>
                    <span className="category-copy"><strong>{category.label}</strong><small>{category.description}</small></span>
                    <span className="category-meta">{errorCount ? `${errorCount} Fehler` : loaded.has(category.id) ? layerCount : isVisible ? 'lädt …' : layerCount}</span>
                  </label>
                )
              })}
            </div>
            {errors.size > 0 && <p className="load-note">Einzelne Datenquellen sind gerade nicht erreichbar. Die übrige Karte bleibt nutzbar.</p>}
          </aside>
        )}

        {((selected && detail && selectedCategory) || selectedZone) && (
          <aside ref={detailPanelRef} className={`detail-panel ${selectedZone ? 'is-zone-panel' : ''} ${detailClosing ? 'is-closing' : ''}`} aria-label={selectedZone ? `Straßenpläne für ${selectedZone}` : `Details zu ${selected?.layerLabel}`}>
            <button className="icon-button detail-close" type="button" onClick={closeDetail} aria-label="Details schließen"><svg className="sketch-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            {selectedZone ? (
              <h2>{selectedZone}</h2>
            ) : selected && detail && selectedCategory ? (
              <>
                <p className="detail-category">{selectedCategory.label} · {selected.layerLabel}</p>
                <h2>{detail.title}</h2>
                {detail.description && <p className="detail-description">{detail.description}</p>}
              </>
            ) : null}
          </aside>
        )}

        {introOpen && (
          <div className={`intro-overlay ${INTRO_THEME === 'illustrated' ? 'intro-illustrated' : INTRO_THEME === 'green' || INTRO_THEME === 'poster' ? '' : 'intro-classic'} intro-${INTRO_THEME} ${introLeaving ? 'is-leaving' : ''}`} style={introVeilStyle} role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-description">
            {INTRO_THEME === 'poster' ? <PosterBackdrop /> : INTRO_THEME === 'green' ? null : INTRO_THEME === 'cloudy' ? <IntroClouds /> : INTRO_THEME === 'classic' ? <div className="sketch-sky" aria-hidden="true"><i /><i /><i /><i /></div> : <IntroScenery />}
            <canvas ref={introCloudRef} className="intro-cloud-reveal" aria-hidden="true" />
            {INTRO_THEME === 'poster' ? <PosterIntro onEnter={() => enterMap(null)} waiting={!mapWarm} leaving={introLeaving} /> : <div className="intro-panel">
              <h1 id="intro-title"><span className="intro-small"><span className="intro-word">Entdecke</span> <span className="intro-word">das</span></span> <span className="intro-script" data-text="Supergrätzl">Supergrätzl</span> <span className="intro-big">Lichtental</span></h1>
              {INTRO_THEME === 'green' ? (
                <div className="intro-body">
                  <IntroPhotos />
                  <div className="intro-copy">
                  <p id="intro-description">Im Herbst 2023 haben wir unsere Nachbar:innen eingeladen, gemeinsam mit uns dieses Supergrätzl zu planen. In je einem Workshop pro Gasse haben insgesamt 250 Personen mit ihren Ideen, Wünschen und Erfahrungen mitgemacht.</p>
                  <button className="intro-button" type="button" aria-label="Supergrätzl entdecken" onClick={() => enterMap(null)} disabled={introLeaving || !mapWarm} data-wait={mapWarm ? undefined : ''} autoFocus>
                    <span>Supergrätzl entdecken</span><span aria-hidden="true">→</span>
                  </button>
                  </div>
                </div>
              ) : (
                <>
                  <IntroUnicorn />
                <p id="intro-description">Im Herbst 2023 haben wir unsere Nachbar:innen eingeladen, gemeinsam mit uns dieses Supergrätzl zu planen. In je einem Workshop pro Gasse haben insgesamt 250 Personen mit ihren Ideen, Wünschen und Erfahrungen mitgemacht.</p>
                <button className="intro-button" type="button" aria-label="Supergrätzl entdecken" onClick={() => enterMap(null)} disabled={introLeaving || !mapWarm} data-wait={mapWarm ? undefined : ''} autoFocus>
                  <span>Supergrätzl entdecken</span><span aria-hidden="true">→</span>
                </button>
                </>
              )}
            </div>}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
