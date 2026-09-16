import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { haptic } from '../lib/haptics'
import { MessageSquare, Send, Search, X, Plus, Loader2 } from 'lucide-react'

const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', student: 'Student' }

function initialOf(name) {
  return (name ?? '?').trim().charAt(0).toUpperCase()
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// New-conversation picker — searches every profile (all roles), not just
// classmates: "chat for all users" is not scoped to shared classes.
function NewChatPicker({ onClose, onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      let q = supabase.from('profiles').select('id, full_name, email, role').order('full_name').limit(20)
      if (query.trim()) q = q.ilike('full_name', `%${query.trim()}%`)
      const { data } = await q
      if (!cancelled) {
        setResults(data ?? [])
        setSearching(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  return (
    <div className="chat-new-picker">
      <div className="chat-new-picker-header">
        <div className="field-icon-wrap" style={{ flex: 1 }}>
          <Search size={15} className="field-icon" />
          <input autoFocus placeholder="Search everyone by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="chat-list">
        {searching && <p className="muted small" style={{ padding: '0.6rem' }}><Loader2 size={13} className="spin" /> Searching…</p>}
        {!searching && results.length === 0 && <p className="muted small" style={{ padding: '0.6rem' }}>No one found.</p>}
        {!searching && results.map((p) => (
          <button key={p.id} type="button" className="chat-list-item" onClick={() => onPick(p)}>
            <span className="navbar-avatar chat-avatar">{initialOf(p.full_name)}</span>
            <span className="chat-list-item-body">
              <span className="chat-list-item-name">{p.full_name}</span>
              <span className="muted small">{ROLE_LABEL[p.role] ?? p.role}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Messages() {
  const { user, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(searchParams.get('c') || null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  async function loadInbox() {
    setLoadingInbox(true)
    const { data } = await supabase.rpc('get_my_conversations')
    setConversations(data ?? [])
    setLoadingInbox(false)
  }

  async function loadThread(conversationId) {
    if (!conversationId) return
    setLoadingThread(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoadingThread(false)
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
    loadInbox()
  }

  useEffect(() => { loadInbox() }, [])

  useEffect(() => {
    if (activeId) {
      loadThread(activeId)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('c', activeId)
        return next
      }, { replace: true })
    }
  }, [activeId])

  // Live message delivery for the open thread, and inbox refresh for
  // anything landing in a conversation this user is part of.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`messages_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new
        if (msg.conversation_id === activeId) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          if (msg.sender_id !== user.id) {
            supabase.rpc('mark_conversation_read', { p_conversation_id: activeId })
          }
        }
        loadInbox()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, activeId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const active = useMemo(() => conversations.find((c) => c.conversation_id === activeId), [conversations, activeId])

  async function handlePick(p) {
    setShowPicker(false)
    const { data: conversationId, error } = await supabase.rpc('get_or_create_dm', { p_other_user: p.id })
    if (!error) {
      await loadInbox()
      setActiveId(conversationId)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !activeId || sending) return
    setSending(true)
    setDraft('')
    haptic('tap')
    const { error } = await supabase.from('messages').insert({ conversation_id: activeId, sender_id: user.id, body })
    if (error) setDraft(body)
    setSending(false)
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><MessageSquare size={22} /> Messages</h1>
            <p className="subtitle">Chat with any teacher, student, or admin — {profile?.full_name}</p>
          </div>
          <button className="btn" onClick={() => { haptic('tap'); setShowPicker((s) => !s) }}>
            <Plus size={15} /> New Message
          </button>
        </div>

        <div className="chat-shell">
          <aside className="chat-sidebar">
            {showPicker ? (
              <NewChatPicker onClose={() => setShowPicker(false)} onPick={handlePick} />
            ) : (
              <div className="chat-list">
                {loadingInbox && <p className="muted small" style={{ padding: '0.6rem' }}><Loader2 size={13} className="spin" /> Loading…</p>}
                {!loadingInbox && conversations.length === 0 && (
                  <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                    <p className="muted small">No conversations yet. Tap "New Message" to start one.</p>
                  </div>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.conversation_id}
                    type="button"
                    className={`chat-list-item${c.conversation_id === activeId ? ' chat-list-item-active' : ''}`}
                    onClick={() => { haptic('tap'); setActiveId(c.conversation_id) }}
                  >
                    <span className="navbar-avatar chat-avatar">{initialOf(c.other_user_name)}</span>
                    <span className="chat-list-item-body">
                      <span className="chat-list-item-top">
                        <span className="chat-list-item-name">{c.other_user_name}</span>
                        {c.last_message_at && <span className="muted small">{formatTime(c.last_message_at)}</span>}
                      </span>
                      <span className="chat-list-item-preview muted small">
                        {c.last_message ?? `${ROLE_LABEL[c.other_user_role] ?? c.other_user_role}`}
                      </span>
                    </span>
                    {c.unread_count > 0 && <span className="chat-unread-dot">{c.unread_count}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="chat-thread">
            {!activeId && (
              <div className="empty-state" style={{ margin: 'auto' }}>
                <div className="empty-state-emoji">💬</div>
                <h3>Select a conversation</h3>
                <p>Or start a new one with anyone in the school.</p>
              </div>
            )}

            {activeId && (
              <>
                <div className="chat-thread-header">
                  <span className="navbar-avatar chat-avatar">{initialOf(active?.other_user_name)}</span>
                  <div>
                    <strong>{active?.other_user_name ?? '…'}</strong>
                    <p className="muted small" style={{ margin: 0 }}>{ROLE_LABEL[active?.other_user_role] ?? ''}</p>
                  </div>
                </div>

                <div className="chat-messages" ref={scrollRef}>
                  {loadingThread && <p className="muted small"><Loader2 size={13} className="spin" /> Loading…</p>}
                  {!loadingThread && messages.length === 0 && (
                    <p className="muted small" style={{ textAlign: 'center', marginTop: '2rem' }}>Say hello 👋</p>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className={`chat-message${m.sender_id === user.id ? ' chat-message-mine' : ''}`}>
                      <p>{m.body}</p>
                      <span className="chat-message-time">{formatTime(m.created_at)}</span>
                    </div>
                  ))}
                </div>

                <form className="chat-input-row" onSubmit={handleSend}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    maxLength={2000}
                  />
                  <button type="submit" disabled={!draft.trim() || sending}><Send size={15} /></button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
