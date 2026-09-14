import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { NotebookPen, ArrowLeft, Loader2 } from 'lucide-react'

export default function AssignmentNotes() {
  const { assignmentId } = useParams()
  const [assignment, setAssignment] = useState(null)
  const [lectures, setLectures] = useState([]) // module_content rows, type=lecture
  const [studentsById, setStudentsById] = useState({})
  const [highlights, setHighlights] = useState([]) // lecture_highlights rows
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: a } = await supabase
        .from('module_assignments')
        .select('id, module_id, class_id, modules ( title, subject ), classes ( name )')
        .eq('id', assignmentId)
        .single()
      setAssignment(a)

      if (a?.module_id) {
        const { data: blocks } = await supabase
          .from('module_content')
          .select('id, title, order_index')
          .eq('module_id', a.module_id)
          .eq('type', 'lecture')
          .order('order_index', { ascending: true })
        setLectures(blocks ?? [])
      }

      if (a?.class_id) {
        const { data: roster } = await supabase
          .from('class_students')
          .select('profiles:student_id ( id, full_name )')
          .eq('class_id', a.class_id)
        const map = {}
        for (const row of roster ?? []) if (row.profiles) map[row.profiles.id] = row.profiles.full_name
        setStudentsById(map)
      }

      const { data: h } = await supabase
        .from('lecture_highlights')
        .select('content_id, student_id, quote, note, start_offset, created_at')
        .eq('assignment_id', assignmentId)
        .order('start_offset', { ascending: true })
      setHighlights(h ?? [])
      setLoading(false)
    }
    load()
  }, [assignmentId])

  const highlightsFor = (contentId, studentId) =>
    highlights.filter((h) => h.content_id === contentId && h.student_id === studentId)

  const studentIds = Object.keys(studentsById)

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><NotebookPen size={22} /> Student Highlights & Notes</h1>
            <p className="subtitle">{assignment?.modules?.title} — {assignment?.classes?.name}</p>
          </div>
          <Link className="btn" to="/teacher/assign-module"><ArrowLeft size={15} /> Back to Assignments</Link>
        </div>

        {loading && <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Loader2 size={16} className="spin" /> Loading…</p>}

        {!loading && lectures.length === 0 && (
          <p className="muted">This module has no lecture blocks, so there's nothing to annotate.</p>
        )}

        {!loading && lectures.length > 0 && studentIds.length === 0 && (
          <p className="muted">No students are enrolled in this class yet.</p>
        )}

        {!loading && lectures.length > 0 && studentIds.map((studentId) => (
          <div key={studentId} className="module-card" style={{ marginBottom: '1rem' }}>
            <h3>{studentsById[studentId]}</h3>
            {lectures.map((lec) => {
              const items = highlightsFor(lec.id, studentId)
              return (
                <div key={lec.id} className="notes-block">
                  <div className="muted small" style={{ marginBottom: '0.4rem', fontWeight: 600 }}>{lec.title}</div>
                  {items.length === 0 ? (
                    <p className="notes-block-empty">No highlights yet.</p>
                  ) : (
                    items.map((h, i) => (
                      <div key={i} className="notes-block-quote">
                        "{h.quote}"
                        {h.note && <p className="notes-block-quote-note">{h.note}</p>}
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </main>
    </div>
  )
}
