import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import nuLogo from '../assets/nu-logo-full.png'
import { haptic } from '../lib/haptics'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  GraduationCap,
  Trophy,
  Zap,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react'

const FEATURES = [
  { icon: GraduationCap, text: 'Interactive lessons built by your teachers' },
  { icon: Trophy, text: 'Earn badges as you complete modules' },
  { icon: Zap, text: 'Instant feedback on quizzes & activities' },
]

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    haptic('tap')
    const finalEmail = email.includes('@') ? email : `${email}@learninghub.local`
    const { error } = await signIn(finalEmail, password)
    setSubmitting(false)
    if (error) {
      haptic('error')
      setError(error.message)
      return
    }
    haptic('success')
    navigate(location.state?.from ?? '/', { replace: true })
  }

  return (
    <div className="login-screen">
      <div className="login-visual">
        <span className="blob blob-1" aria-hidden="true" />
        <span className="blob blob-2" aria-hidden="true" />
        <span className="blob blob-3" aria-hidden="true" />

        <div className="login-brand">
          <img src={nuLogo} alt="National University" />
        </div>

        <div className="login-hero">
          <span className="login-eyebrow">Welcome to the Hub</span>
          <h2>Learning that feels like <span className="hero-accent">leveling up</span>.</h2>
          <p>
            Lectures, activities, and interactive challenges in one place —
            built for teachers to create, and students to enjoy.
          </p>

          <div className="login-feature-list">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <div className="login-feature" key={text} style={{ animationDelay: `${i * 0.12}s` }}>
                <span className="icon-badge">
                  <Icon size={16} strokeWidth={2.5} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ShieldCheck size={14} />
          Secured sign-in for students, teachers & admins
        </div>
      </div>

      <div className="login-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="site-header-logo">
            <img src={nuLogo} alt="National University" />
          </div>
          <p className="subtitle" style={{ textAlign: 'center' }}>
            Sign in to continue
          </p>

          {error && (
            <div className="error-banner">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <label>
            Username or Email
            <span className="field-icon-wrap">
              <Mail size={17} className="field-icon" />
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. admin.rizo or you@school.edu"
              />
            </span>
          </label>

          <label>
            Password
            <span className="field-icon-wrap">
              <Lock size={17} className="field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="field-toggle"
                onClick={() => { haptic('tap'); setShowPassword((s) => !s) }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={17} className="spin" /> Signing in...
              </>
            ) : (
              <>
                <LogIn size={17} /> Sign In
              </>
            )}
          </button>

          <p className="hint">
            <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Accounts are created by an Administrator. You can sign in with just your
              username (e.g. <code>admin.rizo</code>) or your full email — contact your
              admin if you don't have login credentials yet.
            </span>
          </p>
        </form>
      </div>
    </div>
  )
}
