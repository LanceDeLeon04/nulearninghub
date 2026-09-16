import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { Medal, Trophy, Crown } from 'lucide-react'

// Top 3 get a medal color; everyone else just gets their rank number.
const MEDAL_TONE = { 1: '#ffd43b', 2: '#c9c9c9', 3: '#d99a5c' }

function initials(name) {
  return (name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}

// Podium order is visual (2nd, 1st, 3rd) so the winner sits tallest in the middle.
function Podium({ rows, meId }) {
  const top3 = rows.slice(0, 3)
  if (top3.length === 0) return null
  const order = [top3[1], top3[0], top3[2]].filter(Boolean)

  return (
    <div className="podium-wrap">
      {order.map((r) => (
        <div key={r.student_id} className={`podium-slot podium-slot-${r.rank}`}>
          <div className={`podium-avatar${r.student_id === meId ? ' podium-you' : ''}`}>
            {r.rank === 1 && <Crown className="podium-crown" size={20} fill="var(--gold)" />}
            {initials(r.full_name)}
          </div>
          <div className="podium-name">{r.full_name}{r.student_id === meId ? ' (you)' : ''}</div>
          <div className="podium-points">{r.total_points} pts</div>
          <div className="podium-bar">#{r.rank}</div>
        </div>
      ))}
    </div>
  )
}

function ClassLeaderboard({ classInfo, meId }) {
  const [rows, setRows] = useState(null) // null = loading, [] = loaded empty

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('get_class_leaderboard', { p_class_id: classInfo.id })
      setRows(error ? [] : data ?? [])
    }
    load()
  }, [classInfo.id])

  return (
    <div className="module-card" style={{ marginBottom: '1.2rem' }}>
      <h3>{classInfo.name} <span className="muted small">({classInfo.subject})</span></h3>

      {rows === null && <p className="muted small">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted small">No points logged for this class yet.</p>}

      {rows && rows.length > 0 && <Podium rows={rows} meId={meId} />}

      {rows && rows.length > 0 && (
        <table className="data-table" style={{ marginTop: '0.6rem' }}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Points</th>
              <th>Badges</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} style={r.student_id === meId ? { fontWeight: 700 } : undefined}>
                <td>
                  {r.rank <= 3 ? (
                    <Medal size={15} color={MEDAL_TONE[r.rank]} style={{ verticalAlign: '-3px' }} />
                  ) : null}{' '}
                  #{r.rank}
                </td>
                <td>{r.full_name}{r.student_id === meId ? ' (you)' : ''}</td>
                <td>{r.total_points}</td>
                <td>{r.badge_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [classes, setClasses] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('class_students')
        .select('classes ( id, name, subject )')
        .eq('student_id', user.id)
      const list = (data ?? []).map((r) => r.classes).filter(Boolean)
      setClasses(list)
    }
    if (user) load()
  }, [user])

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><Trophy size={22} /> Leaderboard</h1>
        <p className="subtitle">Ranked by total points — earned from accuracy and speed on activities, plus completing lectures and interactives.</p>

        {classes === null && <p className="muted">Loading…</p>}
        {classes && classes.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-emoji">🏁</div>
            <h3>No sections yet</h3>
            <p>You're not enrolled in any section yet — once you are, the leaderboard for it will show up here.</p>
          </div>
        )}
        {classes && classes.map((c) => <ClassLeaderboard key={c.id} classInfo={c} meId={user.id} />)}
      </main>
    </div>
  )
}
