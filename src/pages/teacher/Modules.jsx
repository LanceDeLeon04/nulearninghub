import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { BookOpen, Eye, GraduationCap, BookMarked } from 'lucide-react'

export default function Modules() {
  const [modules, setModules] = useState([])

  useEffect(() => {
    async function load() {
      // Every teacher sees every approved module, regardless of who submitted it.
      const { data, error } = await supabase
        .from('modules')
        .select('*, profiles:teacher_id ( full_name )')
        .eq('status', 'approved')
        .order('sequence_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (!error) setModules(data ?? [])
    }
    load()
  }, [])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><BookOpen size={22} /> Modules</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link className="btn btn-outline" to="/teacher/teachers-guide"><GraduationCap size={15} /> Teacher's Guide</Link>
            <Link className="btn btn-outline" to="/resources"><BookMarked size={15} /> References & Rubric</Link>
            <Link className="btn" to="/teacher/add-module">+ Add Module</Link>
          </div>
        </div>
        <p className="subtitle">All modules approved by the admin, from every teacher, are available here to assign to your classes.</p>

        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Submitted By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id}>
                <td>{m.title}</td>
                <td>{m.subject}</td>
                <td>{m.profiles?.full_name}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <Link className="btn" to={`/teacher/module-preview/${m.id}`}><Eye size={14} /> Preview</Link>
                  <Link className="btn" to={`/teacher/assign-module?module=${m.id}`}>Assign to Class</Link>
                </td>
              </tr>
            ))}
            {modules.length === 0 && (
              <tr><td colSpan={4}>No approved modules yet.</td></tr>
            )}
          </tbody>
        </table>
      </main>
    </div>
  )
}
