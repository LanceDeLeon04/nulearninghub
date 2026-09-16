import { useMemo, useState } from 'react'
import { gradeActivity, shuffle } from '../../lib/blockTypes'
import { ArrowLeftRight, Send, Award, CheckCircle2, XCircle } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import PairRequestPanel, { PairedBanner } from '../PairRequestPanel'

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

export default function ActivityView({ data, progress, onSubmit, readOnly = false, pairing = null }) {
  const questions = data.questions ?? []
  const alreadySubmitted = progress?.completed ?? false
  const [responses, setResponses] = useState(progress?.response ?? {})
  const [result, setResult] = useState(
    alreadySubmitted ? { score: progress.score, maxScore: progress.max_score, correctByQuestion: null } : null
  )
  const [justSubmitted, setJustSubmitted] = useState(false)

  const isPairMode = data.mode === 'pair'
  // Not yet paired and there's actually something to gate on (student view,
  // not teacher/admin preview, which never passes `pairing`) — show the
  // request/accept flow instead of the questions.
  if (isPairMode && !readOnly && pairing && !pairing.partner && !alreadySubmitted) {
    return <PairRequestPanel pairing={pairing} />
  }

  function setAnswer(qid, value) {
    if (readOnly) return
    setResponses((prev) => ({ ...prev, [qid]: value }))
  }

  function handleSubmit() {
    if (readOnly) return
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

      {questions.map((q, qi) => {
        const isCorrect = result?.correctByQuestion ? result.correctByQuestion[q.id] : null
        return (
        <div
          key={q.id}
          className={`activity-question${locked ? (isCorrect ? ' activity-question-correct' : ' activity-question-incorrect') : ''}${justSubmitted ? ' reveal-pop' : ''}`}
          style={justSubmitted ? { animationDelay: `${qi * 60}ms` } : undefined}
        >
          <p className="question-prompt">
            {q.prompt} <span className="muted small">({q.points} pt{q.points === 1 ? '' : 's'})</span>
            {locked && isCorrect !== null && (
              isCorrect
                ? <CheckCircle2 size={16} className="answer-correct-icon" style={{ marginLeft: '0.4rem', verticalAlign: '-3px' }} />
                : <XCircle size={16} className="answer-incorrect-icon" style={{ marginLeft: '0.4rem', verticalAlign: '-3px' }} />
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
