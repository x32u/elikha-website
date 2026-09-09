import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ActivityOverviewModal from './ActivityOverviewModal';
import { encodeActivityDescription } from '../../utils/activityArConfig';

const mockGetActivityById = jest.fn();
const mockGetActivitySubmissions = jest.fn();

jest.mock('../../services/teacherApi', () => ({
  getActivityById: (...args) => mockGetActivityById(...args),
  getActivitySubmissions: (...args) => mockGetActivitySubmissions(...args),
}));

describe('ActivityOverviewModal', () => {
  test('loads the activity over the current page and closes from the backdrop', async () => {
    mockGetActivityById.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Sphinx',
        class: { grade: 'Grade 6', section: 'Diamonds' },
        description: encodeActivityDescription('Discover Egypt.', {
          instructions: 'Color the Sphinx.',
          allowedObjectIds: ['sphere'],
          puzzlePieces: 3,
        }),
      },
    });
    mockGetActivitySubmissions.mockResolvedValue({ success: true, data: [] });
    const onClose = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => {
      root.render(<ActivityOverviewModal activityId="activity-1" onClose={onClose} onReviews={jest.fn()} />);
    });

    const modal = document.querySelector('.activity-view-modal');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Sphinx');
    expect(modal.textContent).toContain('Grade 6 - Diamonds');
    expect(modal.textContent).toContain('Discover Egypt.');
    expect(modal.textContent).toContain('Sphere');

    await act(async () => {
      document.querySelector('.activity-view-modal-backdrop')
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });
});
