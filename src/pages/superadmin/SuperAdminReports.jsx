import React from 'react';
import AdminReports from '../admin/AdminReports';

function SuperAdminReports({ onNavigate }) {
  return <AdminReports onNavigate={onNavigate} role="SuperAdmin" />;
}

export default SuperAdminReports;
