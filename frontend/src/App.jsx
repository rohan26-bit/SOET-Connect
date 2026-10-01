import { Routes, Route, Navigate } from "react-router-dom";
import { UserCheck } from "lucide-react";
import AppLayout from "./layouts/AppLayout";
import AuthLayout from "./layouts/AuthLayout";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Opportunities from "./pages/Opportunities";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Announcements from "./pages/Announcements";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";

function App() {
  return (
    <Routes>
      {/* Authenticated Application Routes with Sidebar & Header */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/events" element={<Events />} />
        <Route path="/users" element={<Users />} />
        <Route
          path="/verification"
          element={
            <div className="verification-page">
              <Card
                title="Alumni Verification Queue"
                subtitle="Review and verify alumni credentials, graduation records, and department approval requests."
              >
                <EmptyState
                  icon={UserCheck}
                  title="No Pending Verification Requests"
                  description="All alumni registrations and degree credentials have been processed. New verification requests will appear here when submitted."
                />
              </Card>
            </div>
          }
        />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Public Authentication Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;