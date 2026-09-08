import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CreateActivityModal from './CreateActivityModal';

const mockCreateActivity = jest.fn();

jest.mock('../services/teacherApi', () => ({
  createActivity: (...args) => mockCreateActivity(...args),
}));
jest.mock('../services/activityThumbnailStorage', () => ({
  uploadActivityThumbnail: jest.fn().mockResolvedValue(''),
}));
jest.mock('./ActivityColorPalettePicker', () => () => <div>Palette picker</div>);
jest.mock('./ActivityColorRequirements', () => () => <div>Expected colors</div>);

describe('CreateActivityModal', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.setItem('userInfo', JSON.stringify({ id: 'teacher-1' }));
    mockCreateActivity.mockResolvedValue({ success: true, data: { id: 'activity-1' } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
    jest.clearAllMocks();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('shows the required class selector on the Assignments entry point', async () => {
    await act(async () => {
      root.render(
        <CreateActivityModal
          isOpen
          classes={[{ id: 'class-1', name: 'Diamond', grade: 'Grade 6' }]}
          rubrics={[]}
        />
      );
    });

    expect(container.querySelector('#activity-class')).not.toBeNull();
    expect(container.querySelector('#activity-class').required).toBe(true);
    expect(container.textContent).not.toContain('Required Materials');
  });

  test('locks a preselected class and omits removed materials from the payload', async () => {
    const onCreated = jest.fn();
    await act(async () => {
      root.render(
        <CreateActivityModal
          isOpen
          preselectedClassId="class-1"
          classes={[]}
          rubrics={[]}
          onCreated={onCreated}
        />
      );
    });

    expect(container.querySelector('#activity-class')).toBeNull();
    const title = container.querySelector('#activity-title');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(title, 'Color study');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockCreateActivity).toHaveBeenCalledTimes(1);
    const payload = mockCreateActivity.mock.calls[0][0];
    expect(payload.class_id).toBe('class-1');
    expect(payload.title).toBe('Color study');
    expect(payload).not.toHaveProperty('materials');
    expect(onCreated).toHaveBeenCalledWith({ id: 'activity-1' });
  });
});
