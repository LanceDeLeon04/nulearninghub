import Navbar from '../components/Navbar'
import Messenger from '../components/Messenger'
import { useAuth } from '../context/AuthContext'
import { MessageSquare } from 'lucide-react'

export default function Messages() {
  const { profile } = useAuth()

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><MessageSquare size={22} /> Messages</h1>
            <p className="subtitle">Chat with any teacher, student, or admin — {profile?.full_name}</p>
          </div>
        </div>

        <Messenger />
      </main>
    </div>
  )
}
