import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import RingProgress from '../../components/RingProgress'
import { Trophy, Award, Lock } from 'lucide-react'
import { celebrate } from '../../lib/confetti'

export default function MyBadges() {
  const { user } = useAuth()
  const [allBadges, setAllBadges] = useState([]) // every badge that exists
  const [earnedById, setEarnedById] = useState({}) // badge_id -> earned_at
  const seenCountRef = useRef(null)

  useEffect(() => {
    async function load() {
      const [{ data: all, error: allError }, { data: earned, error: earnedError }] = await Promise.all([
        supabase.from('badges').select('id, name, description, icon').order('name'),
        supabase.from('student_badges').select('badge_id, earned_at').eq('student_id', user.id),
      ])
      if (!allError) setAllBadges(all ?? [])
      if (!earnedError) {
        const map = {}
        for (const row of earned ?? []) map[row.badge_id] = row.earned_at
        const count = Object.keys(map).length
        if (seenCountRef.current !== null && count > seenCountRef.current) {
          celebrate({ big: true })
        }
        seenCountRef.current = count
        setEarnedById(map)
      }
    }
    if (user) load()
  }, [user])

  const earnedCount = Object.keys(earnedById).length
  const pct = allBadges.length ? (earnedCount / allBadges.length) * 100 : 0

  // A badge counts as "recently earned" for the sparkle tag if it was earned
  // in the last 3 days — just a light celebratory touch, not tracked state.
  const isRecent = (earnedAt) => {
    if (!earnedAt) return false
    const days = (Date.now() - new Date(earnedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days <= 3
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><Trophy size={22} /> My Badges</h1>
            <p className="subtitle">{earnedCount} / {allBadges.length} earned — badges are awarded automatically as you complete work.</p>
          </div>
        </div>

        {allBadges.length > 0 && (
          <div className="badge-progress-banner">
            <RingProgress percent={pct} size={58} stroke={6} />
            <div style={{ flex: 1 }}>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="muted small" style={{ margin: '0.4rem 0 0' }}>
                {earnedCount === allBadges.length
                  ? "You've collected every badge — legendary! 🏆"
                  : `${allBadges.length - earnedCount} badge${allBadges.length - earnedCount === 1 ? '' : 's'} left to unlock`}
              </p>
            </div>
          </div>
        )}

        <div className="badge-grid">
          {allBadges.map((b) => {
            const earnedAt = earnedById[b.id]
            const locked = !earnedAt
            return (
              <div
                key={b.id}
                className={`badge-card${locked ? ' badge-card-locked' : ''}${!locked && isRecent(earnedAt) ? ' badge-card-new' : ''}`}
              >
                <span className="badge-shine" />
                <div className="badge-icon">
                  {locked ? (
                    <Lock size={22} />
                  ) : b.icon && !/\p{Extended_Pictographic}/u.test(b.icon) ? (
                    b.icon
                  ) : (
                    <Award size={26} />
                  )}
                </div>
                <h3>{b.name}</h3>
                <p className="muted">{b.description}</p>
                <p className="muted small">{locked ? 'Not earned yet' : `Earned ${new Date(earnedAt).toLocaleDateString()}`}</p>
              </div>
            )
          })}
          {allBadges.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-emoji">🏅</div>
              <h3>No badges yet</h3>
              <p>Your teacher hasn't set up any badges for this class yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
