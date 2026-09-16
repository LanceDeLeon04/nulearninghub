import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { CheckSquare, Eye } from 'lucide-react'

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

export default function ModuleApproval() {
  // Every module application, any status — this is the full record,
  // not just the pending queue. Filtering to a status happens client-side
  // so switching tabs doesn't need a re-fetch.
  const [modules, setModules] = useState([])
  const [activeTab, setActiveTab] = useState('pending')

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
        <h1><CheckSquare size={22} /> Module Approval</h1>
        <p className="subtitle">Manage every module application — pending, approved, and rejected — from any teacher.</p>

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
          {visible.map((m) => (
            <div key={m.id} className="module-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <h3>{m.title}</h3>
                <span className={`badge status-${m.status}`}>{STATUS_LABEL[m.status] ?? m.status}</span>
              </div>
              <p className="muted">{m.subject} — by {m.profiles?.full_name}</p>
              <p>{m.description}</p>
              <p className="muted small">Submitted {new Date(m.created_at).toLocaleDateString()}</p>

              <div className="row-actions">
                <Link className="btn" to={`/admin/module-preview/${m.id}`}><Eye size={14} /> View</Link>
                {m.status !== 'approved' && (
                  <button className="btn btn-approve" onClick={() => updateStatus(m.id, 'approved')}>Approve</button>
                )}
                {m.status !== 'rejected' && (
                  <button className="btn btn-reject" onClick={() => updateStatus(m.id, 'rejected')}>Reject</button>
                )}
                {m.status !== 'pending' && (
                  <button className="btn" onClick={() => updateStatus(m.id, 'pending')}>Reset to Pending</button>
                )}
              </div>
            </div>
          ))}
          {visible.length === 0 && <p>No {activeTab === 'all' ? '' : activeTab} module applications.</p>}
        </div>
      </main>
    </div>
  )
}
