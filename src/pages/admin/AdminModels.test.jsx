import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdminModels from './AdminModels';
const mockModels = [
  { id: 'a-car', ownerId: 'a', label: 'Car', fileName: 'car.glb', fileType: 'glb', size: 100 },
  { id: 'b-car', ownerId: 'b', label: 'Car', fileName: 'car.glb', fileType: 'glb', size: 100 },
];
jest.mock('./components/AdminShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../components/Navbar', () => () => null);
jest.mock('../../services/adminApi', () => ({ fetchAdminTeachers: async () => ({ success: true, data: [
  { id: 'a', name: 'Teacher Alice', email: 'a@example.com' },
  { id: 'b', name: 'Teacher Bob', email: 'b@example.com' },
  { id: 'c', name: 'Teacher Carol', email: 'c@example.com' },
] }) }));
jest.mock('../../utils/activityArConfig', () => ({ getArModelLibrary: () => mockModels, AR_MODEL_LIBRARY_UPDATED_EVENT: 'models' }));
jest.mock('../../services/r2ModelApi', () => ({
  refreshR2ModelLibrary: async () => mockModels,
  fetchR2StorageUsage: async () => ({ usedBytes: 100, capacityBytes: null }),
  isR2ModelStorageConfigured: () => true,
}));
test.each(['Admin', 'SuperAdmin'])('%s browses separate named libraries, including empty ones', async (role) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminModels role={role} /></MemoryRouter>));
  expect(container.querySelector('.m3d-table')).toBeNull();
  const owners = container.querySelectorAll('.m3d-owner-list button');
  expect(owners).toHaveLength(3);
  await act(async () => owners[0].click());
  expect(container.querySelectorAll('.m3d-table tbody tr')).toHaveLength(1);
  expect(container.querySelector('.m3d-library-count').textContent).toBe('1 of 1 models');
  await act(async () => owners[2].click());
  expect(container.textContent).toContain('This library has no models yet.');
  act(() => root.unmount());
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
