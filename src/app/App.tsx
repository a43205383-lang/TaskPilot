import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { LoginPage } from '../auth/LoginPage'
import { ExpensesPage } from '../expenses/ExpensesPage'
import { CapturePage } from '../capture/CapturePage'
import { ReviewPage } from '../extraction/ReviewPage'
import { ExpenseDetailPage } from '../expenses/ExpenseDetailPage'
import { SummaryPage } from '../reports/SummaryPage'
import { ApprovalsPage } from '../approvals/ApprovalsPage'
import { AccountPage } from '../account/AccountPage'

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
