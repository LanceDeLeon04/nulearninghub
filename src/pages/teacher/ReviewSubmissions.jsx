import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import RichText from '../../components/RichText'
import { isSubjective } from '../../lib/blockTypes'
import { haptic } from '../../lib/haptics'
import { ArrowLeft, ClipboardCheck, Loader2, Hourglass, Check } from 'lucide-react'

// Where a teacher scores the written, "answers may vary" questions the
// auto-grader deliberately leaves alone. Everything listed here is a
// student_progress row with pending_review = true; scoring it writes
// teacher_score/teacher_feedback and clears the flag, at which point the
// database trigger recomputes the student's points for that activity.
export default function ReviewSubmissions() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({}) // progress_id -> { score, feedback }
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_pending_reviews')
    if (error) setMessage(`Error: ${error.message}`)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  function draftFor(row) {
    return drafts[row.progress_id] ?? { score: '', feedback: '' }
  }

  async function handleSave(row) {
    const draft = draftFor(row)
    const score = Number(draft.score)
    if (draft.score === '' || Number.isNaN(score) || score < 0 || score > Number(row.subjective_max)) {
      setMessage(`Enter a score between 0 and ${row.subjective_max}.`)
      return
    }
    setSavingId(row.progress_id)
    const { error } = await supabase
      .from('student_progress')
      .update({
        teacher_score: score,
        teacher_feedback: draft.feedback?.trim() || null,
        pending_review: false,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', row.progress_id)
    setSavingId(null)
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    haptic('success')
    setMessage('Scored.')
    await load()
  }

  // Only the questions the teacher actually has to score, paired with the
  // student's answer and the key's model answer where the block has one.
  function subjectiveQuestions(row) {
    return (row.block_data?.questions ?? []).filter(isSubjective)
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><ClipboardCheck size={22} /> Review Submissions</h1>
            <p className="subtitle">
              Written answers waiting for a score. These questions have no single
              correct answer, so the app leaves them unscored until you read them.
            </p>
          </div>
          <Link className="btn" to="/teacher"><ArrowLeft size={15} /> Back to Dashboard</Link>
        </div>

        {message && <div className="info-banner">{message}</div>}

        {loading && (
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Loader2 size={16} className="spin" /> Loading…
          </p>
        )}

        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-emoji">✅</div>
            <h3>Nothing waiting</h3>
            <p>Every written answer from your classes has been scored. New ones will appear here as students submit them.</p>
          </div>
        )}

        {rows.map((row) => {
          const draft = draftFor(row)
          return (
            <div key={row.progress_id} className="module-card review-card">
              <div className="review-card-head">
                <div>
                  <h3>{row.student_name}</h3>
                  <p className="muted small">
                    {row.module_title} · {row.block_title} · {row.class_name}
                    {row.submitted_at && ` · submitted ${new Date(row.submitted_at).toLocaleDateString()}`}
                  </p>
                </div>
                <span className="badge status-pending"><Hourglass size={13} /> {row.subjective_max} pt{Number(row.subjective_max) === 1 ? '' : 's'} to score</span>
              </div>

              {Number(row.auto_max) > 0 && (
                <p className="muted small">Auto-scored part: {row.auto_score} / {row.auto_max}</p>
              )}

              {subjectiveQuestions(row).map((q) => (
                <div key={q.id} className="review-answer">
                  <RichText as="p" className="question-prompt" text={q.prompt} />
                  <p className="review-student-answer">{row.response?.[q.id] || <span className="muted">(left blank)</span>}</p>
                  {q.sampleAnswer && (
                    <details className="review-key">
                      <summary>Model answer from the key</summary>
                      <p>{q.sampleAnswer}</p>
                    </details>
                  )}
                </div>
              ))}

              <div className="review-score-row">
                <label>
                  Score (out of {row.subjective_max})
                  <input
                    type="number"
                    min="0"
                    max={row.subjective_max}
                    step="0.5"
                    value={draft.score}
                    onChange={(e) => setDrafts({ ...drafts, [row.progress_id]: { ...draft, score: e.target.value } })}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  Feedback (optional — the student sees this)
                  <input
                    value={draft.feedback}
                    onChange={(e) => setDrafts({ ...drafts, [row.progress_id]: { ...draft, feedback: e.target.value } })}
                    placeholder="What was good, what to work on"
                  />
                </label>
                <button onClick={() => handleSave(row)} disabled={savingId === row.progress_id}>
                  <Check size={15} /> {savingId === row.progress_id ? 'Saving…' : 'Save score'}
                </button>
              </div>

              <p className="muted small">
                Use the rubric on the References &amp; Rubric page if you want a consistent scale.{' '}
                <Link to="/resources">Open it</Link>
              </p>
            </div>
          )
        })}
      </main>
    </div>
  )
}
