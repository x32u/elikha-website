import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import SignedOutOnly from './SignedOutOnly';

let mockAuth;
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));
function Destination() { return <output>{useLocation().pathname}</output>; }

describe('signed-out entry pages', () => {
  let root; let container;
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); delete global.IS_REACT_ACT_ENVIRONMENT; });
  const render = async (entry = '/login') => act(async () => root.render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path={entry} element={<SignedOutOnly><p>Guest page</p></SignedOutOnly>} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  ));
  test.each([
    ['teacher', '/homepage'], ['student', '/homepage'], ['admin', '/admin'],
    ['superadmin', '/superadmin'], ['parent', '/notifications'],
  ])('redirects verified %s to %s', async (role, destination) => {
    mockAuth = { status: 'authenticated', userInfo: { id: 'verified', role } };
    await render();
    expect(container.textContent).toBe(destination);
  });
  test('redirects signed-in teachers opening the site root', async () => {
    mockAuth = { status: 'authenticated', userInfo: { id: 'teacher1', role: 'teacher' } };
    await render('/');
    expect(container.textContent).toBe('/homepage');
  });
  test('does not display login while restoring a session', async () => {
    mockAuth = { status: 'loading', userInfo: null };
    await render();
    expect(container.textContent).toBe('Checking your session…');
  });
  test('shows the guest page when signed out', async () => {
    mockAuth = { status: 'anonymous', userInfo: null };
    await render();
    expect(container.textContent).toBe('Guest page');
  });
});
