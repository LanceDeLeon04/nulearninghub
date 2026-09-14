import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { UserPlus } from 'lucide-react'

// NOTE: Creating auth users requires the Supabase service_role key, which must
// NEVER be exposed in frontend code. This page calls a Supabase Edge Function
// ("create-user") that runs server-side with the service_role key.
// See /supabase/functions/create-user for the reference implementation.
export default function CreateAccounts() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('student')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      </main>
    </div>
  )
}
