import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import nuLogo from '../assets/nu-logo-full.png'
import { haptic } from '../lib/haptics'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  FilePlus2,
  Trophy,
  Award,
  CheckSquare,
  Users,
  UserPlus,
  MessageSquare,
  LogOut,
  ClipboardCheck,
} from 'lucide-react'

const NAV_LINKS = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/teacher/class-management', label: 'Class Management', icon: Users },
    { to: '/teacher/modules', label: 'Modules', icon: BookOpen },
    { to: '/teacher/assign-module', label: 'Assign Module', icon: ClipboardList },
    { to: '/teacher/add-module', label: 'Add Module', icon: FilePlus2 },
    { to: '/teacher/review-submissions', label: 'Review', icon: ClipboardCheck },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/my-modules', label: 'My Modules', icon: BookOpen },
    { to: '/student/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/student/my-badges', label: 'My Badges', icon: Award },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/module-approval', label: 'Module Approval', icon: CheckSquare },
    { to: '/admin/class-management', label: 'Class Management', icon: Users },
    { to: '/admin/create-accounts', label: 'Create Accounts', icon: UserPlus },
  ],
}

export default function Navbar() {
  const { user, role, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const links = NAV_LINKS[role] ?? []
  const initial = (profile?.full_name ?? 'U').trim().charAt(0).toUpperCase()
  const [unread, setUnread] = useState(0)

  async function refreshUnread() {
    const { data } = await supabase.rpc('get_unread_message_count')
    if (typeof data === 'number') setUnread(data)
  }

  useEffect(() => {
    if (!user) return
    refreshUnread()
    // Any new message anywhere may belong to one of this user's
    // conversations (RLS on messages already scopes what's delivered) —
    // just re-ask for the total rather than tracking per-conversation state.
    const channel = supabase
      .channel(`navbar_unread_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshUnread)
      .subscribe()
    const interval = setInterval(refreshUnread, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [user])

  // Clear the badge the moment the person opens Messages, without waiting
  // for the next poll — the page itself marks conversations read.
  useEffect(() => {
    if (location.pathname === '/messages') {
      const t = setTimeout(refreshUnread, 500)
      return () => clearTimeout(t)
    }
  }, [location.pathname])

  async function handleSignOut() {
    haptic('tap')
    await signOut()
    navigate('/login')
  }

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        <img src={nuLogo} alt="National University" className="navbar-logo" />
      </Link>
      <nav className="navbar-links">
        {links.map((l) => {
          const Icon = l.icon
          const active = location.pathname === l.to
          return (
            <Link
              key={l.to}
              to={l.to}
              className={active ? 'nav-link-active' : ''}
              onClick={() => haptic('tap')}
            >
              <Icon size={15} strokeWidth={2.4} />
              {l.label}
            </Link>
          )
        })}
        <Link
          to="/messages"
          className={location.pathname === '/messages' ? 'nav-link-active' : ''}
          onClick={() => haptic('tap')}
        >
          <MessageSquare size={15} strokeWidth={2.4} />
          Messages
          {unread > 0 && <span className="nav-unread-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      </nav>
      <div className="navbar-user">
        <span className="navbar-user-info">
          <span className="navbar-avatar">{initial}</span>
          {profile?.full_name ?? 'User'} ({role})
        </span>
        <button onClick={handleSignOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
  )
}
