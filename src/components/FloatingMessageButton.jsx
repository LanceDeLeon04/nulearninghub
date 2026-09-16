import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import { haptic } from '../lib/haptics'
import Messenger from './Messenger'
import { MessageSquare, X } from 'lucide-react'

export default function FloatingMessageButton() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  async function refreshUnread() {
    const { data } = await supabase.rpc('get_unread_message_count')
    if (typeof data === 'number') setUnread(data)
  }

  useEffect(() => {
    if (!user) return
    refreshUnread()
    const channel = supabase
      .channel(`floating_unread_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshUnread)
      .subscribe()
    const interval = setInterval(refreshUnread, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [user])

  // Close the modal automatically if in-app navigation lands on the full
  // Messages page while it happens to be open.
  useEffect(() => {
    if (location.pathname === '/messages' && open) setOpen(false)
  }, [location.pathname])

  function handleOpen() {
    haptic('tap')
    setOpen(true)
    setTimeout(refreshUnread, 500)
  }

  // Hidden entirely when logged out or already on the Messages page —
  // no point floating a shortcut to the page you're standing on.
  if (!user || location.pathname === '/messages') return null

  return (
    <>
      <button
        type="button"
        className="floating-msg-btn"
        onClick={handleOpen}
        aria-label="Open messages"
      >
        <MessageSquare size={22} />
        {unread > 0 && <span className="floating-msg-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="floating-msg-backdrop" onClick={() => setOpen(false)}>
          <div className="floating-msg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="floating-msg-modal-header">
              <span><MessageSquare size={16} /> Messages</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { haptic('tap'); setOpen(false) }} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="floating-msg-modal-body">
              <Messenger onConversationOpen={() => {}} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
