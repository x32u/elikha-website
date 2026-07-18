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
import Profile from './pages/student/Profile';
// Teacher pages
import TeacherHomepage from './pages/teacher/Homepage';
import TeacherActivities from './pages/teacher/Activities';
import Classes from './pages/teacher/Classes';
import ClassDetails from './pages/teacher/ClassDetails';
import Reviews from './pages/teacher/Reviews';
import Student from './pages/teacher/Student';
import GestureAlerts from './pages/teacher/GestureAlerts';
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
  SuperAdminPasswordResetsRoute,
} from './pages/admin/AdminRoutePages';
import Notifications from './pages/shared/Notifications';
import UserSettingsEffects from './components/UserSettingsEffects';
import './styles/App.css';

const normalizeRole = (role) => String(role || '').toLowerCase().replace(/[_\s-]/g, '');

const getDefaultRouteForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'teacher') return '/classes';
  if (normalizedRole === 'admin') return '/admin';
  if (normalizedRole === 'superadmin') return '/superadmin';
  return '/homepage';
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const userInfo = sessionStorage.getItem('userInfo');
  
  if (!userInfo) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Role-based Route Component
const RoleBasedRoute = ({ teacherComponent: TeacherComponent, studentComponent: StudentComponent }) => {
  const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
  const role = normalizeRole(userInfo.role);

  if (role === 'teacher') return <TeacherComponent />;
  if (role === 'admin' || role === 'superadmin') {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return <StudentComponent />;
};

const RoleProtectedRoute = ({ allowedRoles = [], children }) => {
  const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
  const role = normalizeRole(userInfo.role);
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  if (normalizedAllowed.includes(role)) {
    return children;
  }

  return <Navigate to={getDefaultRouteForRole(role)} replace />;
};

function App() {
  return (
    <Router>
      <UserSettingsEffects />
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
              <ActivityStart />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/mobile/activity/:id/start"
          element={<MobileActivityStart />}
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/notifications" 
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/classes" 
          element={
            <ProtectedRoute>
              <Classes />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/students" 
          element={
            <ProtectedRoute>
              <Student />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/class/:classId" 
          element={
            <ProtectedRoute>
              <ClassDetails />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reviews" 
          element={
            <ProtectedRoute>
              <Reviews />
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
              <Student />
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
        <Route
          path="/superadmin/password-resets"
          element={
            <ProtectedRoute>
              <RoleProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminPasswordResetsRoute />
              </RoleProtectedRoute>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
