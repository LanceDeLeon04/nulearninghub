import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import FloatingMessageButton from './components/FloatingMessageButton'

import Login from './pages/Login'
import RoleHome from './pages/RoleHome'
import Messages from './pages/Messages'

import TeacherDashboard from './pages/teacher/TeacherDashboard'
import Modules from './pages/teacher/Modules'
import AssignModule from './pages/teacher/AssignModule'
import AddModule from './pages/teacher/AddModule'
import ModuleBuilder from './pages/teacher/ModuleBuilder'
import AssignmentNotes from './pages/teacher/AssignmentNotes'
import TeacherClassManagement from './pages/teacher/ClassManagement'
import ModulePreview from './pages/teacher/ModulePreview'
// ModulePreview is shared: it's role-aware (see BACK_LINK inside the
// component) and is also mounted below under an /admin route.

import StudentDashboard from './pages/student/StudentDashboard'
import MyModules from './pages/student/MyModules'
import MyBadges from './pages/student/MyBadges'
import Leaderboard from './pages/student/Leaderboard'
import ModulePlayer from './pages/student/ModulePlayer'

import AdminDashboard from './pages/admin/AdminDashboard'
import ModuleApproval from './pages/admin/ModuleApproval'
import AdminClassManagement from './pages/admin/ClassManagement'
import CreateAccounts from './pages/admin/CreateAccounts'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleHome />} />

          {/* Messages — in-app chat, available to every role */}
          <Route path="/messages" element={
            <PrivateRoute allowedRoles={['admin', 'teacher', 'student']}><Messages /></PrivateRoute>
          } />

          {/* Teacher routes */}
          <Route path="/teacher" element={
            <PrivateRoute allowedRoles={['teacher']}><TeacherDashboard /></PrivateRoute>
          } />
          <Route path="/teacher/modules" element={
            <PrivateRoute allowedRoles={['teacher']}><Modules /></PrivateRoute>
          } />
          <Route path="/teacher/assign-module" element={
            <PrivateRoute allowedRoles={['teacher']}><AssignModule /></PrivateRoute>
          } />
          <Route path="/teacher/add-module" element={
            <PrivateRoute allowedRoles={['teacher']}><AddModule /></PrivateRoute>
          } />
          <Route path="/teacher/module-builder/:moduleId" element={
            <PrivateRoute allowedRoles={['teacher']}><ModuleBuilder /></PrivateRoute>
          } />
          <Route path="/teacher/assignment/:assignmentId/notes" element={
            <PrivateRoute allowedRoles={['teacher']}><AssignmentNotes /></PrivateRoute>
          } />
          <Route path="/teacher/class-management" element={
            <PrivateRoute allowedRoles={['teacher']}><TeacherClassManagement /></PrivateRoute>
          } />
          <Route path="/teacher/module-preview/:moduleId" element={
            <PrivateRoute allowedRoles={['teacher']}><ModulePreview /></PrivateRoute>
          } />

          {/* Student routes */}
          <Route path="/student" element={
            <PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>
          } />
          <Route path="/student/my-modules" element={
            <PrivateRoute allowedRoles={['student']}><MyModules /></PrivateRoute>
          } />
          <Route path="/student/my-badges" element={
            <PrivateRoute allowedRoles={['student']}><MyBadges /></PrivateRoute>
          } />
          <Route path="/student/leaderboard" element={
            <PrivateRoute allowedRoles={['student']}><Leaderboard /></PrivateRoute>
          } />
          <Route path="/student/module/:assignmentId" element={
            <PrivateRoute allowedRoles={['student']}><ModulePlayer /></PrivateRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <PrivateRoute allowedRoles={['admin']}><AdminDashboard /></PrivateRoute>
          } />
          <Route path="/admin/module-approval" element={
            <PrivateRoute allowedRoles={['admin']}><ModuleApproval /></PrivateRoute>
          } />
          <Route path="/admin/class-management" element={
            <PrivateRoute allowedRoles={['admin']}><AdminClassManagement /></PrivateRoute>
          } />
          <Route path="/admin/create-accounts" element={
            <PrivateRoute allowedRoles={['admin']}><CreateAccounts /></PrivateRoute>
          } />
          <Route path="/admin/module-preview/:moduleId" element={
            <PrivateRoute allowedRoles={['admin']}><ModulePreview /></PrivateRoute>
          } />

          <Route path="*" element={<RoleHome />} />
        </Routes>

        <FloatingMessageButton />
      </AuthProvider>
    </BrowserRouter>
  )
}
