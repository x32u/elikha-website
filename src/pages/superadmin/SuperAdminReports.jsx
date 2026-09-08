import React from 'react';
import AdminReports from '../admin/AdminReports';
import './styles/SuperAdminUnified.css';

function SuperAdminReports({ onNavigate }) {
  return <AdminReports onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminReports;
