import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { FilePlus2 } from 'lucide-react'

const STATUS_LABEL = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

export default function AddModule() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [mySubmissions, setMySubmissions] = useState([])

  async function loadSubmissions() {
    const { data } = await supabase
      .from('modules')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    setMySubmissions(data ?? [])
  }

  useEffect(() => {
    if (user) loadSubmissions()
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.from('modules').insert({
      title,
      subject,
      description,
      teacher_id: user.id,
      status: 'pending', // all new modules require admin approval
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }

    setMessage('Module submitted for admin approval.')
    setTitle('')
    setSubject('')
    setDescription('')
    await loadSubmissions()
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><FilePlus2 size={22} /> Add Module</h1>
        <p className="subtitle">New modules are sent to the Administrator for approval. Once approved, they show up in Modules for every teacher to assign.</p>

        {message && <div className="info-banner">{message}</div>}

        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Module Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </label>
            <label className="form-span-full">
              Description
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will students learn in this module?"
              />
            </label>
          </div>
          <button type="submit">Submit for Approval</button>
        </form>

        <h3 style={{ marginTop: '2rem' }}>My Submissions</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mySubmissions.map((m) => (
              <tr key={m.id}>
                <td>{m.title}</td>
                <td>{m.subject}</td>
                <td><span className={`badge status-${m.status}`}>{STATUS_LABEL[m.status] ?? m.status}</span></td>
                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                <td><Link className="btn" to={`/teacher/module-builder/${m.id}`}>Build Content</Link></td>
              </tr>
            ))}
            {mySubmissions.length === 0 && <tr><td colSpan={5}>No modules submitted yet.</td></tr>}
          </tbody>
        </table>
      </main>
    </div>
  )
}

