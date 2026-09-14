import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { Users } from 'lucide-react'

export default function ClassManagement() {
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [students, setStudents] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [rosters, setRosters] = useState({}) // classId -> [{student_id, profiles}]

  const [newName, setNewName] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newTeacherId, setNewTeacherId] = useState('')
  const [message, setMessage] = useState('')

  async function loadClasses() {
    const { data, error } = await supabase
      .from('classes')
      .select('*, profiles:teacher_id ( id, full_name, email )')
      .order('created_at', { ascending: false })
    if (error) {
      setMessage(`Error loading sections: ${error.message}`)
      return
    }
    setClasses(data ?? [])
  }

  useEffect(() => {
    async function loadBase() {
      await loadClasses()
      const { data: t } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name')
      setTeachers(t ?? [])
      const { data: s } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name')
      setStudents(s ?? [])
    }
    loadBase()
  }, [])

  async function loadRoster(classId) {
    const { data, error } = await supabase
      .from('class_students')
      .select('student_id, profiles:student_id ( id, full_name, email )')
      .eq('class_id', classId)
    if (error) {
      setMessage(`Error loading roster: ${error.message}`)
      return
    }
    setRosters((prev) => ({ ...prev, [classId]: data ?? [] }))
  }

  async function toggleExpand(classId) {
    if (expanded === classId) {
      setExpanded(null)
      return
    }
    setExpanded(classId)
    await loadRoster(classId)
  }

  // Create a new section/class, optionally pre-assigned to a teacher.
  async function handleCreateClass(e) {
    e.preventDefault()
    setMessage('')
    if (!newTeacherId) {
      setMessage('Select a teacher for this section.')
      return
    }
    const { error } = await supabase.from('classes').insert({
      name: newName,
      subject: newSubject,
      teacher_id: newTeacherId,
    })
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    setNewName('')
    setNewSubject('')
    setNewTeacherId('')
    setMessage('Section created.')
    await loadClasses()
  }

  // Reassign a section to a different teacher.
  async function handleReassignTeacher(classId, teacherId) {
    const { error } = await supabase.from('classes').update({ teacher_id: teacherId }).eq('id', classId)
    if (!error) await loadClasses()
  }

  async function handleAddStudent(classId, studentId) {
    if (!studentId) return
    const { error } = await supabase.from('class_students').insert({ class_id: classId, student_id: studentId })
    if (error) {
      setMessage(`Error adding student: ${error.message}`)
      return
    }
    await loadRoster(classId)
  }

  async function handleRemoveStudent(classId, studentId) {
    const { error } = await supabase
      .from('class_students')
      .delete()
      .eq('class_id', classId)
      .eq('student_id', studentId)
    if (!error) await loadRoster(classId)
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><Users size={22} /> Class Management</h1>
        <p className="subtitle">Create sections, assign them to teachers, and assign students to sections.</p>

        {message && <div className="info-banner">{message}</div>}

        <form className="form-card" onSubmit={handleCreateClass}>
          <h3>Create Section</h3>
          <div className="form-grid">
            <label>
              Section Name
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Grade 8 - Section A" required />
            </label>
            <label>
              Subject
              <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Mathematics" required />
            </label>
            <label>
              Assign to Teacher
              <select value={newTeacherId} onChange={(e) => setNewTeacherId(e.target.value)} required>
                <option value="" disabled>Select a teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit">Create Section</button>
        </form>

        <h3 style={{ marginTop: '2rem' }}>All Sections</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <>
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.subject}</td>
                  <td>
                    <select
                      value={c.teacher_id}
                      onChange={(e) => handleReassignTeacher(c.id, e.target.value)}
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggleExpand(c.id)}>
                      {expanded === c.id ? 'Hide Roster' : 'Manage Roster'}
                    </button>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr>
                    <td colSpan={4}>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                          <p className="muted small" style={{ marginBottom: '0.4rem' }}>Enrolled students</p>
                          <ul className="roster-list">
                            {(rosters[c.id] ?? []).map((r) => (
                              <li key={r.student_id}>
                                {r.profiles?.full_name} — {r.profiles?.email}{' '}
                                <button
                                  className="btn btn-reject"
                                  style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '6px' }}
                                  onClick={() => handleRemoveStudent(c.id, r.student_id)}
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                            {(rosters[c.id] ?? []).length === 0 && <li>No students enrolled yet.</li>}
                          </ul>
                        </div>
                        <div>
                          <p className="muted small" style={{ marginBottom: '0.4rem' }}>Add a student</p>
                          <select
                            defaultValue=""
                            onChange={(e) => { handleAddStudent(c.id, e.target.value); e.target.value = '' }}
                          >
                            <option value="" disabled>Select a student</option>
                            {students
                              .filter((s) => !(rosters[c.id] ?? []).some((r) => r.student_id === s.id))
                              .map((s) => (
                                <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {classes.length === 0 && <tr><td colSpan={4}>No sections created yet.</td></tr>}
          </tbody>
        </table>
      </main>
    </div>
  )
}
