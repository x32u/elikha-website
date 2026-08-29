import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// Shared pages
import LandingPage from './pages/shared/LandingPage';
import Login from './pages/shared/Login';
import ForgotPassword from './pages/shared/ForgotPassword';
import ResetPassword from './pages/shared/ResetPassword';
import Settings from './pages/shared/Settings';
// Student pages
import StudentHomepage from './pages/shared/Homepage';
import StudentActivities from './pages/shared/Activities';
import ActivityDetails from './pages/shared/ActivityDetails';
import TeacherActivityDetails from './pages/teacher/ActivityDetails';
import ActivityStart from './pages/student/ActivityStart';
import MobileActivityStart from './pages/student/MobileActivityStart';
import ArSandbox from './pages/student/ArSandbox';
import Profile from './pages/student/Profile';
// Teacher pages
import TeacherHomepage from './pages/teacher/Homepage';
import TeacherActivities from './pages/teacher/Activities';
import Classes from './pages/teacher/Classes';
import ClassDetails from './pages/teacher/ClassDetails';
import Reviews from './pages/teacher/Reviews';
import Student from './pages/teacher/Student';
import GestureAlerts from './pages/teacher/GestureAlerts';
import Rubrics from './pages/teacher/Rubrics';
import TeacherModels from './pages/teacher/Models';
import TeacherReports from './pages/teacher/Reports';
import {
  AdminDashboardRoute,
  AdminUsersRoute,
  AdminClassesRoute,
  AdminModelsRoute,
  AdminReportsRoute,
  AdminSettingsRoute,
  SuperAdminDashboardRoute,
  SuperAdminUsersRoute,
  SuperAdminModelsRoute,
  SuperAdminReportsRoute,
  SuperAdminSettingsRoute,
  SuperAdminAuditRoute,
} from './pages/admin/AdminRoutePages';
import Notifications from './pages/shared/Notifications';
import UserSettingsEffects from './components/UserSettingsEffects';
import ModelLibraryEffects from './components/ModelLibraryEffects';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabase';
import { getDefaultRouteForRole, normalizeRole } from './utils/authState';
import './styles/App.css';

const SessionCheck = () => (
  <main className="configuration-error" role="status" aria-live="polite">
    <section className="configuration-error__card">
      <p>Checking your session...</p>
    </section>
  </main>
);

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading') return <SessionCheck />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Role-based Route Component
const RoleBasedRoute = ({ teacherComponent: TeacherComponent, studentComponent: StudentComponent }) => {
  const { status, userInfo } = useAuth();
  if (status === 'loading') return <SessionCheck />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  const role = normalizeRole(userInfo.role);

  if (role === 'teacher') return <TeacherComponent />;
  if (role === 'parent' || role === 'admin' || role === 'superadmin') {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return <StudentComponent />;
};

const RoleProtectedRoute = ({ allowedRoles = [], children }) => {
  const { status, userInfo } = useAuth();
  if (status === 'loading') return <SessionCheck />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  const role = normalizeRole(userInfo.role);
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  if (normalizedAllowed.includes(role)) {
    return children;
  }

  return <Navigate to={getDefaultRouteForRole(role)} replace />;
};

function App() {
  if (!isSupabaseConfigured) {
    return (
      <main className="configuration-error">
        <section className="configuration-error__card">
          <span className="configuration-error__eyebrow">Setup required</span>
          <h1>Connect e-Likha to Supabase</h1>
          <p>
            Create <code>.env.local</code> from <code>.env.example</code>, add
            the project URL and publishable key, then restart the development
            server.
          </p>
        </section>
      </main>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <UserSettingsEffects />
        <ModelLibraryEffects />
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route 
          path="/homepage" 
          element={
            <ProtectedRoute>
              <RoleBasedRoute 
                teacherComponent={TeacherHomepage} 
                studentComponent={StudentHomepage} 
              />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/activities" 
          element={
            <ProtectedRoute>
              <RoleBasedRoute 
                teacherComponent={TeacherActivities} 
                studentComponent={StudentActivities} 
              />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/activity/:id"
          element={
            <ProtectedRoute>
              <RoleBasedRoute
                teacherComponent={TeacherActivityDetails}
                studentComponent={ActivityDetails}
              />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/activity/:id/start" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['student']}>
                <ActivityStart />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route
          path="/mobile/activity/:id/start"
          element={<MobileActivityStart />}
        />
        <Route
          path="/sandbox"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['student']}>
                <ArSandbox />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['student']}>
                <Profile />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['student', 'teacher', 'parent']}>
                <Settings />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/notifications" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['student', 'teacher', 'parent']}>
                <Notifications />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/classes" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <Classes />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/students" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <Student />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/class/:classId" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <ClassDetails />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reviews" 
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <Reviews />
              </RoleProtectedRoute>
            </ProtectedRoute>
          } 
        />
        <Route
          path="/rubrics"
          element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['teacher']}><Rubrics /></RoleProtectedRoute></ProtectedRoute>}
        />
        <Route
          path="/teacher/models"
          element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['teacher']}><TeacherModels /></RoleProtectedRoute></ProtectedRoute>}
        />
        <Route
          path="/teacher/reports"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <TeacherReports />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/gesture-alerts"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <GestureAlerts />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/:studentId"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['teacher']}>
                <Student />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminDashboardRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminUsersRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminClassesRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/models"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminModelsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminReportsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminSettingsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminDashboardRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/users"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminUsersRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/models"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminModelsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/reports"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminReportsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/settings"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminSettingsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/audit"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminAuditRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
