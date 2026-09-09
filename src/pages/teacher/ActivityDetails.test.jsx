import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherActivityDetails from './ActivityDetails';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'activity-1' }),
}));

describe('Teacher activity route', () => {
  test('opens legacy activity links as an overlay on Assignments', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<TeacherActivityDetails />);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/activities', {
      replace: true,
      state: { activityId: 'activity-1' },
    });

    act(() => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });
});
