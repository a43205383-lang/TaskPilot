import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { LoginPage } from '../auth/LoginPage'
import { TasksPage } from '../tasks/TasksPage'
import { ChatPage } from '../chat/ChatPage'
import { TeamPage } from '../team/TeamPage'
import { ProfilePage } from '../profile/ProfilePage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
