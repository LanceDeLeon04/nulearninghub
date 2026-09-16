import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { PlusCircle } from 'lucide-react'

export default function CreateClass() {
  const { user } = useAuth()
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('')
  const [students, setStudents] = useState([]) // all student profiles
  const [selected, setSelected] = useState([]) // selected student ids
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadStudents() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'student')
        .order('full_name')
      if (!error) setStudents(data ?? [])
    }
    loadStudents()
  }, [])

  function toggleStudent(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  async function handleCreateClass(e) {
    e.preventDefault()
    setMessage('')

    const { data: newClass, error } = await supabase
      .from('classes')
      .insert({ name: className, subject, teacher_id: user.id })
      .select()
      .single()

    if (error) {
      setMessage(`Error creating class: ${error.message}`)
      return
    }

    if (selected.length > 0) {
      const rows = selected.map((studentId) => ({
        class_id: newClass.id,
        student_id: studentId,
      }))
      const { error: enrollError } = await supabase.from('class_students').insert(rows)
      if (enrollError) {
        setMessage(`Class created, but failed to add some students: ${enrollError.message}`)
        return
      }
    }

    setMessage('Class created successfully.')
    setClassName('')
    setSubject('')
    setSelected([])
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><PlusCircle size={22} /> Create Class</h1>
        {message && <div className="info-banner">{message}</div>}

        <form className="form-card" onSubmit={handleCreateClass}>
          <label>
            Class Name
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Grade 8 - Section A"
              required
            />
          </label>
          <label>
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Mathematics"
              required
            />
          </label>

          <h3>Add Students from Database</h3>
          <div className="student-list">
            {students.length === 0 && <p>No student accounts found yet.</p>}
            {students.map((s) => (
              <label key={s.id} className="student-row">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                />
                {s.full_name} <span className="muted">({s.email})</span>
              </label>
            ))}
          </div>

          <button type="submit">Create Class</button>
        </form>
      </main>
    </div>
  )
}
