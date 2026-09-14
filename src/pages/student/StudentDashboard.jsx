import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { haptic } from '../../lib/haptics'
import { LayoutDashboard, BookOpen, Trophy } from 'lucide-react'

export default function StudentDashboard() {
  const { user } = useAuth()
  const [moduleCount, setModuleCount] = useState(0)
  const [badgeCount, setBadgeCount] = useState(0)

  useEffect(() => {
    async function load() {
      // classes the student belongs to -> modules by those teachers (approved only)
      const { count: badges } = await supabase
        .from('student_badges')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', user.id)

      const { data: classRows } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', user.id)

      const classIds = (classRows ?? []).map((c) => c.class_id)
      let modules = 0
      if (classIds.length > 0) {
        const { data: classes } = await supabase
          .from('classes')
          .select('teacher_id')
          .in('id', classIds)
        const teacherIds = [...new Set((classes ?? []).map((c) => c.teacher_id))]
        if (teacherIds.length > 0) {
          const { count } = await supabase
            .from('modules')
            .select('*', { count: 'exact', head: true })
            .in('teacher_id', teacherIds)
            .eq('status', 'approved')
          modules = count ?? 0
        }
      }

      setModuleCount(modules)
      setBadgeCount(badges ?? 0)
    }
    if (user) load()
  }, [user])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><LayoutDashboard size={22} /> Student Dashboard</h1>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-icon"><BookOpen size={20} /></span>
            <div className="stat-body">
              <div className="stat-number">{moduleCount}</div>
              <div className="stat-label">Available Modules</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><Trophy size={20} /></span>
            <div className="stat-body">
              <div className="stat-number">{badgeCount}</div>
              <div className="stat-label">Badges Earned</div>
            </div>
          </div>
        </div>

        <div className="card-grid">
          <Link className="action-card" to="/student/my-modules" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><BookOpen size={20} /></span>
            <h3>My Modules</h3>
            <p>Browse and continue the modules assigned to your classes.</p>
          </Link>
          <Link className="action-card" to="/student/my-badges" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><Trophy size={20} /></span>
            <h3>My Badges</h3>
            <p>See the achievements you've earned so far.</p>
          </Link>
        </div>
      </main>
    </div>
  )
}
