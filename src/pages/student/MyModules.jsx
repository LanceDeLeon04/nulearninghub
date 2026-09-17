import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import RingProgress from '../../components/RingProgress'
import { BookOpen, Crown, Sparkles, BookMarked } from 'lucide-react'

const SUBJECT_EMOJI = {
  math: '📐', mathematics: '📐',
  science: '🔬', biology: '🧬', chemistry: '⚗️', physics: '🪐',
  english: '📖', literature: '📖',
  history: '🏛️', araling: '🏛️',
  filipino: '🇵🇭',
  computer: '💻', programming: '💻', ict: '💻',
  art: '🎨', music: '🎵', pe: '⚽', physical: '⚽',
}

function subjectEmoji(subject) {
  if (!subject) return '📘'
  const key = subject.toLowerCase()
  const found = Object.keys(SUBJECT_EMOJI).find((k) => key.includes(k))
  return found ? SUBJECT_EMOJI[found] : '📘'
}

function daysLeftLabel(dueDate) {
  if (!dueDate) return null
  const diff = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { text: 'Past due', tone: 'status-rejected' }
  if (diff === 0) return { text: 'Due today', tone: 'status-pending' }
  return { text: `${diff} day${diff === 1 ? '' : 's'} left`, tone: diff <= 3 ? 'status-pending' : 'status-approved' }
}

export default function MyModules() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])

  useEffect(() => {
    async function load() {
      const { data: classRows } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', user.id)

      const classIds = (classRows ?? []).map((c) => c.class_id)
      if (classIds.length === 0) {
        setAssignments([])
        return
      }

      const { data, error } = await supabase
        .from('module_assignments')
        .select('id, due_date, module_id, modules ( title, subject, description, sequence_order ), classes ( name )')
        .in('class_id', classIds)

      if (error || !data) {
        setAssignments([])
        return
      }

      // Always follow the curriculum position the teacher set
      // (Preliminaries, Module 1, Module 2, ...), not the due date or
      // whatever order Postgres happened to return rows in. Due date only
      // breaks ties between modules that share (or lack) a sequence_order.
      data.sort((a, b) => {
        const seqA = a.modules?.sequence_order ?? 0
        const seqB = b.modules?.sequence_order ?? 0
        if (seqA !== seqB) return seqA - seqB
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      })

      const assignmentIds = data.map((a) => a.id)
      const moduleIds = [...new Set(data.map((a) => a.module_id))]

      const { data: contentRows } = await supabase
        .from('module_content')
        .select('id, module_id')
        .in('module_id', moduleIds)

      const { data: progressRows } = await supabase
        .from('student_progress')
        .select('content_id, assignment_id, completed')
        .in('assignment_id', assignmentIds)
        .eq('student_id', user.id)
        .eq('completed', true)

      const totalByModule = {}
      for (const c of contentRows ?? []) {
        totalByModule[c.module_id] = (totalByModule[c.module_id] ?? 0) + 1
      }
      const doneByAssignment = {}
      for (const p of progressRows ?? []) {
        doneByAssignment[p.assignment_id] = (doneByAssignment[p.assignment_id] ?? 0) + 1
      }

      const withProgress = data.map((a) => ({
        ...a,
        totalBlocks: totalByModule[a.module_id] ?? 0,
        completedBlocks: doneByAssignment[a.id] ?? 0,
      }))

      setAssignments(withProgress)
    }
    if (user) load()
  }, [user])

  const finishedCount = assignments.filter((a) => a.totalBlocks > 0 && a.completedBlocks === a.totalBlocks).length

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><BookOpen size={22} /> My Modules</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {assignments.length > 0 && (
              <p className="subtitle" style={{ margin: 0 }}>
                {finishedCount === assignments.length
                  ? '🎉 All caught up — great work!'
                  : `${finishedCount} of ${assignments.length} finished`}
              </p>
            )}
            <Link className="btn btn-outline" to="/resources"><BookMarked size={15} /> References & Rubric</Link>
          </div>
        </div>
        <div className="card-grid">
          {assignments.map((a) => {
            const due = daysLeftLabel(a.due_date)
            const pct = a.totalBlocks ? Math.round((a.completedBlocks / a.totalBlocks) * 100) : 0
            const started = a.completedBlocks > 0
            const finished = a.totalBlocks > 0 && a.completedBlocks === a.totalBlocks
            return (
              <div key={a.id} className={`module-card${finished ? ' finished' : ''}`}>
                <div className="module-card-top">
                  <span className="subject-chip">{subjectEmoji(a.modules?.subject)} {a.modules?.subject}</span>
                  {finished && <Crown className="module-card-crown" size={18} />}
                  {!finished && !started && <span className="module-card-tag-new"><Sparkles size={10} /> New</span>}
                </div>
                <h3>{a.modules?.title}</h3>
                <p className="muted">{a.classes?.name}</p>
                <p>{a.modules?.description}</p>
                <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="muted small">
                    {a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : 'No deadline set'}
                  </span>
                  {due && <span className={`badge ${due.tone}`}>{due.text}</span>}
                </div>

                {a.totalBlocks > 0 && (
                  <div className="module-card-ring-row">
                    <RingProgress percent={pct} size={44} stroke={5} />
                    <div style={{ flex: 1 }}>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="muted small" style={{ margin: '0.3rem 0 0' }}>{a.completedBlocks} / {a.totalBlocks} complete</p>
                    </div>
                  </div>
                )}

                <Link className="btn" style={{ marginTop: '0.9rem', display: 'inline-block' }} to={`/student/module/${a.id}`}>
                  {finished ? 'Review' : started ? 'Continue' : a.totalBlocks === 0 ? 'Open' : 'Start'}
                </Link>
              </div>
            )
          })}
          {assignments.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-emoji">🗂️</div>
              <h3>Nothing assigned yet</h3>
              <p>Once your teacher assigns a module to your class, it'll show up right here — check back soon!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
