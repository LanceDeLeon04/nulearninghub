import { useMemo, useState } from 'react'
import { gradeActivity, shuffle } from '../../lib/blockTypes'
import { ArrowLeftRight, Send, Award, CheckCircle2, XCircle } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import PairRequestPanel, { PairedBanner } from '../PairRequestPanel'
import ReadAloud from '../ReadAloud'

function MatchingQuestion({ question, value, onAnswer, locked }) {
  const shuffledRights = useMemo(
    () => shuffle(question.pairs.map((p, idx) => ({ text: p.right, idx }))),
    [question.id]
  )

  return (
    <div className="option-list">
      {question.pairs.map((p, i) => (
        <div key={i} className="option-row">
          <span>{p.left}</span>
          <ArrowLeftRight size={14} className="muted" />
          <select
            disabled={locked}
            value={value?.[i] ?? ''}
            onChange={(e) => onAnswer({ ...(value ?? {}), [i]: e.target.value === '' ? undefined : Number(e.target.value) })}
          >
            <option value="" disabled>Select a match</option>
            {shuffledRights.map((r) => (
              <option key={r.idx} value={r.idx}>{r.text}</option>
            ))}
          </select>
          {locked && (
            Number(value?.[i]) === i
              ? <CheckCircle2 size={16} className="answer-correct-icon" />
              : <XCircle size={16} className="answer-incorrect-icon" />
          )}
        </div>
      ))}
    </div>
  )
}

// Whether a single question currently has a real answer, per its type.
// Used both to block submission and to highlight what's still missing.
function isAnswered(question, value) {
  switch (question.type) {
    case 'multiple_choice':
      return typeof value === 'number'
    case 'true_false':
      // false is a valid, deliberate answer — only "never touched" (undefined) counts as unanswered.
      return value === true || value === false
    case 'short_answer':
      return typeof value === 'string' && value.trim().length > 0
    case 'matching':
      return !!value && question.pairs.every((_, i) => value[i] !== undefined)
    default:
      return value !== undefined && value !== null && value !== ''
  }
}

export default function ActivityView({ data, progress, onSubmit, readOnly = false, pairing = null }) {
  const questions = data.questions ?? []
  const requireAllAnswered = data.requireAllAnswered ?? true
  const alreadySubmitted = progress?.completed ?? false
  const [responses, setResponses] = useState(progress?.response ?? {})
  const [result, setResult] = useState(
    alreadySubmitted ? { score: progress.score, maxScore: progress.max_score, correctByQuestion: null } : null
  )
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [showMissingWarning, setShowMissingWarning] = useState(false)

  const isPairMode = data.mode === 'pair'
  // Not yet paired and there's actually something to gate on (student view,
  // not teacher/admin preview, which never passes `pairing`) — show the
  // request/accept flow instead of the questions.
  if (isPairMode && !readOnly && pairing && !pairing.partner && !alreadySubmitted) {
    return <PairRequestPanel pairing={pairing} />
  }

  const unansweredIds = new Set(
    questions.filter((q) => !isAnswered(q, responses[q.id])).map((q) => q.id)
  )

  function setAnswer(qid, value) {
    if (readOnly) return
    setResponses((prev) => ({ ...prev, [qid]: value }))
    setShowMissingWarning(false)
  }

  function handleSubmit() {
    if (readOnly) return
    if (requireAllAnswered && unansweredIds.size > 0) {
      // Don't silently no-op — tell the student what's left, and point them
      // at it, rather than leaving them wondering why nothing happened.
      haptic('error')
      setShowMissingWarning(true)
      return
    }
    haptic('tap')
    const graded = gradeActivity(questions, responses)
    setResult({ score: graded.score, maxScore: graded.maxScore, correctByQuestion: graded.correctByQuestion })
    setJustSubmitted(true)
    onSubmit(responses, graded.score, graded.maxScore)
  }

  const locked = !!result || readOnly

  return (
    <div className="block-view">
      {isPairMode && pairing?.partner && <PairedBanner partnerName={pairing.partner.full_name} />}
      {isPairMode && !pairing && alreadySubmitted && <PairedBanner partnerName="your partner" />}
      {data.instructions && <p className="muted activity-instructions">{data.instructions}</p>}
      {data.instructions && <ReadAloud text={data.instructions} />}

      {questions.map((q, qi) => {
        const isCorrect = result?.correctByQuestion ? result.correctByQuestion[q.id] : null
        return (
        <div
          key={q.id}
          className={`activity-question${locked ? (isCorrect ? ' activity-question-correct' : ' activity-question-incorrect') : ''}${justSubmitted ? ' reveal-pop' : ''}${!locked && showMissingWarning && unansweredIds.has(q.id) ? ' activity-question-missing' : ''}`}
          style={justSubmitted ? { animationDelay: `${qi * 60}ms` } : undefined}
        >
          <p className="question-prompt">
            {q.prompt} <span className="muted small">({q.points} pt{q.points === 1 ? '' : 's'})</span>
            {locked && isCorrect !== null && (
              isCorrect
                ? <CheckCircle2 size={16} className="answer-correct-icon" style={{ marginLeft: '0.4rem', verticalAlign: '-3px' }} />
                : <XCircle size={16} className="answer-incorrect-icon" style={{ marginLeft: '0.4rem', verticalAlign: '-3px' }} />
            )}
            {!locked && showMissingWarning && unansweredIds.has(q.id) && (
              <span className="badge status-rejected" style={{ marginLeft: '0.5rem' }}>Answer needed</span>
            )}
          </p>

          {q.type === 'multiple_choice' && (
            <div className="option-list">
              {q.options.map((opt, i) => (
                <label
                  key={i}
                  className={`checkbox-label${locked && i === q.correctIndex ? ' answer-correct-highlight' : ''}${locked && responses[q.id] === i && i !== q.correctIndex ? ' answer-incorrect-highlight' : ''}`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    disabled={locked}
                    checked={responses[q.id] === i}
                    onChange={() => setAnswer(q.id, i)}
                  /> {opt}
                </label>
              ))}
            </div>
          )}

          {q.type === 'true_false' && (
            <div className="option-row">
              <label className="checkbox-label">
                <input type="radio" name={q.id} disabled={locked} checked={responses[q.id] === true} onChange={() => setAnswer(q.id, true)} /> True
              </label>
              <label className="checkbox-label">
                <input type="radio" name={q.id} disabled={locked} checked={responses[q.id] === false} onChange={() => setAnswer(q.id, false)} /> False
              </label>
            </div>
          )}

          {q.type === 'short_answer' && (
            <input
              disabled={locked}
              value={responses[q.id] ?? ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="Your answer"
            />
          )}

          {q.type === 'matching' && (
            <MatchingQuestion question={q} value={responses[q.id]} onAnswer={(v) => setAnswer(q.id, v)} locked={locked} />
          )}
        </div>
      )})}

      <div className="block-view-footer">
        {!locked && showMissingWarning && unansweredIds.size > 0 && (
          <p className="muted small" style={{ color: 'var(--danger, #dc2626)', width: '100%' }}>
            Please answer {unansweredIds.size === 1 ? 'the highlighted question' : `all ${unansweredIds.size} highlighted questions`} before submitting.
          </p>
        )}
        {!locked && questions.length > 0 && (
          <button onClick={handleSubmit}><Send size={15} /> Submit Activity</button>
        )}
        {locked && result && (
          <span className={`badge status-approved${justSubmitted ? ' score-badge-pop' : ''}`}>
            <Award size={13} /> Score: {result.score} / {result.maxScore}
          </span>
        )}
        {readOnly && !result && (
          <span className="muted small">Preview only — answering is disabled for teachers.</span>
        )}
      </div>
    </div>
  )
}
