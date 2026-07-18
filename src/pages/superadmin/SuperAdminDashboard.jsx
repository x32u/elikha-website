import React from 'react';
import AdminDashboard from '../admin/AdminDashboard';

function SuperAdminDashboard({ onNavigate }) {
  return <AdminDashboard onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminDashboard;
