import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { haptic } from '../../lib/haptics'
import {
  LayoutDashboard,
  School,
  BookOpen,
  ClipboardList,
  FilePlus2,
  Users,
} from 'lucide-react'

export default function TeacherDashboard() {
  const { user } = useAuth()
  const [classCount, setClassCount] = useState(0)
  const [moduleCount, setModuleCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { count: classes } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id)

      const { count: modules } = await supabase
        .from('modules')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id)

      setClassCount(classes ?? 0)
      setModuleCount(modules ?? 0)
    }
    if (user) load()
  }, [user])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><LayoutDashboard size={22} /> Teacher Dashboard</h1>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-icon"><School size={20} /></span>
            <div className="stat-body">
              <div className="stat-number">{classCount}</div>
              <div className="stat-label">My Classes</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><BookOpen size={20} /></span>
            <div className="stat-body">
              <div className="stat-number">{moduleCount}</div>
              <div className="stat-label">My Modules</div>
            </div>
          </div>
        </div>

        <div className="card-grid">
          <Link className="action-card" to="/teacher/class-management" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><Users size={20} /></span>
            <h3>Class Management</h3>
            <p>View your rosters and track student progress and annotations.</p>
          </Link>
          <Link className="action-card" to="/teacher/modules" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><BookOpen size={20} /></span>
            <h3>Modules</h3>
            <p>Browse all admin-approved modules from every teacher.</p>
          </Link>
          <Link className="action-card" to="/teacher/assign-module" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><ClipboardList size={20} /></span>
            <h3>Assign Module</h3>
            <p>Assign an approved module to one of your classes with a deadline.</p>
          </Link>
          <Link className="action-card" to="/teacher/add-module" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><FilePlus2 size={20} /></span>
            <h3>Add Module</h3>
            <p>Submit a new subject module for admin approval.</p>
          </Link>
        </div>
      </main>
    </div>
  )
}
