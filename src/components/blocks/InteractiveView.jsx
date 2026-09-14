import FlashcardsView from './FlashcardsView'
import HotspotsView from './HotspotsView'

const SUBTYPE_VIEWS = {
  flashcards: FlashcardsView,
  hotspots: HotspotsView,
}

export default function InteractiveView({ data, progress, onComplete }) {
  const subtype = data.subtype ?? 'flashcards'
  const SubView = SUBTYPE_VIEWS[subtype]

  return (
    <div className="block-view">
      {SubView ? <SubView data={data} progress={progress} onComplete={onComplete} /> : <p className="muted">Unknown interactive type.</p>}
    </div>
  )
}
