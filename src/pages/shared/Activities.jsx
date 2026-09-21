import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getStudentActivities } from '../../services/studentApi';
import { formatRelativeDueDate, getDueDateState } from '../../utils/dateDisplay';
import { normalizeStarRating } from '../../utils/starRating';
import { readUserDataCache } from '../../utils/userDataCache';
import { DEFAULT_ACTIVITY_MAX_POINTS, normalizeActivityMaxPoints } from '../../utils/activityPoints';
import './Activities.css';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const ASSIGNMENT_FILTERS = [
  ['upcoming', 'Assigned'],
  ['past-due', 'Past due'],
  ['completed', 'Completed'],
];

const parseCalendarDate = (value) => {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const match = String(value || '').match(DATE_ONLY_PATTERN);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getAssignmentStatus = (activity) => {
  const status = String(activity?.status || '').toLowerCase();
  if (status === 'submitted' || status === 'reviewed') return 'completed';
  if (status === 'overdue') return 'past-due';
  return 'upcoming';
};

export const getAssignmentDateLabel = (activity, status, now = new Date()) => {
  const value = status === 'completed'
    ? activity.reviewed_at || activity.submitted_at || activity.due_date
    : activity.due_date;
  const date = parseCalendarDate(value);
  if (!date) return status === 'completed' ? 'Completed earlier' : 'No due date';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (difference === 0) return status === 'completed' ? 'Completed today' : 'Due today';
  if (difference === 1 && status !== 'completed') return 'Due tomorrow';
  if (difference === -1 && status !== 'completed') return 'Due yesterday';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
};

const getAssignmentGroupDate = (activity, status) => parseCalendarDate(
  status === 'completed'
    ? activity.reviewed_at || activity.submitted_at || activity.due_date
    : activity.due_date
);

export const sortAssignmentsForFilter = (items, status) => [...items].sort((left, right) => {
  const leftDate = getAssignmentGroupDate(left, status);
  const rightDate = getAssignmentGroupDate(right, status);
  if (!leftDate && rightDate) return 1;
  if (leftDate && !rightDate) return -1;
  if (leftDate && rightDate) {
    const direction = status === 'upcoming' ? 1 : -1;
    const difference = (leftDate.getTime() - rightDate.getTime()) * direction;
    if (difference !== 0) return difference;
  }
  return String(left.title || '').localeCompare(String(right.title || ''));
});

export const getNextAssignmentFilter = (currentIndex, key) => {
  let nextIndex = currentIndex;
  if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % ASSIGNMENT_FILTERS.length;
  else if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ASSIGNMENT_FILTERS.length) % ASSIGNMENT_FILTERS.length;
  else if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = ASSIGNMENT_FILTERS.length - 1;
  else return null;
  return ASSIGNMENT_FILTERS[nextIndex][0];
};

export const assignmentPointLabel = (activity, completed) => {
  const rating = normalizeStarRating(activity.score);
  const maxPoints = normalizeActivityMaxPoints(activity.max_points) || DEFAULT_ACTIVITY_MAX_POINTS;
  return completed && rating
    ? `${rating}/5 rating · ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}`
    : `${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}`;
};

const readableInitial = (activity) => {
  const source = activity?.class_name || activity?.grade || activity?.subject || 'E-Likha';
  return String(source).trim().charAt(0).toUpperCase() || 'E';
};

export const getAssignmentVisual = (activity, completed) => {
  if (completed && activity?.artwork_url) return { type: 'artwork', src: activity.artwork_url };
  if (activity?.activity_thumbnail_url) return { type: 'thumbnail', src: activity.activity_thumbnail_url };
  return { type: 'initial', text: readableInitial(activity) };
};

const AssignmentVisual = ({ activity, completed, overdue }) => {
  const visual = getAssignmentVisual(activity, completed);
  const [failedSrc, setFailedSrc] = useState('');
  const canShowImage = visual.src && failedSrc !== visual.src;

  return (
    <span
      className={`assignment-visual is-${visual.type} ${completed ? 'is-complete' : ''} ${overdue ? 'is-overdue' : ''}`}
      style={visual.type === 'initial' && activity.class_color ? { '--class-color': activity.class_color } : undefined}
      aria-hidden="true"
    >
      {canShowImage ? (
        <img src={visual.src} alt="" onError={() => setFailedSrc(visual.src)} />
      ) : (
        <span className="assignment-initial">{readableInitial(activity)}</span>
      )}
      {completed && (
        <span className="assignment-complete-mark">
          <svg viewBox="0 0 24 24"><path d="m7.5 12.5 3 3 6-7" /></svg>
        </span>
      )}
    </span>
  );
};

const AssignmentStateIcon = ({ completed, overdue }) => (
  <span className={`assignment-state-icon ${completed ? 'is-complete' : ''} ${overdue ? 'is-overdue' : ''}`} aria-hidden="true">
    {completed ? (
      <svg viewBox="0 0 24 24"><path d="m7.5 12.5 3 3 6-7" /></svg>
    ) : (
      <svg viewBox="0 0 24 24"><path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v14H5.5V6A1.5 1.5 0 0 1 7 4.5Z" /><path d="M9 3.5h6v3H9zM8.5 11h7M8.5 15h5" /></svg>
    )}
  </span>
);

const Activities = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get('status');
  const activeFilter = ['upcoming', 'past-due', 'completed'].includes(requestedFilter)
    ? requestedFilter
    : 'upcoming';
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userInfo = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('userInfo') || '{}'); }
    catch { return {}; }
  }, []);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!userInfo.id) { setLoading(false); return; }
      const cached = readUserDataCache(userInfo.id, 'activities');
      if (cached) { setActivities(cached.data || []); setLoading(false); }
      else setLoading(true);

      const result = await getStudentActivities(userInfo.id, { forceRefresh: true });
      if (result.success) { setActivities(result.data || []); setError(null); }
      else setError(result.error);
      setLoading(false);
    };
    fetchActivities();
  }, [userInfo.id]);

  const activityCounts = useMemo(() => activities.reduce((counts, activity) => {
    counts[getAssignmentStatus(activity)] += 1;
    return counts;
  }, { upcoming: 0, 'past-due': 0, completed: 0 }), [activities]);

  const groupedActivities = useMemo(() => {
    const groups = new Map();
    sortAssignmentsForFilter(
      activities.filter((activity) => getAssignmentStatus(activity) === activeFilter),
      activeFilter
    )
      .forEach((activity) => {
        const label = getAssignmentDateLabel(activity, activeFilter);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(activity);
      });
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [activities, activeFilter]);

  const selectFilter = (value) => {
    setSearchParams({ status: value }, { replace: true });
  };

  const handleFilterKeyDown = (event, currentIndex) => {
    const nextValue = getNextAssignmentFilter(currentIndex, event.key);
    if (!nextValue) return;

    event.preventDefault();
    selectFilter(nextValue);
    window.requestAnimationFrame(() => document.getElementById(`assignment-tab-${nextValue}`)?.focus());
  };

  if (loading) return (
    <div className="activities-page-container student-shell">
      <main className="activities-page" aria-busy="true">
        <div className="activities-header"><h1 className="page-title">Assignments</h1></div>
        <div className="loading-state"><div className="loading-spinner" /><p>Loading assignments…</p></div>
      </main>
      <Navbar />
    </div>
  );

  return (
    <div className="activities-page-container student-shell">
      <main className="activities-page">
        <header className="activities-header">
          <div><span className="activities-eyebrow">My work</span><h1 className="page-title">Assignments</h1><p>Open an assignment to review the instructions and continue your work.</p></div>
        </header>

        <div className="filter-tabs" role="tablist" aria-label="Assignment status">
          {ASSIGNMENT_FILTERS.map(([value, label], index) => (
            <button
              id={`assignment-tab-${value}`}
              key={value}
              type="button"
              role="tab"
              aria-controls="assignment-tabpanel"
              aria-selected={activeFilter === value}
              tabIndex={activeFilter === value ? 0 : -1}
              className={`filter-tab ${activeFilter === value ? 'active' : ''}`}
              onClick={() => selectFilter(value)}
              onKeyDown={(event) => handleFilterKeyDown(event, index)}
            >
              <span>{label}</span><b>{activityCounts[value]}</b>
            </button>
          ))}
        </div>

        {error && <div className="error-banner" role="alert">Could not refresh assignments. Showing the latest saved list.</div>}

        <div
          id="assignment-tabpanel"
          className="assignment-groups"
          role="tabpanel"
          aria-labelledby={`assignment-tab-${activeFilter}`}
        >
          {groupedActivities.length > 0 ? groupedActivities.map((group) => {
            const headingId = `group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <section className="assignment-group" key={group.label} aria-labelledby={headingId}>
                <div className="assignment-group-heading"><h2 id={headingId}>{group.label}</h2><span>{group.items.length} {group.items.length === 1 ? 'assignment' : 'assignments'}</span></div>
                <div className="assignment-list">
                  {group.items.map((activity) => {
                    const status = getAssignmentStatus(activity);
                    const completed = status === 'completed';
                    const overdue = status === 'past-due';
                    const dueState = getDueDateState(activity.due_date);
                    const dueLabel = completed
                      ? `Submitted${activity.submitted_at ? ` ${new Date(activity.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                      : formatRelativeDueDate(activity.due_date) || 'No due date';
                    const context = [activity.subject, activity.class_name || activity.grade].filter(Boolean).join(' · ') || 'E-Likha activity';
                    return (
                      <Link key={activity.id} className={`assignment-row ${overdue ? 'is-overdue' : ''} ${completed ? 'is-complete' : ''}`} to={`/activity/${activity.id}`}>
                        <AssignmentVisual activity={activity} completed={completed} overdue={overdue} />
                        <span className="assignment-main"><strong>{activity.title}</strong><span className="assignment-subject">{context}</span></span>
                        <span className="assignment-details"><span className={`assignment-due ${overdue ? 'is-overdue' : ''} ${dueState.isDueSoon && !overdue ? 'is-soon' : ''}`}>{dueLabel}</span><span className="assignment-points">{assignmentPointLabel(activity, completed)}</span></span>
                        <svg className="assignment-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          }) : (
            <div className="no-activities"><AssignmentStateIcon completed={activeFilter === 'completed'} overdue={false} /><h2>No {activeFilter === 'upcoming' ? 'assigned' : activeFilter === 'past-due' ? 'past-due' : 'completed'} work</h2><p>{activeFilter === 'upcoming' ? 'You are all caught up.' : 'Assignments will appear here when available.'}</p></div>
          )}
        </div>
      </main>
      <Navbar />
    </div>
  );
};

export default Activities;
