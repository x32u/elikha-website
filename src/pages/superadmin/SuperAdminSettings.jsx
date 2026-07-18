import React from 'react';
import AdminSettings from '../admin/AdminSettings';

function SuperAdminSettings({ onNavigate, onLogout }) {
  return <AdminSettings onNavigate={onNavigate} role="SuperAdmin" onLogout={onLogout} />;
}

export default SuperAdminSettings;
