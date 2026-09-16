import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { haptic } from '../../lib/haptics'
import { BookOpen, Trophy, Sparkles, Flame } from 'lucide-react'

const GREETINGS = [
  { before: 5, text: 'Burning the midnight oil', mascot: '🌙' },
  { before: 12, text: 'Good morning', mascot: '☀️' },
  { before: 17, text: 'Good afternoon', mascot: '📚' },
  { before: 21, text: 'Good evening', mascot: '🌆' },
  { before: 24, text: 'Working late', mascot: '🌙' },
]

function getGreeting() {
  const hour = new Date().getHours()
  return GREETINGS.find((g) => hour < g.before) ?? GREETINGS[0]
}

export default function StudentDashboard() {
  const { user, profile } = useAuth()
  const [moduleCount, setModuleCount] = useState(0)
  const [badgeCount, setBadgeCount] = useState(0)
  const [totalBadges, setTotalBadges] = useState(0)

  const greeting = useMemo(() => getGreeting(), [])
  const firstName = (profile?.full_name ?? '').trim().split(' ')[0] || 'there'

  useEffect(() => {
    async function load() {
      const { count: badges } = await supabase
        .from('student_badges')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', user.id)

      const { count: allBadges } = await supabase
        .from('badges')
        .select('*', { count: 'exact', head: true })

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
      setTotalBadges(allBadges ?? 0)
    }
    if (user) load()
  }, [user])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="hero-banner">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <Sparkles className="hero-sparkle" size={18} style={{ top: '14%', left: '58%', animationDelay: '0.4s' }} />
          <Sparkles className="hero-sparkle" size={13} style={{ top: '68%', left: '48%', animationDelay: '1.1s' }} />
          <div className="hero-banner-text">
            <h1>{greeting.text}, {firstName}!</h1>
            <p>
              {badgeCount > 0
                ? `You've earned ${badgeCount} badge${badgeCount === 1 ? '' : 's'} so far — keep the streak going.`
                : 'Jump into a module below and start earning your first badge.'}
            </p>
          </div>
          <div className="hero-mascot" aria-hidden="true">{greeting.mascot}</div>
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
            <span className="stat-icon" style={{ background: 'var(--grad-gold)', color: 'var(--primary-dark)' }}>
              <Trophy size={20} />
            </span>
            <div className="stat-body">
              <div className="stat-number">{badgeCount}</div>
              <div className="stat-label">Badges Earned</div>
            </div>
          </div>
          {totalBadges > 0 && (
            <div className="stat-card">
              <RingBadge percent={(badgeCount / totalBadges) * 100} />
              <div className="stat-body">
                <div className="stat-number">{badgeCount}/{totalBadges}</div>
                <div className="stat-label">Badge Collection</div>
              </div>
            </div>
          )}
        </div>

        <div className="card-grid">
          <Link className="action-card" to="/student/my-modules" onClick={() => haptic('tap')}>
            <span className="action-card-icon"><BookOpen size={20} /></span>
            <h3>My Modules</h3>
            <p>Browse and continue the modules assigned to your classes.</p>
          </Link>
          <Link className="action-card" to="/student/leaderboard" onClick={() => haptic('tap')}>
            <span className="action-card-icon" style={{ background: 'var(--grad-gold)', color: 'var(--primary-dark)' }}>
              <Flame size={20} />
            </span>
            <h3>Leaderboard</h3>
            <p>See how you stack up against your classmates.</p>
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

// Inline mini ring so the stat card grid doesn't need extra layout work.
function RingBadge({ percent }) {
  const size = 46
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference
  return (
    <span className="ring-progress" style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffc72c" />
            <stop offset="100%" stopColor="#2b3990" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
    </span>
  )
}
