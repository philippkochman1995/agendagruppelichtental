import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { TrafficMode } from './traffic'
import { firstStepOf, firstTreeStepOf, garageSteps, tourSteps, treeSteps, type TreesView } from './trafficTour'

export type AppMode = 'ideas' | 'traffic' | 'trees' | 'garages'
export type { TreesView }

interface Option<T extends string> { value: T; label: string }

/** Segmented control (2-3 related, mutually exclusive options): the selected segment is a thumb that slides over. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, size = 'md', tone }: {
  options: Option<T>[]
  /** null: nothing selected (the thumb hides) */
  value: T | null
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md' | 'lg'
  /** optional colour mood of the selected segment, e.g. 'red' for the Bestand */
  tone?: 'red' | 'green' | 'blue'
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const root = useRef<HTMLDivElement>(null)
  const selected = options.findIndex((option) => option.value === value)
  const index = Math.max(0, selected)
  // the thumb follows the real box of the selected option, so options may be as wide as their text (phones)
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const option = refs.current[index]
      if (!option) return
      const next = { x: option.offsetLeft, width: option.offsetWidth }
      setThumb((old) => (old && old.x === next.x && old.width === next.width ? old : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current) observer.observe(root.current)
    refs.current.forEach((option) => option && observer.observe(option))
    return () => observer.disconnect()
  }, [index, options.length])

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div ref={root} className={`seg seg-${size} ${tone ? `seg-${tone}` : ''} ${selected < 0 ? 'is-empty' : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} style={{ '--n': options.length, '--i': index } as React.CSSProperties}>
      <span className={`seg-thumb ${thumb ? 'is-measured' : ''}`} aria-hidden="true" style={thumb ? ({ '--x': `${thumb.x}px`, '--w': `${thumb.width}px` } as React.CSSProperties) : undefined} />
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(element) => { refs.current[i] = element }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={i === index ? 0 : -1}
          className="seg-option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const treesViewOptions: Option<TreesView>[] = [
  { value: 'aktuell', label: 'Aktuell' },
  { value: 'neu', label: 'Neu' },
]
const modeOptions: Option<AppMode>[] = [
  { value: 'ideas', label: 'Grätzl-Ideen' },
  { value: 'traffic', label: 'Verkehr' },
  { value: 'trees', label: 'Bäume' },
  { value: 'garages', label: 'Garagen' },
]
export type GarageView = 'bestand' | 'neu'
const trafficOptions: Option<TrafficMode>[] = [
  { value: 'bestand', label: 'Bestand' },
  { value: 'neu', label: 'Neu' },
]

/** each tour opens by itself the first time its mode is chosen on this visit (a reload starts afresh) */
const toursSeen = new Set<TourMode>()
export type TourMode = 'traffic' | 'trees' | 'garages'
export function readTourDone(mode: TourMode = 'traffic') {
  return toursSeen.has(mode)
}
export function writeTourDone(mode: TourMode = 'traffic') {
  toursSeen.add(mode)
}

/** bottom: room the card takes on phones; sideWidth: width of the card standing next to the Grätzl on wide screens */
export interface TourInsets { sideWidth?: number; bottom?: number }

/**
 * Bottom centre, small: what do I look at? Grätzl-Ideen, Verkehr, Bäume or Garagen.
 * Verkehr, Bäume and Garagen each have a quiet switch at the top centre (Bestand | Neu, Aktuell | Neu) and a short guided
 * tour (Weiter) in a card: at the side next to the Grätzl on wide screens, above the main switch on phones.
 */
export function MapDock({ mode, onMode, traffic, onTraffic, tourStep, onTourStep, onTourClose, onTourInsets, cardLeft, treeStep, onTreeStep, onTreeClose, treesView, onTreesView, garageStep, onGarageStep, onGarageClose, garageView, onGarageView }: {
  mode: AppMode
  onMode: (mode: AppMode) => void
  traffic: TrafficMode
  onTraffic: (mode: TrafficMode) => void
  tourStep: number | null
  onTourStep: (step: number) => void
  onTourClose: () => void
  onTourInsets: (insets: TourInsets | null) => void
  /** wide screens: where the card starts, next to the Grätzl (px from the left); null = at the right edge */
  cardLeft: number | null
  treeStep: number | null
  onTreeStep: (step: number) => void
  onTreeClose: () => void
  treesView: TreesView
  onTreesView: (view: TreesView) => void
  garageStep: number | null
  onGarageStep: (step: number) => void
  onGarageClose: () => void
  garageView: GarageView
  onGarageView: (view: GarageView) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  // one card for both tours
  let card: { key: string; title: string; text: string; tone: string; index: number; count: number; last: boolean; next: () => void } | null = null
  if (mode === 'traffic' && tourStep !== null) {
    const step = tourSteps[tourStep]
    const same = tourSteps.filter((candidate) => candidate.concept === step.concept)
    card = {
      key: `t${tourStep}`, title: step.title, text: step.text, tone: step.concept === 'bestand' ? 'is-bestand' : '', index: same.indexOf(step) + 1, count: same.length,
      last: tourStep + 1 >= tourSteps.length, next: () => (tourStep + 1 < tourSteps.length ? onTourStep(tourStep + 1) : onTourClose()),
    }
  } else if (mode === 'trees' && treeStep !== null) {
    const step = treeSteps[treeStep]
    const same = treeSteps.filter((candidate) => candidate.view === step.view)
    card = {
      key: `b${treeStep}`, title: step.title, text: step.text, tone: step.view === 'aktuell' ? 'is-aktuell' : '', index: same.indexOf(step) + 1, count: same.length,
      last: treeStep + 1 >= treeSteps.length, next: () => (treeStep + 1 < treeSteps.length ? onTreeStep(treeStep + 1) : onTreeClose()),
    }
  }
  if (mode === 'garages' && garageStep !== null) {
    const step = garageSteps[garageStep]
    card = {
      key: `g${garageStep}`, title: step.title, text: step.text, tone: 'is-garage', index: garageStep + 1, count: garageSteps.length,
      last: garageStep + 1 >= garageSteps.length, next: () => (garageStep + 1 < garageSteps.length ? onGarageStep(garageStep + 1) : onGarageClose()),
    }
  }
  const cardOpen = card !== null

  // tell the map how much room the card takes, so the Grätzl is fitted into the rest
  useEffect(() => {
    const element = cardRef.current
    if (!element || !cardOpen) { onTourInsets(null); return }
    const report = () => {
      const rect = element.getBoundingClientRect()
      onTourInsets(window.innerWidth > 720 ? { sideWidth: Math.round(rect.width) } : { bottom: Math.round(rect.height + 6) })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => { observer.disconnect(); window.removeEventListener('resize', report) }
  }, [cardOpen, tourStep, treeStep, garageStep, mode])

  return (
    <>
      {mode === 'traffic' && (
        <div className="map-top">
          <SegmentedControl options={trafficOptions} value={traffic} onChange={onTraffic} label="Verkehrskonzept" size="sm" tone={traffic === 'bestand' ? 'red' : 'green'} />
          <button type="button" className={`tour-info ${tourStep !== null ? 'is-on' : ''}`} aria-pressed={tourStep !== null} aria-label="Verkehrskonzept erklären" onClick={() => (tourStep === null ? onTourStep(firstStepOf(traffic)) : onTourClose())}>?</button>
        </div>
      )}
      {mode === 'trees' && (
        <div className="map-top">
          <SegmentedControl options={treesViewOptions} value={treesView} onChange={onTreesView} label="Bäume: aktuell oder neu" size="sm" tone={treesView === 'neu' ? 'green' : 'blue'} />
          <button type="button" className={`tour-info ${treeStep !== null ? 'is-on' : ''}`} aria-pressed={treeStep !== null} aria-label="Bäume erklären" onClick={() => (treeStep === null ? onTreeStep(firstTreeStepOf(treesView)) : onTreeClose())}>?</button>
        </div>
      )}
      {mode === 'garages' && (
        <div className="map-top">
          <SegmentedControl options={trafficOptions} value={garageStep !== null ? 'neu' : garageView} onChange={onGarageView} label="Garagen: Bestand oder neu" size="sm" tone={garageStep !== null || garageView === 'neu' ? 'blue' : undefined} />
          <button type="button" className={`tour-info ${garageStep !== null ? 'is-on' : ''}`} aria-pressed={garageStep !== null} aria-label="Garagen-Initiative erklären" onClick={() => (garageStep === null ? onGarageStep(0) : onGarageClose())}>?</button>
        </div>
      )}
      {card && (
        <div className={`tour-card ${card.tone}`} ref={cardRef} style={window.innerWidth > 720 && cardLeft !== null ? { left: cardLeft, right: 'auto' } : undefined} role="dialog" aria-label="Erklärung" key={card.key}>
          <div className="tour-text">
            <strong>{card.title}</strong>
            <p>{card.text}</p>
          </div>
          <div className="tour-actions">
            <button type="button" className="tour-next" onClick={card.next}>{card.last ? 'Fertig' : 'Weiter'}</button>
            {card.count > 1 && <small className="tour-count" aria-label={`Seite ${card.index} von ${card.count}`}>{card.index}/{card.count}</small>}
          </div>
        </div>
      )}
      <div className="map-dock">
        <SegmentedControl options={modeOptions} value={mode} onChange={onMode} label="Kartenthema" size="lg" />
      </div>
    </>
  )
}
