import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { formatUsername } from '../../lib/formatUsername'
import { haptic } from '../../lib/haptics'
import { UserPlus, Pencil, Trash2, X, Check } from 'lucide-react'

// Inline edit row for a single teacher/student — swaps the display row for
// name/email/password fields, saved via the manage-user edge function since
// email + password live on auth.users and need the service_role key.
function EditRow({ account, onCancel, onSaved }) {
  const [fullName, setFullName] = useState(account.full_name ?? '')
  const [email, setEmail] = useState(formatUsername(account.email))
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    const trimmedEmail = email.trim()
    const finalEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@learninghub.local`
    const { error: fnError } = await supabase.functions.invoke('manage-user', {
      body: {
        action: 'update',
        user_id: account.id,
        full_name: fullName.trim(),
        email: finalEmail,
        ...(password ? { password } : {}),
      },
    })
    setSaving(false)
    if (fnError) {
      setError(fnError.message)
      return
    }
    haptic('success')
    onSaved()
  }

  return (
    <tr>
      <td><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" /></td>
      <td><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="username or email" /></td>
      <td>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (optional)"
        />
      </td>
      <td>
        <div className="row-actions">
          <button className="btn btn-approve btn-sm" onClick={handleSave} disabled={saving || !fullName.trim() || !email.trim()}>
            <Check size={13} /> Save
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
            <X size={13} /> Cancel
          </button>
        </div>
        {error && <p className="muted small" style={{ color: 'var(--danger, #dc2626)', marginTop: '0.3rem' }}>{error}</p>}
      </td>
    </tr>
  )
}

function AccountTable({ title, accounts, role, editingId, onEdit, onCancelEdit, onSaved, onDelete }) {
  return (
    <>
      <h3 style={{ marginTop: '2rem' }}>{title}</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Username / Email</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) =>
            editingId === a.id ? (
              <EditRow key={a.id} account={a} onCancel={onCancelEdit} onSaved={() => onSaved(a)} />
            ) : (
              <tr key={a.id}>
                <td>{a.full_name}</td>
                <td>{formatUsername(a.email)}</td>
                <td></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => onEdit(a.id)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn btn-reject btn-sm" onClick={() => onDelete(a)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
          {accounts.length === 0 && (
            <tr><td colSpan={4}>No {role}s yet.</td></tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export default function CreateAccounts() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('student')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [teachers, setTeachers] = useState([])
  const [students, setStudents] = useState([])
  const [editingId, setEditingId] = useState(null)

  async function loadAccounts() {
    const { data: t } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name')
    setTeachers(t ?? [])
    const { data: s } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name')
    setStudents(s ?? [])
  }

  useEffect(() => { loadAccounts() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')
    setSubmitting(true)

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { full_name: fullName, email, role },
    })

    setSubmitting(false)

    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }

    setMessage(
      `Account created for ${email}. A temporary password has been ${data?.temp_password ? `generated: ${data.temp_password}` : 'sent via email'}.`
    )
    setFullName('')
    setEmail('')
    setRole('student')
    await loadAccounts()
  }

  function handleSaved(account) {
    setEditingId(null)
    setMessage(`Updated ${account.full_name}.`)
    loadAccounts()
  }

  async function handleDelete(account) {
    const confirmed = window.confirm(
      `Delete ${account.full_name}'s account? This removes their login and all of their data (classes, grades, messages, etc.) permanently.`
    )
    if (!confirmed) return
    haptic('tap')
    const { error } = await supabase.functions.invoke('manage-user', {
      body: { action: 'delete', user_id: account.id },
    })
    if (error) {
      setMessage(`Error deleting account: ${error.message}`)
      return
    }
    haptic('success')
    setMessage(`${account.full_name}'s account was deleted.`)
    await loadAccounts()
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1><UserPlus size={22} /> Create Faculty / Student Accounts</h1>
        {message && <div className="info-banner">{message}</div>}

        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Full Name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <AccountTable
          title="Teachers"
          accounts={teachers}
          role="teacher"
          editingId={editingId}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onSaved={handleSaved}
          onDelete={handleDelete}
        />

        <AccountTable
          title="Students"
          accounts={students}
          role="student"
          editingId={editingId}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onSaved={handleSaved}
          onDelete={handleDelete}
        />
      </main>
    </div>
  )
}
