import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import ReadAloud from '../ReadAloud'

export default function FlashcardsView({ data, progress, onComplete }) {
  const cards = data.cards ?? []
  const completed = progress?.completed ?? false
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (cards.length === 0) {
    return <p className="muted">No flashcards in this block yet.</p>
  }

  const card = cards[index]
  const onLastCard = index === cards.length - 1

  function next() {
    haptic('tap')
    setFlipped(false)
    if (onLastCard) {
      onComplete()
    } else {
      setIndex((i) => i + 1)
    }
  }

  return (
    <>
      <p className="muted small">Card {index + 1} of {cards.length}</p>
      <div className={`flashcard${flipped ? ' flashcard-flipped' : ''}`} onClick={() => { haptic('select'); setFlipped((f) => !f) }}>
        <div className="flashcard-inner">
          {flipped ? card.back : card.front}
        </div>
      </div>
      <p className="muted small">Tap the card to flip it.</p>
      {/* key forces a fresh ReadAloud (and cancels any in-flight speech)
          whenever the card or its flipped side changes. */}
      <ReadAloud key={`${index}-${flipped}`} text={flipped ? card.back : card.front} />
      <div className="block-view-footer">
        <button onClick={next}>{onLastCard ? 'Finish' : 'Next Card'}</button>
        {completed && <span className="badge status-approved"><CheckCircle2 size={13} /> Reviewed</span>}
      </div>
    </>
  )
}
