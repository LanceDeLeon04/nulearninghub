import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { ClipboardList, NotebookPen } from 'lucide-react'

export default function AssignModule() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedModule = searchParams.get('module') ?? ''

  const [modules, setModules] = useState([]) // all approved modules (any teacher)
  const [classes, setClasses] = useState([]) // this teacher's own classes
  const [moduleId, setModuleId] = useState(preselectedModule)
  const [classId, setClassId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')
  const [assignments, setAssignments] = useState([])

  async function loadAssignments() {
    const { data } = await supabase
      .from('module_assignments')
      .select('id, due_date, modules ( title, subject ), classes ( name )')
      .eq('assigned_by', user.id)
      .order('created_at', { ascending: false })
    setAssignments(data ?? [])
  }

  useEffect(() => {
    async function load() {
      const { data: mods } = await supabase
        .from('modules')
        .select('id, title, subject, teacher_id, profiles:teacher_id ( full_name )')
        .eq('status', 'approved')
        .order('title')
      setModules(mods ?? [])

      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, subject')
        .eq('teacher_id', user.id)
        .order('name')
      setClasses(cls ?? [])

      await loadAssignments()
    }
    if (user) load()
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.from('module_assignments').insert({
      module_id: moduleId,
      class_id: classId,
      assigned_by: user.id,
      due_date: dueDate || null,
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }

    setMessage('Module assigned to class.')
    setDueDate('')
    setClassId('')
    await loadAssignments()
  }

  async function handleRemove(id) {
    const { error } = await supabase.from('module_assignments').delete().eq('id', id)
    if (!error) await loadAssignments()
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><ClipboardList size={22} /> Assign Module to Class</h1>
        <p className="subtitle">
          Pick any approved module and one of your classes, and set a deadline for students to finish it by.
        </p>

        {message && <div className="info-banner">{message}</div>}

        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Module
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} required>
                <option value="" disabled>Select an approved module</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} — {m.subject} (by {m.profiles?.full_name})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="" disabled>Select one of your classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>
                ))}
              </select>
            </label>

            <label>
              Deadline
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <button type="submit">Assign Module</button>
        </form>

        <h3 style={{ marginTop: '2rem' }}>My Assignments</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Class</th>
              <th>Due Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.modules?.title} <span className="muted">({a.modules?.subject})</span></td>
                <td>{a.classes?.name}</td>
                <td>{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <Link className="btn" to={`/teacher/assignment/${a.id}/notes`}><NotebookPen size={14} /> View Notes</Link>
                  <button className="btn btn-reject" onClick={() => handleRemove(a.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && <tr><td colSpan={4}>No modules assigned yet.</td></tr>}
          </tbody>
        </table>
      </main>
    </div>
  )
}
