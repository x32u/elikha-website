import React from 'react';
import AdminModels from '../admin/AdminModels';

function SuperAdminModels({ onNavigate }) {
  return <AdminModels onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminModels;
