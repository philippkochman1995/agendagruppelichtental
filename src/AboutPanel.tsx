import { useEffect, useRef, useState } from 'react'

const base = import.meta.env.BASE_URL

const workshopPhotos = [
  { src: `${base}about/workshop-1.webp`, alt: 'Workshop auf der Straße: Holzbäume und Symbole auf einem langen Plan der Gasse' },
  { src: `${base}about/workshop-2.webp`, alt: 'Der meterlange Plan aus den Workshops liegt ausgerollt im Rathaus vor der Bezirksvertretung' },
  { src: `${base}about/workshop-3.webp`, alt: 'Nachbar:innen planen an einem langen Tisch mitten auf der Gasse' },
]

/** Photos of the workshops, one at a time: swipe, or use the arrows and dots */
function Slideshow() {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const go = (next: number) => {
    const element = track.current
    if (!element) return
    const target = (next + workshopPhotos.length) % workshopPhotos.length
    element.scrollTo({ left: target * element.clientWidth, behavior: 'smooth' })
  }
  return (
    <div className="about-slides" aria-roledescription="Bildergalerie" aria-label="Fotos aus den Workshops">
      <div className="about-slides-track" ref={track} onScroll={(event) => {
        const element = event.currentTarget
        setIndex(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)))
      }}>
        {workshopPhotos.map((photo, i) => (
          <img key={photo.src} src={photo.src} alt={photo.alt} loading="lazy" aria-hidden={i !== index} draggable={false} />
        ))}
      </div>
      <button className="about-slides-arrow is-prev" type="button" onClick={() => go(index - 1)} aria-label="Voriges Foto">‹</button>
      <button className="about-slides-arrow is-next" type="button" onClick={() => go(index + 1)} aria-label="Nächstes Foto">›</button>
      <div className="about-slides-dots" role="tablist">
        {workshopPhotos.map((photo, i) => (
          <button key={photo.src} type="button" role="tab" aria-selected={i === index} aria-label={`Foto ${i + 1}`} className={i === index ? 'is-on' : ''} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  )
}

/** Info about the project: slides in from the side (from below on phones), the team photo above the headline */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const close = () => {
    setLeaving(true)
    window.setTimeout(onClose, 260)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className={`about-overlay ${leaving ? 'is-leaving' : ''}`} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <aside className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="about-close" type="button" onClick={close} aria-label="Info schließen"><svg className="sketch-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <img className="about-photo" src={`${base}about/team.webp`} alt="Das Team der Lokalen Agenda 21 Alsergrund auf einem Sofa mitten auf der Straße" />
        <div className="about-body">
          <h2 id="about-title">Supergrätzl Lichtental</h2>
          <p>Stell dir vor, dein Grätzl bietet mehr Orte zum Verweilen, zum Spielen und Entspannen. Raum für Aktivitäten, für die davor kein Platz war. So ein Grätzl braucht eine gerechte Verteilung des öffentlichen Raums. Weniger Stellplätze für Autos, dafür mehr Orte für eine gute Nachbarschaft. Auf dieser Website findest du eine Karte, auf der du die Forderungen unser Nachbar:innen für genau so ein Grätzl siehst. Ein Supergrätzl.</p>
          <p>Das Lichtental, unser Grätzl im 9. Bezirk, liegt zwischen Liechtensteinstraße, Althanstraße und Alserbachstraße. Es ist ein besonderes Grätzl, mit viel Schubert, einem Einhorn und der höchsten Dichte an Gemeindebauten im Bezirk. Im Zentrum liegt der Lichtentaler Park, die VHS Marktgasse, das Jugendzentrum, mehrere Kindergärten und die Schubertkirche.</p>
          <p>Wir wohnen im Grätzl und haben uns in den letzten Jahren viele Gedanken gemacht, wie wir das Leben im Lichtental verbessern könnten. Fasziniert hat uns die Idee des Supergrätzls - die Wiener Version eines stadtplanerischen Konzepts, wie man es schon in anderen Städten findet. In einem Supergrätzl ist die aktive Nutzung des öffentlichen Raums die Priorität. Autos sollen nicht mehr das Grätzl durchqueren und Stellplätze werden weitgehend entfernt. Mit Hilfe des Forschungsprojekts TuneOurBlock haben wir ein Verkehrskonzept für das Supergrätzl Lichtental entwickelt. Wir haben auch herausgefunden, dass 134 neue Bäume im Lichtental gepflanzt werden können (mehr dazu in den Forderungen und der Bibliothek).</p>
          <p>Wie soll das Supergrätzl Lichtental konkret aussehen? Im Herbst 2023 haben wir unsere Nachbar:innen eingeladen, gemeinsam mit uns dieses Supergrätzl zu planen. In je einem Workshop pro Gasse haben insgesamt 250 Personen mit ihren Ideen, Wünschen und Erfahrungen mitgemacht. Die Ergebnisse sind auf dieser Karte zu sehen. In dieser digitalen Karte haben wir die vielfältigen Ideen in Kategorien gebündelt. Die meterlangen Originalpläne auf Papier kannst du auch hier ansehen.</p>
          <p>Diese Website dokumentiert unsere Arbeit für ein Grätzl, das den Herausforderungen der Zukunft gewachsen ist.</p>
          <Slideshow />
          <div className="about-contact">
            <strong>Du möchtest bei unserem Projekt mitmachen?</strong>
            <span>Du erreichst uns unter:</span>
            <a href="mailto:supergraetzl.lichtental@gmail.com"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.8 7 8.2 6 8.2-6" /></svg>supergraetzl.lichtental@gmail.com</a>
          </div>
          <p className="about-credits">
            <a href={`${base}impressum.html`}>Impressum</a> | <a href={`${base}datenschutz.html`}>Datenschutz</a>
            <br />
            Kartendaten: Stadt Wien – <a href="https://data.wien.gv.at" target="_blank" rel="noopener">data.wien.gv.at</a> (<a href="https://creativecommons.org/licenses/by/4.0/deed.de" target="_blank" rel="noopener">CC BY 4.0</a>)
            <br />
            Design &amp; Dev: <a href="https://studiovis.at" target="_blank" rel="noopener">studiovis</a>
          </p>
        </div>
      </aside>
    </div>
  )
}
