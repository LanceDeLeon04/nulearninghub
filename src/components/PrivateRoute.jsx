import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wrap a route element. If allowedRoles is provided, only those roles may pass.
export default function PrivateRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()

  if (loading) return <div className="page-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }
  return children
}
