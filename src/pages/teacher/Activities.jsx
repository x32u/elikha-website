import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import CreateActivityModal from '../../components/CreateActivityModal';
import './Activities.css';
import { getTeacherActivities, getTeacherClasses } from '../../services/teacherApi';
import { getDueDateState } from '../../utils/dateDisplay';
import { getActivityRubricOptions } from '../../services/rubricApi';

const ASSIGNMENTS_PER_PAGE = 5;

const formatDueDate = (value) => {
  if (!value) return 'No due date';
  // Dates picked in this form are calendar dates, so avoid a UTC timezone shift.
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Invalid due date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(date);
};

const Activities = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('upcoming');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rubrics, setRubrics] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const [activitiesResult, classesResult, rubricsResult] = await Promise.all([
        getTeacherActivities(userInfo.id),
        getTeacherClasses(userInfo.id),
        getActivityRubricOptions(userInfo.id)
      ]);

      if (activitiesResult.success) {
        // Transform activities data
        const transformedActivities = activitiesResult.data.map(activity => {
          const { hasValidDueDate, isPastDue, isDueSoon } = getDueDateState(activity.due_date);
          const pendingReviewCount = activity.pending_review_count || 0;
          const submissionCount = activity.submission_count || 0;
          const reviewedCount = activity.reviewed_count || 0;

          return {
            id: activity.id,
            title: activity.title,
            className: activity.class_name || 'Unknown Class',
            dueDate: activity.due_date,
            status: pendingReviewCount > 0
              ? 'In review'
              : submissionCount > 0 && reviewedCount === submissionCount
                ? 'Reviewed'
                : 'Open',
            submissions: submissionCount,
            pending: activity.pending_count || 0,
            chip: isPastDue ? 'Past due' : isDueSoon ? 'Due soon' : hasValidDueDate ? 'Upcoming' : 'No due date'
          };
        });
        setAssignments(transformedActivities);
      }

      if (classesResult.success) {
        setClasses(classesResult.data);
      }
      if (rubricsResult.success) setRubrics(rubricsResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return assignments;
    if (activeFilter === 'past-due') return assignments.filter((a) => a.chip === 'Past due');
    if (activeFilter === 'review') return assignments.filter((a) => a.status === 'Needs review' || a.status === 'In review');
    return assignments.filter((a) => a.chip === 'Upcoming' || a.chip === 'Due soon');
  }, [activeFilter, assignments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ASSIGNMENTS_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedAssignments = filtered.slice(
    (visiblePage - 1) * ASSIGNMENTS_PER_PAGE,
    visiblePage * ASSIGNMENTS_PER_PAGE
  );

  return (
    <div className="teacher-page">
      <Navbar />
      <main className="teacher-content">
        <header className="page-header">
          <div className="page-header__titles">
            <span className="eyebrow">Teacher</span>
            <h1>Assignments</h1>
            <p className="lede">Create, schedule, and review student submissions.</p>
          </div>
          <div className="page-header__actions">
            <button className="btn primary" onClick={() => setShowCreateModal(true)}>+ Create Activity</button>
          </div>
        </header>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
            Loading activities...
          </div>
        ) : (
          <section className="panel">
            <div className="panel__header">
              <h2>Filters</h2>
              <div className="filter-tabs">
                {[
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'review', label: 'In Review' },
                  { id: 'past-due', label: 'Past Due' },
                  { id: 'all', label: 'All' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`filter-tab ${activeFilter === tab.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveFilter(tab.id);
                      setCurrentPage(1);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="assignments-list">
              {paginatedAssignments.map((item) => (
                <div key={item.id} className="assignment-card" onClick={() => navigate(`/activity/${item.id}`)}>
                  <div className="assignment-left">
                    <div className="assignment-chip">{item.chip}</div>
                    <div className="assignment-title">{item.title}</div>
                    <div className="assignment-sub">{item.className}</div>
                  </div>
                  <div className="assignment-meta">
                    <div className="meta-block">
                      <span className="meta-label">Due</span>
                      <span className="meta-value">{formatDueDate(item.dueDate)}</span>
                    </div>
                    <div className="meta-block">
                      <span className="meta-label">Submissions</span>
                      <span className="meta-value">{item.submissions}</span>
                    </div>
                    <div className="meta-block">
                      <span className="meta-label">Pending</span>
                      <span className="meta-value">{item.pending}</span>
                    </div>
                    <span className={`status-pill ${item.status === 'Past due' ? 'warn' : item.status === 'Open' ? 'neutral' : 'ok'}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > ASSIGNMENTS_PER_PAGE && (
              <nav className="assignment-pagination" aria-label="Assignments pagination">
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={visiblePage === 1}
                >
                  Back
                </button>
                <div className="pagination-pages">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`pagination-page ${page === visiblePage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                      aria-current={page === visiblePage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={visiblePage === totalPages}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        )}

        <CreateActivityModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
          classes={classes}
          rubrics={rubrics}
        />
      </main>
    </div>
  );
};

export default Activities;
