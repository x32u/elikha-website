import React from 'react';
import AdminUsers from '../admin/AdminUsers';

function SuperAdminUsers({ onNavigate }) {
  return <AdminUsers onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminUsers;
