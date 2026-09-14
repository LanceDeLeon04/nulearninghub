import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RoleHome() {
  const { role, loading } = useAuth()

  if (loading) return <div className="page-center">Loading...</div>

  switch (role) {
    case 'admin':
      return <Navigate to="/admin" replace />
    case 'teacher':
      return <Navigate to="/teacher" replace />
    case 'student':
      return <Navigate to="/student" replace />
    default:
      return <Navigate to="/login" replace />
  }
}
