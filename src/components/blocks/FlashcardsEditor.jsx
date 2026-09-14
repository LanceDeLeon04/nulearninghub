import { defaultFlashcard } from '../../lib/blockTypes'
import { ArrowLeftRight, X, Plus } from 'lucide-react'

export default function FlashcardsEditor({ data, onChange }) {
  const cards = data.cards ?? []

  function updateCard(i, patch) {
    const next = [...cards]
    next[i] = { ...next[i], ...patch }
    onChange({ ...data, cards: next })
  }

  function removeCard(i) {
    onChange({ ...data, cards: cards.filter((_, idx) => idx !== i) })
  }

  function addCard() {
    onChange({ ...data, cards: [...cards, defaultFlashcard()] })
  }

  return (
    <div className="block-editor">
      <p className="muted small">Front/back pairs students flip through.</p>
      {cards.map((c, i) => (
        <div key={c.id} className="option-row">
          <input value={c.front} onChange={(e) => updateCard(i, { front: e.target.value })} placeholder="Front (term)" />
          <ArrowLeftRight size={14} className="muted" />
          <input value={c.back} onChange={(e) => updateCard(i, { back: e.target.value })} placeholder="Back (definition)" />
          <button type="button" className="btn btn-reject btn-sm" onClick={() => removeCard(i)}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={addCard}><Plus size={15} /> Add Flashcard</button>
      {cards.length === 0 && <p className="muted small">No flashcards yet — add one above.</p>}
    </div>
  )
}
