import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { Users, NotebookPen, Eye, ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { formatUsername } from '../../lib/formatUsername'

// Teacher-facing class management. Unlike the admin version, teachers can't
// create sections or add/remove students here — that's admin-only. This page
// is read-only: view your rosters, and track how each student is doing on
// the modules you've assigned (completion + score), plus their annotations.
export default function ClassManagement() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([]) // module_assignments for my classes
  const [rosterByClass, setRosterByClass] = useState({}) // classId -> [{id, full_name, email}]
  const [expanded, setExpanded] = useState(null) // assignmentId currently expanded
  const [progressByAssignment, setProgressByAssignment] = useState({}) // assignmentId -> { studentId: {...} }
  const [loading, setLoading] = useState(true)
  const [expandedLeaderboard, setExpandedLeaderboard] = useState(null) // classId currently expanded
  const [leaderboardByClass, setLeaderboardByClass] = useState({}) // classId -> rows

  async function toggleLeaderboard(classId) {
    if (expandedLeaderboard === classId) {
      setExpandedLeaderboard(null)
      return
    }
    setExpandedLeaderboard(classId)
    if (leaderboardByClass[classId]) return // already loaded
    const { data, error } = await supabase.rpc('get_class_leaderboard', { p_class_id: classId })
    setLeaderboardByClass((prev) => ({ ...prev, [classId]: error ? [] : data ?? [] }))
  }

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)

      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, subject')
        .eq('teacher_id', user.id)
        .order('name')
      setClasses(cls ?? [])

      const classIds = (cls ?? []).map((c) => c.id)
      if (classIds.length > 0) {
        const { data: a } = await supabase
          .from('module_assignments')
          .select('id, due_date, module_id, class_id, modules ( title, subject )')
          .in('class_id', classIds)
          .order('created_at', { ascending: false })
        setAssignments(a ?? [])

        const { data: roster } = await supabase
          .from('class_students')
          .select('class_id, profiles:student_id ( id, full_name, email )')
          .in('class_id', classIds)
        const rosterMap = {}
        for (const row of roster ?? []) {
          if (!rosterMap[row.class_id]) rosterMap[row.class_id] = []
          if (row.profiles) rosterMap[row.class_id].push(row.profiles)
        }
        setRosterByClass(rosterMap)
      }

      setLoading(false)
    }
    load()
  }, [user])

  async function toggleExpand(assignment) {
    if (expanded === assignment.id) {
      setExpanded(null)
      return
    }
    setExpanded(assignment.id)
    if (progressByAssignment[assignment.id]) return // already loaded

    const { data: blocks } = await supabase
      .from('module_content')
      .select('id')
      .eq('module_id', assignment.module_id)

    const { data: rows } = await supabase
      .from('student_progress')
      .select('student_id, content_id, completed, score, max_score')
      .eq('assignment_id', assignment.id)

    const totalBlocks = blocks?.length ?? 0
    const roster = rosterByClass[assignment.class_id] ?? []
    const summary = {}
    for (const s of roster) {
      const mine = (rows ?? []).filter((r) => r.student_id === s.id)
      const completedCount = mine.filter((r) => r.completed).length
      const scoreSum = mine.reduce((sum, r) => sum + (r.score ?? 0), 0)
      const maxSum = mine.reduce((sum, r) => sum + (r.max_score ?? 0), 0)
      summary[s.id] = {
        completedCount,
        totalBlocks,
        scorePct: maxSum > 0 ? Math.round((scoreSum / maxSum) * 100) : null,
      }
    }
    setProgressByAssignment((prev) => ({ ...prev, [assignment.id]: summary }))
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><Users size={22} /> Class Management</h1>
        <p className="subtitle">
          View your class rosters and track each student's progress and annotations. Creating sections and adding
          students is managed by the Administrator.
        </p>

        {loading && <p className="muted">Loading…</p>}

        {!loading && classes.length === 0 && (
          <p className="muted">You haven't been assigned any sections yet. Ask an Administrator to set one up for you.</p>
        )}

        {!loading && classes.map((c) => {
          const roster = rosterByClass[c.id] ?? []
          const classAssignments = assignments.filter((a) => a.class_id === c.id)
          return (
            <div key={c.id} className="module-card" style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <h3>{c.name}</h3>
                  <p className="muted small">{c.subject} — {roster.length} student{roster.length === 1 ? '' : 's'}</p>
                </div>
                <button className="btn" onClick={() => toggleLeaderboard(c.id)}>
                  <Trophy size={14} /> {expandedLeaderboard === c.id ? 'Hide Leaderboard' : 'Leaderboard'}
                </button>
              </div>

              {expandedLeaderboard === c.id && (
                <div style={{ marginTop: '0.8rem' }}>
                  {!leaderboardByClass[c.id] ? (
                    <p className="muted small">Loading…</p>
                  ) : leaderboardByClass[c.id].length === 0 ? (
                    <p className="muted small">No points logged for this section yet.</p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Student</th>
                          <th>Points</th>
                          <th>Badges</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboardByClass[c.id].map((r) => (
                          <tr key={r.student_id}>
                            <td>#{r.rank}</td>
                            <td>{r.full_name}</td>
                            <td>{r.total_points}</td>
                            <td>{r.badge_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <p className="muted small" style={{ fontWeight: 600, marginTop: '0.8rem' }}>Roster</p>
              {roster.length === 0 ? (
                <p className="muted small">No students enrolled yet.</p>
              ) : (
                <div className="student-list two-col">
                  {roster.map((s) => (
                    <span key={s.id} className="student-row">{s.full_name} <span className="muted">({formatUsername(s.email)})</span></span>
                  ))}
                </div>
              )}

              <p className="muted small" style={{ fontWeight: 600, marginTop: '1rem' }}>Assigned Modules</p>
              {classAssignments.length === 0 ? (
                <p className="muted small">No modules assigned to this section yet.</p>
              ) : (
                <table className="data-table" style={{ marginTop: '0.5rem' }}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Due Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {classAssignments.map((a) => (
                      <>
                        <tr key={a.id}>
                          <td>{a.modules?.title} <span className="muted">({a.modules?.subject})</span></td>
                          <td>{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</td>
                          <td style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn" onClick={() => toggleExpand(a)}>
                              {expanded === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Progress
                            </button>
                            <Link className="btn" to={`/teacher/assignment/${a.id}/notes`}><NotebookPen size={14} /> Annotations</Link>
                            <Link className="btn" to={`/teacher/module-preview/${a.module_id}`}><Eye size={14} /> Preview</Link>
                          </td>
                        </tr>
                        {expanded === a.id && (
                          <tr>
                            <td colSpan={3}>
                              {!progressByAssignment[a.id] ? (
                                <p className="muted small">Loading progress…</p>
                              ) : roster.length === 0 ? (
                                <p className="muted small">No students enrolled yet.</p>
                              ) : (
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>Student</th>
                                      <th>Blocks Completed</th>
                                      <th>Score</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {roster.map((s) => {
                                      const p = progressByAssignment[a.id][s.id]
                                      return (
                                        <tr key={s.id}>
                                          <td>{s.full_name}</td>
                                          <td>{p ? `${p.completedCount} / ${p.totalBlocks}` : '—'}</td>
                                          <td>{p && p.scorePct !== null ? `${p.scorePct}%` : '—'}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}
