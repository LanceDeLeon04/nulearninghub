import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import nuLogo from '../assets/nu-logo-full.png'
import { haptic } from '../lib/haptics'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  FilePlus2,
  Trophy,
  CheckSquare,
  Users,
  UserPlus,
  LogOut,
} from 'lucide-react'

const NAV_LINKS = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/teacher/class-management', label: 'Class Management', icon: Users },
    { to: '/teacher/modules', label: 'Modules', icon: BookOpen },
    { to: '/teacher/assign-module', label: 'Assign Module', icon: ClipboardList },
    { to: '/teacher/add-module', label: 'Add Module', icon: FilePlus2 },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/my-modules', label: 'My Modules', icon: BookOpen },
    { to: '/student/my-badges', label: 'My Badges', icon: Trophy },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/module-approval', label: 'Module Approval', icon: CheckSquare },
    { to: '/admin/class-management', label: 'Class Management', icon: Users },
    { to: '/admin/create-accounts', label: 'Create Accounts', icon: UserPlus },
  ],
}

export default function Navbar() {
  const { role, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const links = NAV_LINKS[role] ?? []
  const initial = (profile?.full_name ?? 'U').trim().charAt(0).toUpperCase()

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
