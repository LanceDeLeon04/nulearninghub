import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { haptic } from '../../lib/haptics'
import { CheckSquare, Eye, Pencil, Trash2, X, Check, BookMarked } from 'lucide-react'

const STATUS_LABEL = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

// Inline edit form for a module's basic fields — swapped in over the card's
// normal read-only view. Content blocks (lecture/activity/etc.) are still
// edited in the teacher's Module Builder; this covers what admin oversight
// needs: title, subject, description, and curriculum ordering.
function EditModuleForm({ module, onCancel, onSaved }) {
  const [title, setTitle] = useState(module.title)
  const [subject, setSubject] = useState(module.subject)
  const [description, setDescription] = useState(module.description ?? '')
  const [sequenceOrder, setSequenceOrder] = useState(module.sequence_order ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim() || !subject.trim()) return
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('modules')
      .update({
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        sequence_order: Number(sequenceOrder) || 0,
      })
      .eq('id', module.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    haptic('success')
    onSaved()
  }

  return (
    <div className="module-card">
      <div className="form-grid">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label>
          Curriculum order
          <input type="number" value={sequenceOrder} onChange={(e) => setSequenceOrder(e.target.value)} />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: '0.6rem' }}>
        Description
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
      </label>
      {error && <p className="muted small" style={{ color: 'var(--danger, #dc2626)', marginTop: '0.4rem' }}>{error}</p>}
      <div className="row-actions" style={{ marginTop: '0.8rem' }}>
        <button className="btn btn-approve" onClick={handleSave} disabled={saving || !title.trim() || !subject.trim()}>
          <Check size={14} /> Save
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function ModuleApproval() {
  // Every module application, any status — this is the full record,
  // not just the pending queue. Filtering to a status happens client-side
  // so switching tabs doesn't need a re-fetch.
  const [modules, setModules] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('modules')
      .select('*, profiles:teacher_id ( full_name, email )')
      .order('sequence_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (!error) setModules(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id, status) {
    const { error } = await supabase.from('modules').update({ status }).eq('id', id)
    if (!error) load()
  }

  async function handleDelete(m) {
    const confirmed = window.confirm(
      `Delete "${m.title}"? This removes the module, its content, and any class assignments of it. This cannot be undone.`
    )
    if (!confirmed) return
    haptic('tap')
    const { error } = await supabase.from('modules').delete().eq('id', m.id)
    if (error) {
      setMessage(`Error deleting module: ${error.message}`)
      return
    }
    haptic('success')
    setMessage(`"${m.title}" was deleted.`)
    load()
  }

  const counts = useMemo(() => ({
    all: modules.length,
    pending: modules.filter((m) => m.status === 'pending').length,
    approved: modules.filter((m) => m.status === 'approved').length,
    rejected: modules.filter((m) => m.status === 'rejected').length,
  }), [modules])

  const visible = activeTab === 'all' ? modules : modules.filter((m) => m.status === activeTab)

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><CheckSquare size={22} /> Module Approval</h1>
          <Link className="btn btn-outline" to="/resources"><BookMarked size={15} /> References & Rubric</Link>
        </div>
        <p className="subtitle">Manage every module application — pending, approved, and rejected — from any teacher.</p>
        {message && <div className="info-banner">{message}</div>}

        <div className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-btn${activeTab === t.key ? ' tab-btn-active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label} <span className="tab-count">{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="card-grid">
          {visible.map((m) =>
            editingId === m.id ? (
              <EditModuleForm
                key={m.id}
                module={m}
                onCancel={() => setEditingId(null)}
                onSaved={() => { setEditingId(null); load() }}
              />
            ) : (
              <div key={m.id} className="module-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3>{m.title}</h3>
                  <span className={`badge status-${m.status}`}>{STATUS_LABEL[m.status] ?? m.status}</span>
                </div>
                <p className="muted">{m.subject} — by {m.profiles?.full_name}</p>
                <p>{m.description}</p>
                <p className="muted small">Submitted {new Date(m.created_at).toLocaleDateString()}</p>

                <div className="module-card-footer">
                  <div className="module-card-footer-row">
                    <Link className="btn btn-sm" to={`/admin/module-preview/${m.id}`}><Eye size={14} /> View</Link>
                    <div className="module-card-icon-actions">
                      <button className="btn-icon" title="Edit module" aria-label="Edit module" onClick={() => setEditingId(m.id)}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-icon btn-icon-danger" title="Delete module" aria-label="Delete module" onClick={() => handleDelete(m)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="module-card-status-actions">
                    {m.status !== 'approved' && (
                      <button className="btn-outline btn-outline-approve btn-sm" onClick={() => updateStatus(m.id, 'approved')}>Approve</button>
                    )}
                    {m.status !== 'rejected' && (
                      <button className="btn-outline btn-outline-reject btn-sm" onClick={() => updateStatus(m.id, 'rejected')}>Reject</button>
                    )}
                    {m.status !== 'pending' && (
                      <button className="btn-outline btn-sm" onClick={() => updateStatus(m.id, 'pending')}>Reset to Pending</button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
          {visible.length === 0 && <p>No {activeTab === 'all' ? '' : activeTab} module applications.</p>}
        </div>
      </main>
    </div>
  )
}
