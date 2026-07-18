import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getActivityById, getActivitySubmissions } from '../../services/teacherApi';
import { parseActivityDescription, getArModelLibrary } from '../../utils/activityArConfig';
import { formatClassLabel } from '../../utils/classLabels';
import './ActivityDetails.css';

const TeacherActivityDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [activityResult, submissionsResult] = await Promise.all([
          getActivityById(id),
          getActivitySubmissions(id),
        ]);

        if (activityResult.success) {
          setActivity(activityResult.data);
        }

        if (submissionsResult.success) {
          setSubmissions(submissionsResult.data || []);
        }
      } catch (error) {
        console.error('Error loading activity:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const reviewedCount = submissions.filter((s) =>
    ['reviewed', 'completed', 'graded'].includes(s.status)
  ).length;
  const pendingCount = submissions.length - reviewedCount;
  const parsedActivity = parseActivityDescription(activity?.description);
  const selectedModel = getArModelLibrary().find((model) => model.id === parsedActivity.modelId);
  const fallbackModelLabel = parsedActivity.modelUrl
    ? String(parsedActivity.modelUrl).split('?')[0].split('/').filter(Boolean).pop()
    : '';

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="teacher-page">
        <Navbar />
        <main className="teacher-content">
          <div className="panel">
            <p>Loading activity...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="teacher-page">
        <Navbar />
        <main className="teacher-content">
          <div className="panel">
            <p>Activity not found.</p>
            <button className="btn ghost" onClick={() => navigate('/activities')}>Back to Assignments</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="teacher-page">
      <Navbar />
      <main className="teacher-content">
        <header className="page-header">
          <div className="page-header__titles">
            <span className="eyebrow">Teacher</span>
            <h1>{activity.title}</h1>
            <p className="lede">Due on {formatDate(activity.due_date)}</p>
          </div>
          <div className="page-header__actions">
            <button className="btn ghost" onClick={() => navigate('/activities')}>Back</button>
            <button className="btn primary" onClick={() => navigate('/reviews')}>Go to Reviews</button>
          </div>
        </header>

        <section className="panel activity-hero">
          <div className="hero-block">
            <div className="hero-image" aria-hidden="true">
              <span role="img" aria-label="Palette">🎨</span>
            </div>
            <div className="hero-content">
              <h2>{activity.subject || activity.title}</h2>
              <p>{parsedActivity.summary || 'No description provided.'}</p>
              {(selectedModel || fallbackModelLabel) && (
                <p>Base model: {selectedModel?.label || fallbackModelLabel}</p>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Overview</h2>
          <div className="overview-grid">
            <div className="overview-card">
              <span className="overview-label">Class</span>
              <span className="overview-value">{activity.class ? formatClassLabel(activity.class) : 'Unassigned'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">Grade</span>
              <span className="overview-value">{activity.grade || 'N/A'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">Status</span>
              <span className="overview-value">{activity.status || 'active'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">Submissions</span>
              <span className="overview-value">{submissions.length}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">Pending Review</span>
              <span className="overview-value">{pendingCount}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">Reviewed</span>
              <span className="overview-value">{reviewedCount}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default TeacherActivityDetails;
