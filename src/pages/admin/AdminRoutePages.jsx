import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminClasses from './AdminClasses';
import AdminModels from './AdminModels';
import AdminReports from './AdminReports';
import AdminSettings from './AdminSettings';
import SuperAdminDashboard from '../superadmin/SuperAdminDashboard';
import SuperAdminUsers from '../superadmin/SuperAdminUsers';
import SuperAdminModels from '../superadmin/SuperAdminModels';
import SuperAdminReports from '../superadmin/SuperAdminReports';
import SuperAdminSettings from '../superadmin/SuperAdminSettings';
import SuperAdminAudit from '../superadmin/SuperAdminAudit';

const ADMIN_ROUTE_MAP = {
  homepage: '/admin',
  users: '/admin/users',
  classes: '/admin/classes',
  models: '/admin/models',
  reports: '/admin/reports',
  settings: '/admin/settings',
};

const SUPERADMIN_ROUTE_MAP = {
  'sa-dashboard': '/superadmin',
  homepage: '/superadmin',
  users: '/superadmin/users',
  models: '/superadmin/models',
  reports: '/superadmin/reports',
  settings: '/superadmin/settings',
  audit: '/superadmin/audit',
};

const normalizeRole = (role) => String(role || '').toLowerCase().replace(/[_\s-]/g, '');

const roleToLabel = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'superadmin' ? 'SuperAdmin' : 'Admin';
};

const getCurrentRoleLabel = () => {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    return roleToLabel(userInfo.role);
  } catch {
    return 'Admin';
  }
};

function useMappedNavigation(routeMap) {
  const navigate = useNavigate();

  return useCallback(
    (pageKey) => {
      const destination = routeMap[pageKey];
      if (destination) {
        navigate(destination);
      }
    },
    [navigate, routeMap]
  );
}

function useLogout() {
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore signout errors and continue local cleanup
    }

    sessionStorage.removeItem('userInfo');
    window.dispatchEvent(new Event('elikha-auth-changed'));
    navigate('/login', { replace: true });
  }, [navigate]);
}

export function AdminDashboardRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  return <AdminDashboard onNavigate={onNavigate} />;
}

export function AdminUsersRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  const role = getCurrentRoleLabel();
  return <AdminUsers onNavigate={onNavigate} role={role} />;
}

export function AdminClassesRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  return <AdminClasses onNavigate={onNavigate} />;
}

export function AdminModelsRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  const role = getCurrentRoleLabel();
  return <AdminModels onNavigate={onNavigate} role={role} />;
}

export function AdminReportsRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  const role = getCurrentRoleLabel();
  return <AdminReports onNavigate={onNavigate} role={role} />;
}

export function AdminSettingsRoute() {
  const onNavigate = useMappedNavigation(ADMIN_ROUTE_MAP);
  const onLogout = useLogout();
  const role = getCurrentRoleLabel();
  return <AdminSettings onNavigate={onNavigate} role={role} onLogout={onLogout} />;
}

export function SuperAdminDashboardRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  return <SuperAdminDashboard onNavigate={onNavigate} />;
}

export function SuperAdminUsersRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  return <SuperAdminUsers onNavigate={onNavigate} />;
}

export function SuperAdminModelsRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  return <SuperAdminModels onNavigate={onNavigate} />;
}

export function SuperAdminReportsRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  return <SuperAdminReports onNavigate={onNavigate} />;
}

export function SuperAdminSettingsRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  const onLogout = useLogout();
  return <SuperAdminSettings onNavigate={onNavigate} onLogout={onLogout} />;
}

export function SuperAdminAuditRoute() {
  const onNavigate = useMappedNavigation(SUPERADMIN_ROUTE_MAP);
  return <SuperAdminAudit onNavigate={onNavigate} />;
}
