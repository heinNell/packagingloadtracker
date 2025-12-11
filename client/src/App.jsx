import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveTrackingPage from './pages/LiveTrackingPage';
import LoadDetail from './pages/LoadDetail';
import LoadForm from './pages/LoadForm';
import Loads from './pages/Loads';
import Login from './pages/Login';
import Packaging from './pages/Packaging';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SiteDetail from './pages/SiteDetail';
import Sites from './pages/Sites';
import WeeklyPlanner from './pages/WeeklyPlanner';
import { useAuthStore } from './stores/authStore';

/**
 * Protected route wrapper component
 * @param {{ children: React.ReactNode }} props
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="planner" element={<WeeklyPlanner />} />
        <Route path="loads" element={<Loads />} />
        <Route path="loads/new" element={<LoadForm />} />
        <Route path="loads/:id" element={<LoadDetail />} />
        <Route path="loads/:id/edit" element={<LoadForm />} />
        <Route path="sites" element={<Sites />} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="packaging" element={<Packaging />} />
        <Route path="tracking" element={<LiveTrackingPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
