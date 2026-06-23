import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import Login from './pages/Login.jsx'
import CreateAccount from './pages/CreateAccount.jsx'
import AiAssistant from './pages/AiAssistant.jsx'
import AfterSession from './pages/AfterSession.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inbox from './pages/Inbox.jsx'
import Customers from './pages/Customers.jsx'
import Customer360 from './pages/Customer360.jsx'
import Leads from './pages/Leads.jsx'
import LeadDetails from './pages/LeadDetails.jsx'
import Receipts from './pages/Receipts.jsx'
import ArtworkVault from './pages/ArtworkVault.jsx'
import Integrations from './pages/Integrations.jsx'
import MetaConnect from './pages/MetaConnect.jsx'
import Orders from './pages/Orders.jsx'
import FollowUps from './pages/FollowUps.jsx'
import Campaigns from './pages/Campaigns.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Team from './pages/Team.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/create-account" element={<CreateAccount />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/inbox" element={<Navigate to="/dashboard" replace />} />
      <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
      <Route path="/customer-360" element={<RequireAuth><Customer360 /></RequireAuth>} />
      <Route path="/leads" element={<RequireAuth><Leads /></RequireAuth>} />
      <Route path="/leads/:id" element={<RequireAuth><LeadDetails /></RequireAuth>} />
      <Route path="/receipts" element={<RequireAuth><Receipts /></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
      <Route path="/follow-ups" element={<RequireAuth><FollowUps /></RequireAuth>} />
      <Route path="/campaigns" element={<RequireAuth><Campaigns /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/team" element={<RequireAuth><Team /></RequireAuth>} />
      <Route path="/ai-assistant" element={<RequireAuth><AiAssistant /></RequireAuth>} />
      <Route path="/after-session" element={<RequireAuth><AfterSession /></RequireAuth>} />
      <Route path="/artwork-vault" element={<RequireAuth><ArtworkVault /></RequireAuth>} />
      <Route path="/connect-meta" element={<RequireAuth><MetaConnect /></RequireAuth>} />
      <Route path="/integrations"  element={<RequireAuth><Integrations /></RequireAuth>} />
      <Route path="/settings/integrations" element={<RequireAuth><Integrations /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
