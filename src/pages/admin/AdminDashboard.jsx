import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { haptic } from '../../lib/haptics'
import {
  LayoutDashboard,
  Clock,
  School,
  GraduationCap,
  Users,
  CheckSquare,
  UserPlus,
} from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ pending: 0, classes: 0, students: 0, teachers: 0 })

  useEffect(() => {
    async function load() {
      const { count: pending } = await supabase
        .from('modules').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      const { count: classes } = await supabase
        .from('classes').select('*', { count: 'exact', head: true })
      const { count: students } = await supabase
        .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')
      const { count: teachers } = await supabase
        .from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher')

      setStats({
        pending: pending ?? 0,
        classes: classes ?? 0,
        students: students ?? 0,
        teachers: teachers ?? 0,
      })
    }
    load()
  }, [])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><LayoutDashboard size={22} /> Admin Dashboard</h1>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-icon"><Clock size={20} /></span>
            <div className="stat-body"><div className="stat-number">{stats.pending}</div><div className="stat-label">Pending Modules</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><School size={20} /></span>
            <div className="stat-body"><div className="stat-number">{stats.classes}</div><div className="stat-label">Total Classes</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><GraduationCap size={20} /></span>
            <div className="stat-body"><div className="stat-number">{stats.teachers}</div><div className="stat-label">Teachers</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><Users size={20} /></span>
            <div className="stat-body"><div className="stat-number">{stats.students}</div><div className="stat-label">Students</div></div>
          </div>
        </div>

        <div className="card-grid">
          <Link className="action-card" to="/admin/module-approval" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><CheckSquare size={20} /></span>
            <h3>Module Approval</h3>
            <p>Review and approve or reject modules submitted by teachers.</p>
          </Link>
          <Link className="action-card" to="/admin/class-management" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><Users size={20} /></span>
            <h3>Class Management</h3>
            <p>View all classes, teachers, and enrolled students.</p>
          </Link>
          <Link className="action-card" to="/admin/create-accounts" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><UserPlus size={20} /></span>
            <h3>Create Accounts</h3>
            <p>Create new Teacher and Student accounts.</p>
          </Link>
        </div>
      </main>
    </div>
  )
}
