import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { Trophy, Award } from 'lucide-react'
import { celebrate } from '../../lib/confetti'

export default function MyBadges() {
  const { user } = useAuth()
  const [badges, setBadges] = useState([])
  const seenCountRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('student_badges')
        .select('earned_at, badges ( id, name, description, icon )')
        .eq('student_id', user.id)
        .order('earned_at', { ascending: false })
      if (!error) {
        const rows = data ?? []
        if (seenCountRef.current !== null && rows.length > seenCountRef.current) {
          celebrate({ big: true })
        }
        seenCountRef.current = rows.length
        setBadges(rows)
      }
    }
    if (user) load()
  }, [user])

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><Trophy size={22} /> My Badges</h1>
        </div>
        <div className="badge-grid">
          {badges.map((b, i) => (
            <div key={i} className="badge-card">
              <div className="badge-icon">
                {b.badges?.icon && !/\p{Extended_Pictographic}/u.test(b.badges.icon)
                  ? b.badges.icon
                  : <Award size={26} />}
              </div>
              <h3>{b.badges?.name}</h3>
              <p className="muted">{b.badges?.description}</p>
              <p className="muted small">Earned {new Date(b.earned_at).toLocaleDateString()}</p>
            </div>
          ))}
          {badges.length === 0 && <p className="muted">No badges earned yet. Keep learning!</p>}
        </div>
      </main>
    </div>
  )
}
