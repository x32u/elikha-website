import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ActivityDetails from './ActivityDetails';

const mockGetActivityDetails = jest.fn();
const mockGetStudentActivityAssessment = jest.fn();

jest.mock('../../components/Navbar', () => () => <nav>Navigation</nav>);
jest.mock('../../services/studentApi', () => ({
  getActivityDetails: (...args) => mockGetActivityDetails(...args),
  getStudentActivityAssessment: (...args) => mockGetStudentActivityAssessment(...args),
}));
jest.mock('../../services/teacherApi', () => ({
  getActivityById: jest.fn(),
}));

const renderActivity = async (root) => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/activity/activity-1']}>
        <Routes>
          <Route path="/activity/:id" element={<ActivityDetails />} />
        </Routes>
      </MemoryRouter>
    );
  });
};

describe('student ActivityDetails AR guide', () => {
  let container;
  let root;

  beforeEach(() => {
    sessionStorage.setItem('userInfo', JSON.stringify({
      id: 'student-7',
      role: 'student',
    }));
    mockGetActivityDetails.mockReset();
    mockGetStudentActivityAssessment.mockReset();
    mockGetActivityDetails.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Color the Lantern',
        description: 'Practice coloring a 3D lantern.',
        assignment: { id: 'assignment-1', status: 'assigned' },
      },
    });
    mockGetStudentActivityAssessment.mockResolvedValue({
      success: true,
      data: { rubric: null, final_review: null },
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
  });

  it('shows the guide immediately after the activity header before the artwork', async () => {
    await renderActivity(root);

    const header = container.querySelector('.activity-details-header');
    const guide = container.querySelector('[data-testid="ar-preparation-guide"]');
    const hero = container.querySelector('.hero-section');

    expect(mockGetActivityDetails).toHaveBeenCalledWith('activity-1', 'student-7');
    expect(mockGetStudentActivityAssessment).toHaveBeenCalledWith('activity-1');
    expect(guide).not.toBeNull();
    expect(header.nextElementSibling).toBe(guide);
    expect(guide.nextElementSibling).toBe(hero);
  });

  it('shows the attached rubric and all developmental levels before work starts', async () => {
    mockGetStudentActivityAssessment.mockResolvedValue({
      success: true,
      data: {
        rubric: {
          id: 'rubric-1',
          title: 'Lantern Coloring Rubric',
          description: 'These are the skills your teacher will check.',
          assignedVersion: '3',
          criteria: [{
            name: 'Places colors carefully',
            levels: [
              { code: 'B', label: 'Beginning', description: 'Needs close guidance.' },
              { code: 'D', label: 'Developing', description: 'Uses occasional prompts.' },
              { code: 'C', label: 'Consistent', description: 'Works independently.' },
            ],
          }],
        },
        final_review: null,
      },
    });

    await renderActivity(root);

    const rubric = container.querySelector('.activity-rubric-section');
    expect(rubric).not.toBeNull();
    expect(rubric.textContent).toContain('How your work will be checked');
    expect(rubric.textContent).toContain('Lantern Coloring Rubric');
    expect(rubric.textContent).toContain('Places colors carefully');
    expect(rubric.textContent).toContain('Beginning');
    expect(rubric.textContent).toContain('Developing');
    expect(rubric.textContent).toContain('Consistent');
    expect(rubric.textContent).toContain('Rubric v3');
    expect(container.querySelector('.primary-button').textContent).toContain('Start Project');
  });

  it('shows only teacher-confirmed final grading, criterion evidence, and approved suggestions', async () => {
    mockGetActivityDetails.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Color the Lantern',
        description: 'Practice coloring a 3D lantern.',
        is_submitted: true,
        is_reviewed: true,
        assignment: { id: 'assignment-1', status: 'reviewed' },
        submission: {
          id: 'submission-1',
          submitted_at: '2026-08-12T01:00:00Z',
          reviewed_at: '2026-08-13T02:00:00Z',
        },
      },
    });
    mockGetStudentActivityAssessment.mockResolvedValue({
      success: true,
      data: {
        rubric: null,
        final_review: {
          score: 4,
          feedback: 'Your shapes are neat and colorful.',
          reviewed_at: '2026-08-13T02:00:00Z',
          teacher_confirmed_at: '2026-08-13T02:01:00Z',
          observation_date: '2026-08-13',
          next_steps: 'Try adding a blue border next time.',
          evidence_url: 'https://example.com/evidence/lantern',
          criteria: [{
            criterion_index: 0,
            criterion_title_snapshot: 'Places colors carefully',
            selected_rating: 'C',
            consistent_descriptor_snapshot: 'Works independently.',
            teacher_note: 'The color stayed inside the intended areas.',
          }],
          approved_color_suggestion: {
            message: 'Try blue around the yellow center.',
            colors: [{ name: 'Blue', hex: '#2255CC' }],
            rationale: 'Blue will provide a clear contrast.',
          },
          ai_summary: 'UNCONFIRMED AI TEXT MUST NEVER DISPLAY',
          suggested_score: 5,
        },
      },
    });

    await renderActivity(root);

    const review = container.querySelector('.review-result');
    expect(review).not.toBeNull();
    expect(review.textContent).toContain('Your final activity review');
    expect(review.textContent).toContain('4/5');
    expect(review.textContent).toContain('Your shapes are neat and colorful.');
    expect(review.textContent).toContain('Places colors carefully');
    expect(review.textContent).toContain('CO — Consistent'); // legacy 'C' normalizes to SF9 'CO'
    expect(review.textContent).toContain('The color stayed inside the intended areas.');
    expect(review.textContent).toContain('Try adding a blue border next time.');
    expect(review.textContent).toContain('Teacher-approved color suggestion');
    expect(review.textContent).toContain('Try blue around the yellow center.');
    expect(review.textContent).not.toContain('UNCONFIRMED AI TEXT MUST NEVER DISPLAY');
    expect(review.textContent).not.toContain('5/5');
    expect(review.querySelector('a').getAttribute('href')).toBe('https://example.com/evidence/lantern');
  });

  it('explains when a submitted activity is still waiting for teacher review', async () => {
    mockGetActivityDetails.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Color the Lantern',
        is_submitted: true,
        is_reviewed: false,
        assignment: { id: 'assignment-1', status: 'submitted' },
        submission: {
          id: 'submission-1',
          submitted_at: '2026-08-12T01:00:00Z',
          reviewed_at: null,
        },
      },
    });

    await renderActivity(root);

    expect(container.textContent).toContain("Waiting for your teacher's review");
    expect(container.textContent).toContain('final score and rubric results');
    expect(container.querySelector('.review-result')).toBeNull();
  });

  it('shows final legacy grading but withholds unconfirmed rubric details and suggestions', async () => {
    mockGetActivityDetails.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Color the Lantern',
        is_submitted: true,
        is_reviewed: true,
        assignment: { id: 'assignment-1', status: 'reviewed' },
        submission: {
          id: 'submission-1',
          submitted_at: '2026-08-12T01:00:00Z',
          reviewed_at: '2026-08-13T02:00:00Z',
        },
      },
    });
    mockGetStudentActivityAssessment.mockResolvedValue({
      success: true,
      data: {
        rubric: null,
        final_review: {
          score: 5,
          feedback: 'Final feedback from the teacher',
          reviewed_at: '2026-08-13T02:00:00Z',
          teacher_confirmed_at: null,
          approved_color_suggestion: { message: 'UNCONFIRMED COLOR DRAFT' },
          criteria: [{
            criterion_title_snapshot: 'UNCONFIRMED CRITERION DRAFT',
            selected_rating: 'C',
          }],
        },
      },
    });

    await renderActivity(root);

    expect(container.textContent).toContain('Your final activity review');
    expect(container.textContent).toContain('5/5');
    expect(container.textContent).toContain('Final feedback from the teacher');
    expect(container.textContent).not.toContain('UNCONFIRMED COLOR DRAFT');
    expect(container.textContent).not.toContain('UNCONFIRMED CRITERION DRAFT');
    expect(container.querySelector('.review-result')).not.toBeNull();
  });

  it('keeps a confirmed score visible when rubric loading fails and retries the detailed result', async () => {
    mockGetActivityDetails.mockResolvedValue({
      success: true,
      data: {
        id: 'activity-1',
        title: 'Color the Lantern',
        teacher_id: 'teacher-1',
        grade: null,
        is_submitted: true,
        is_reviewed: true,
        assignment: { id: 'assignment-1', status: 'reviewed' },
        submission: {
          id: 'submission-1',
          student_id: 'student-7',
          status: 'reviewed',
          score: 2,
          feedback: 'Keep practicing your color placement.',
          submitted_at: '2026-08-12T01:00:00Z',
          reviewed_at: '2026-08-13T02:00:00Z',
          reviewed_by: 'teacher-1',
        },
      },
    });
    mockGetStudentActivityAssessment.mockResolvedValueOnce({
      success: false,
      error: 'Temporary rubric read failure',
    });

    await renderActivity(root);

    expect(container.textContent).toContain('Grade level: N/A');
    expect(container.textContent).toContain('Your final activity review');
    expect(container.textContent).toContain('2/5');
    expect(container.textContent).toContain('Keep practicing your color placement.');
    expect(container.textContent).toContain('detailed rubric results could not be loaded');
    expect(container.textContent).not.toContain('Teacher-approved color suggestion');

    mockGetStudentActivityAssessment.mockResolvedValueOnce({
      success: true,
      data: {
        rubric: {
          id: 'rubric-1',
          title: 'Lantern Rubric',
          assignedVersion: '1',
          criteria: [],
        },
        final_review: {
          score: 2,
          feedback: 'Keep practicing your color placement.',
          reviewed_at: '2026-08-13T02:00:00Z',
          teacher_confirmed_at: '2026-08-13T02:01:00Z',
          criteria: [{
            criterion_index: 0,
            criterion_title_snapshot: 'Places colors carefully',
            selected_rating: 'B',
            beginning_descriptor_snapshot: 'Needs close guidance.',
            teacher_note: 'Try slower hand movements.',
          }],
          approved_color_suggestion: null,
        },
      },
    });

    await act(async () => {
      container.querySelector('.activity-rubric-retry').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(mockGetStudentActivityAssessment).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Lantern Rubric');
    expect(container.textContent).toContain('Places colors carefully');
    expect(container.textContent).toContain('BG — Beginning'); // legacy 'B' normalizes to SF9 'BG'
    expect(container.textContent).toContain('Try slower hand movements.');
    expect(container.querySelector('.activity-rubric-retry')).toBeNull();
  });
});
