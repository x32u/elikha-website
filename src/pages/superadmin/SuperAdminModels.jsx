import React from 'react';
import AdminModels from '../admin/AdminModels';
import './styles/SuperAdminUnified.css';

function SuperAdminModels({ onNavigate }) {
  return <AdminModels onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminModels;
