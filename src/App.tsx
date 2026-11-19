import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { CapturePage } from './pages/CapturePage'
import { ReviewPage } from './pages/ReviewPage'
import { ExpenseDetailPage } from './pages/ExpenseDetailPage'
import { SummaryPage } from './pages/SummaryPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { AccountPage } from './pages/AccountPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<ExpensesPage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="expenses/:id" element={<ExpenseDetailPage />} />
          <Route path="expenses/:id/review" element={<ReviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
