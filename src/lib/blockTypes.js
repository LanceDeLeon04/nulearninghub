// Shared vocabulary for module content blocks.
//
// A module is "self-contained": everything a student needs lives in its
// `module_content` rows. Each row has a `type` (which renderer to use) and
// a `data` JSON payload whose shape depends on the type. This file is the
// single source of truth for those shapes, defaults, and grading so the
// teacher builder and the student player never drift apart.

// `icon` is a key resolved to a lucide-react component via
// src/components/BlockIcon.jsx (kept as a string here so this file has no
// JSX/React dependency).
export const BLOCK_TYPES = [
  { type: 'lecture', label: 'Lecture', icon: 'lecture', description: 'Readable content, with optional read-aloud.' },
  { type: 'activity', label: 'Activity', icon: 'activity', description: 'Graded questions — multiple choice, true/false, short answer, matching.' },
  { type: 'interactive', label: 'Interactive', icon: 'interactive', description: 'Flashcards or clickable image hotspots.' },
]

export const QUESTION_TYPES = [
  { type: 'multiple_choice', label: 'Multiple Choice' },
  { type: 'true_false', label: 'True / False' },
  { type: 'short_answer', label: 'Short Answer' },
  { type: 'matching', label: 'Matching' },
]

let idCounter = 0
export function makeId(prefix = 'id') {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

export const INTERACTIVE_SUBTYPES = [
  { subtype: 'flashcards', label: 'Flashcards' },
  { subtype: 'hotspots', label: 'Image Hotspots' },
]

// ---- Default payloads (used when adding a new block/question) ----------

export function defaultBlockData(type) {
  if (type === 'lecture') {
    return { body: '', readAloudEnabled: true }
  }
  if (type === 'activity') {
    return { instructions: '', questions: [] }
  }
  if (type === 'interactive') {
    return { subtype: 'flashcards', cards: [] }
  }
  return {}
}

export function defaultInteractiveData(subtype) {
  if (subtype === 'hotspots') return { subtype: 'hotspots', imageUrl: '', hotspots: [] }
  return { subtype: 'flashcards', cards: [] }
}

export function defaultQuestion(type) {
  const base = { id: makeId('q'), type, prompt: '', points: 1 }
  if (type === 'multiple_choice') return { ...base, options: ['', ''], correctIndex: 0 }
  if (type === 'true_false') return { ...base, correctAnswer: true }
  if (type === 'short_answer') return { ...base, acceptedAnswers: [''] }
  if (type === 'matching') return { ...base, pairs: [{ left: '', right: '' }, { left: '', right: '' }] }
  return base
}

export function defaultFlashcard() {
  return { id: makeId('card'), front: '', back: '' }
}

export function defaultHotspot(x = 50, y = 50) {
  return { id: makeId('spot'), x, y, label: '', description: '' }
}

// ---- Grading ---------------------------------------------------------

function normalize(s) {
  return (s ?? '').toString().trim().toLowerCase()
}

// responses: { [questionId]: answer }, shape of `answer` depends on type:
//   multiple_choice -> index (number)
//   true_false       -> boolean
//   short_answer     -> string
//   matching         -> { [leftIndex]: chosenOriginalRightIndex }
export function gradeActivity(questions, responses) {
  let score = 0
  let maxScore = 0
  const correctByQuestion = {}

  for (const q of questions) {
    const pts = Number(q.points) || 1
    maxScore += pts
    const r = responses?.[q.id]
    let correct = false

    if (q.type === 'multiple_choice') {
      correct = r !== undefined && r !== null && Number(r) === Number(q.correctIndex)
    } else if (q.type === 'true_false') {
      correct = typeof r === 'boolean' && r === Boolean(q.correctAnswer)
    } else if (q.type === 'short_answer') {
      const accepted = q.acceptedAnswers ?? []
      correct = accepted.some((a) => normalize(a) === normalize(r) && normalize(a) !== '')
    } else if (q.type === 'matching') {
      const pairs = q.pairs ?? []
      correct = pairs.length > 0 && pairs.every((_, i) => Number(r?.[i]) === i)
    }

    if (correct) score += pts
    correctByQuestion[q.id] = correct
  }

  return { score, maxScore, correctByQuestion }
}

// Deterministic-ish shuffle for matching-question right-hand options —
// re-shuffled only when the question id changes (see useMemo at call sites).
export function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
