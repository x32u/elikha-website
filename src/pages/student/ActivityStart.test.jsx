import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ActivityStart from './ActivityStart';

const mockGetSubmissionById = jest.fn();
const mockGetActivityDetails = jest.fn();

jest.mock('../ar/ARApp', () => (props) => (
  <div
    data-testid="ar-app"
    data-view-mode={props.viewMode}
    data-student-id={props.studentId}
    data-scene-count={props.initialSceneState.length}
  />
));
jest.mock('../../components/ActivityLock', () => ({ children }) => <>{children}</>);
jest.mock('../../components/ArPreparationGuide', () => () => <div>AR guide</div>);
jest.mock('../../services/studentApi', () => ({
  getActivityDetails: (...args) => mockGetActivityDetails(...args),
}));
jest.mock('../../services/teacherApi', () => ({
  getSubmissionById: (...args) => mockGetSubmissionById(...args),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({
        data: { user: { id: 'teacher-1' } },
        error: null,
      }),
    },
  },
}));

describe('teacher submission AR viewer', () => {
  let container;
  let root;

  beforeEach(() => {
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1', role: 'teacher' }));
    mockGetSubmissionById.mockResolvedValue({
      success: true,
      data: {
        id: 'submission-1',
        activity_id: 'activity-1',
        student_id: 'student-1',
        status: 'submitted',
        artwork_url: 'data:image/webp;base64,review',
        description: JSON.stringify({
          tag: 'ar_submission_v1',
          summary: 'Submitted from AR',
          sceneState: [{ id: 'cube-1' }],
        }),
        activity: {
          id: 'activity-1',
          teacher_id: 'teacher-1',
          description: JSON.stringify({
            tag: 'activity_ar_v1',
            summary: 'Teacher activity',
            allowedObjectIds: ['cube'],
            modelId: 'cactus',
            puzzlePieces: 0,
          }),
        },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
    jest.clearAllMocks();
  });

  it('loads the selected teacher-owned submission as read-only AR', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/activity/activity-1/start?submission=submission-1']}>
          <Routes>
            <Route path="/activity/:id/start" element={<ActivityStart />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(mockGetSubmissionById).toHaveBeenCalledWith('submission-1');
    expect(mockGetActivityDetails).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Submitted Activity Viewer');

    const enterButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Enter AR')
    );
    await act(async () => {
      enterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const arApp = container.querySelector('[data-testid="ar-app"]');
    expect(arApp.dataset.viewMode).toBe('view');
    expect(arApp.dataset.studentId).toBe('student-1');
    expect(arApp.dataset.sceneCount).toBe('1');
  });
});
