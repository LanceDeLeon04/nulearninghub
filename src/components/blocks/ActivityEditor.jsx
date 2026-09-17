import { QUESTION_TYPES, ACTIVITY_MODES, defaultQuestion } from '../../lib/blockTypes'
import { X, Plus, ArrowLeftRight, Trash2, Users } from 'lucide-react'

function QuestionEditor({ question, onChange, onRemove }) {
  function update(patch) {
    onChange({ ...question, ...patch })
  }

  function updateOption(i, value) {
    const options = [...question.options]
    options[i] = value
    update({ options })
  }

  function addOption() {
    update({ options: [...question.options, ''] })
  }

  function removeOption(i) {
    const options = question.options.filter((_, idx) => idx !== i)
    const correctIndex = question.correctIndex >= options.length ? 0 : question.correctIndex
    update({ options, correctIndex })
  }

  function updatePair(i, side, value) {
    const pairs = question.pairs.map((p, idx) => (idx === i ? { ...p, [side]: value } : p))
    update({ pairs })
  }

  function addPair() {
    update({ pairs: [...question.pairs, { left: '', right: '' }] })
  }

  function removePair(i) {
    update({ pairs: question.pairs.filter((_, idx) => idx !== i) })
  }

  function updateAcceptedAnswer(i, value) {
    const acceptedAnswers = [...question.acceptedAnswers]
    acceptedAnswers[i] = value
    update({ acceptedAnswers })
  }

  function addAcceptedAnswer() {
    update({ acceptedAnswers: [...question.acceptedAnswers, ''] })
  }

  function removeAcceptedAnswer(i) {
    update({ acceptedAnswers: question.acceptedAnswers.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="question-editor">
      <div className="question-editor-header">
        <select
          value={question.type}
          onChange={(e) => onChange({
            ...defaultQuestion(e.target.value),
            id: question.id,
            prompt: question.prompt,
            points: question.points,
          })}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        <label className="points-input">
          Points
          <input
            type="number"
            min="1"
            value={question.points}
            onChange={(e) => update({ points: Number(e.target.value) || 1 })}
          />
        </label>
        <button type="button" className="btn btn-reject" onClick={onRemove}><Trash2 size={14} /> Remove Question</button>
      </div>

      <label>
        Question Prompt
        <input value={question.prompt} onChange={(e) => update({ prompt: e.target.value })} />
        <span className="muted small">
          Wrap a word in __double underscores__ to underline it, or **double asterisks** to bold it —
          use this for prompts that refer to “the underlined word”.
        </span>
      </label>

      {question.type === 'multiple_choice' && (
        <div className="option-list">
          <p className="muted small">Options — select the correct one</p>
          {question.options.map((opt, i) => (
            <div key={i} className="option-row">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correctIndex === i}
                onChange={() => update({ correctIndex: i })}
              />
              <input value={opt} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
              {question.options.length > 2 && (
                <button type="button" className="btn btn-reject btn-sm" onClick={() => removeOption(i)}><X size={13} /></button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addOption}><Plus size={13} /> Add Option</button>
        </div>
      )}

      {question.type === 'true_false' && (
        <div className="option-row">
          <label className="checkbox-label">
            <input
              type="radio"
              name={`tf-${question.id}`}
              checked={question.correctAnswer === true}
              onChange={() => update({ correctAnswer: true })}
            /> True
          </label>
          <label className="checkbox-label">
            <input
              type="radio"
              name={`tf-${question.id}`}
              checked={question.correctAnswer === false}
              onChange={() => update({ correctAnswer: false })}
            /> False
          </label>
        </div>
      )}

      {question.type === 'short_answer' && (
        <label className="checkbox-label" style={{ marginTop: '0.4rem' }}>
          <input
            type="checkbox"
            checked={question.subjective === true}
            onChange={(e) => onChange({ ...question, subjective: e.target.checked })}
          />
          Answers may vary — don't auto-score this; hold it for teacher review
        </label>
      )}

      {question.type === 'short_answer' && question.subjective && (
        <label>
          Model answer (from the key — shown to you while reviewing, never to the student)
          <textarea
            rows={3}
            value={question.sampleAnswer ?? ''}
            onChange={(e) => onChange({ ...question, sampleAnswer: e.target.value })}
            placeholder="What a full-credit answer looks like"
          />
        </label>
      )}

      {question.type === 'short_answer' && !question.subjective && (
        <div className="option-list">
          <p className="muted small">Accepted answers (any match counts as correct)</p>
          {(question.acceptedAnswers ?? []).map((a, i) => (
            <div key={i} className="option-row">
              <input value={a} onChange={(e) => updateAcceptedAnswer(i, e.target.value)} placeholder="Accepted answer" />
              {(question.acceptedAnswers ?? []).length > 1 && (
                <button type="button" className="btn btn-reject btn-sm" onClick={() => removeAcceptedAnswer(i)}><X size={13} /></button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addAcceptedAnswer}><Plus size={13} /> Add Accepted Answer</button>
        </div>
      )}

      {question.type === 'matching' && (
        <div className="option-list">
          <p className="muted small">Pairs — students match left to right</p>
          {question.pairs.map((p, i) => (
            <div key={i} className="option-row">
              <input value={p.left} onChange={(e) => updatePair(i, 'left', e.target.value)} placeholder="Left item" />
              <ArrowLeftRight size={14} className="muted" />
              <input value={p.right} onChange={(e) => updatePair(i, 'right', e.target.value)} placeholder="Matching right item" />
              {question.pairs.length > 2 && (
                <button type="button" className="btn btn-reject btn-sm" onClick={() => removePair(i)}><X size={13} /></button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addPair}><Plus size={13} /> Add Pair</button>
        </div>
      )}
    </div>
  )
}

export default function ActivityEditor({ data, onChange }) {
  const questions = data.questions ?? []

  function updateQuestion(i, q) {
    const next = [...questions]
    next[i] = q
    onChange({ ...data, questions: next })
  }

  function removeQuestion(i) {
    onChange({ ...data, questions: questions.filter((_, idx) => idx !== i) })
  }

  function addQuestion() {
    onChange({ ...data, questions: [...questions, defaultQuestion('multiple_choice')] })
  }

  return (
    <div className="block-editor">
      <label>
        Instructions
        <textarea
          rows={3}
          value={data.instructions ?? ''}
          onChange={(e) => onChange({ ...data, instructions: e.target.value })}
          placeholder="Instructions students see before answering."
        />
      </label>

      <label>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Users size={14} /> Activity Mode</span>
        <select
          value={data.mode ?? 'individual'}
          onChange={(e) => onChange({ ...data, mode: e.target.value })}
        >
          {ACTIVITY_MODES.map((m) => (
            <option key={m.mode} value={m.mode}>{m.label}</option>
          ))}
        </select>
      </label>
      {data.mode === 'pair' && (
        <p className="muted small">
          Students must request and accept a classmate as a partner before answering. Both students are submitted and graded together.
        </p>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={data.requireAllAnswered ?? true}
          onChange={(e) => onChange({ ...data, requireAllAnswered: e.target.checked })}
        />
        Require every question to be answered before submitting
      </label>
      {data.requireAllAnswered === false && (
        <p className="muted small">Students will be able to submit with questions left blank — those score as incorrect.</p>
      )}

      {questions.map((q, i) => (
        <QuestionEditor
          key={q.id}
          question={q}
          onChange={(next) => updateQuestion(i, next)}
          onRemove={() => removeQuestion(i)}
        />
      ))}

      <button type="button" onClick={addQuestion}><Plus size={15} /> Add Question</button>
      {questions.length === 0 && <p className="muted small">No questions yet — add one above.</p>}
    </div>
  )
}
