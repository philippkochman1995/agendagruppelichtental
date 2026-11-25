// The start screen backdrop is made only of the original illustration (public/intro-map.webp), two cut-outs of it, nothing redrawn.
export function IntroScenery() {
  return (
    <div className="intro-scenery" aria-hidden="true">
      <div className="intro-scenery-a" />
      <div className="intro-scenery-b" />
    </div>
  )
}
