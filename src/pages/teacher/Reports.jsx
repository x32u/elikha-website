import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import { fetchTeacherAnalytics } from '../../services/teacherAnalyticsApi';
import {
  addFallbackInsightExplanations,
  fetchStudentInsightExplanations,
} from '../../services/studentInsightAiApi';
import { serializeCsvRow } from '../../utils/reportAnalytics';
import './Reports.css';

const DAY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const EMPTY_SUMMARY = {
  totalStudents: 0,
  totalActivities: 0,
  assigned: 0,
  submitted: 0,
  reviewed: 0,
  pendingReview: 0,
  missing: 0,
  pending: 0,
  lateSubmissions: 0,
  completionRate: null,
  reviewRate: null,
  averageScore: null,
  onTimeRate: null,
};

const normalizeReport = (value = {}) => ({
  ...value,
  summary: { ...EMPTY_SUMMARY, ...(value.summary || {}) },
  activityPerformance: Array.isArray(value.activityPerformance) ? value.activityPerformance : [],
  studentAttention: Array.isArray(value.studentAttention) ? value.studentAttention : [],
  submissionTrend: Array.isArray(value.submissionTrend) ? value.submissionTrend : [],
  studentInsights: Array.isArray(value.studentInsights) ? value.studentInsights : [],
  classes: Array.isArray(value.classes) ? value.classes : [],
  dataQuality: value.dataQuality && typeof value.dataQuality === 'object' ? value.dataQuality : {},
});

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCount = (value) => Math.max(0, asNumber(value)).toLocaleString('en-PH');

const formatRate = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return `${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 1 })}%`;
};

const formatScore = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Not rated';
  return `${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}/5`;
};

const formatDate = (value) => {
  if (!value) return 'No due date';
  const text = String(value).trim();
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 4))
    : new Date(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
      ? `${text.replace(' ', 'T')}Z`
      : text);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const clampPercent = (value) => Math.max(0, Math.min(100, asNumber(value)));

const insightChartValue = (insight) => {
  if (!insight?.value) return null;
  if (insight.key === 'fastest') return null;
  const numeric = Number.parseFloat(String(insight.value));
  if (!Number.isFinite(numeric)) return null;
  return insight.key === 'improved' ? clampPercent((numeric / 5) * 100) : clampPercent(numeric);
};

const InsightRing = ({ insight }) => {
  const percent = insightChartValue(insight);
  const radius = 42;
  const chartLabel = insight?.value || 'No data';
  return (
    <div
      className={`teacher-reports-insight-ring teacher-reports-insight-ring--${insight?.key || 'default'} ${percent === null ? 'is-empty' : ''}`}
      role={percent === null ? 'img' : 'progressbar'}
      aria-label={`${insight?.title || 'Insight'}: ${chartLabel}`}
      {...(percent === null ? {} : { 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(percent) })}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="teacher-reports-insight-ring__track" cx="50" cy="50" r={radius} />
        {percent !== null && (
          <circle
            className="teacher-reports-insight-ring__value"
            cx="50"
            cy="50"
            r={radius}
            pathLength="100"
            style={{ '--insight-progress': percent, strokeDasharray: 100, strokeDashoffset: 100 - percent }}
          />
        )}
      </svg>
      <div>
        <strong>{insight?.value || '—'}</strong>
        <span>{insight?.key === 'improved' ? 'change' : insight?.key === 'fastest' ? 'time' : 'score'}</span>
      </div>
    </div>
  );
};

const InsightLeaderboardModal = ({ insight, onClose }) => {
  if (!insight) return null;
  const rankings = Array.isArray(insight.rankings) ? insight.rankings : [];
  const qualifyingCount = rankings.filter((item) => item.qualified).length;
  return (
    <div className="teacher-insight-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="teacher-insight-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-insight-dialog-title">
        <header>
          <div>
            <span>Complete class ranking</span>
            <h2 id="teacher-insight-dialog-title">{insight.title}</h2>
            <p>{insight.ai_explanation || insight.detail}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close student ranking">×</button>
        </header>
        <div className="teacher-insight-dialog__summary">
          <strong>{formatCount(rankings.length)} students</strong>
          <span>{formatCount(qualifyingCount)} with enough evidence to rank</span>
        </div>
        <div className="teacher-insight-leaderboard" role="region" aria-label={`${insight.title} student ranking`} tabIndex={0}>
          <table>
            <thead>
              <tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Result</th><th scope="col">Evidence</th></tr>
            </thead>
            <tbody>
              {rankings.length === 0 ? (
                <tr><td colSpan={4}>No students are available for this class filter.</td></tr>
              ) : rankings.map((item) => (
                <tr className={item.qualified ? '' : 'is-unranked'} key={item.student_id}>
                  <td>{item.rank ? `#${item.rank}` : '—'}</td>
                  <th scope="row">{item.student_name || 'Student'}</th>
                  <td>{item.value}</td>
                  <td>{item.qualified ? `${formatCount(item.evidence)} record${asNumber(item.evidence) === 1 ? '' : 's'}` : 'Awaiting evidence'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Array.isArray(insight.evidenceItems) && insight.evidenceItems.length > 0 && (
          <div className="teacher-insight-dialog__evidence">
            <strong>Top learner evidence</strong>
            {insight.evidenceItems.map((item) => (
              <p key={`${item.label}-${item.activity}-${item.date}`}>
                <b>{item.label}:</b> {item.activity} · {Number(item.stars).toFixed(1)}/5 stars · {item.source} · {formatDate(item.date)}
              </p>
            ))}
            <p><b>Calculation:</b> {insight.calculation}</p>
          </div>
        )}
        <footer><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
};

const classLabel = (classInfo = {}) => {
  const name = String(classInfo.name || '').trim();
  if (name) return name;
  const grade = String(classInfo.grade || '').trim();
  const section = String(classInfo.section || '').trim();
  return [grade, section].filter(Boolean).join(' - ') || 'Unnamed class';
};

const safeFilePart = (value) => (
  String(value || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'all-classes'
);

const downloadCsv = (csv, fileName) => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const requestSequence = useRef(0);
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const teacherId = String(userInfo.id || '').trim();
  const [days, setDays] = useState(30);
  const [classId, setClassId] = useState('all');
  const [classOptions, setClassOptions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedInsight, setSelectedInsight] = useState(null);

  const loadReport = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError('');
    setSelectedInsight(null);

    if (!teacherId) {
      setReport(null);
      setError('Your teacher account could not be identified. Please sign in again.');
      setLoading(false);
      return;
    }

    try {
      const result = await fetchTeacherAnalytics({
        teacherId,
        days,
        classId: classId === 'all' ? null : classId,
      });

      if (requestSequence.current !== requestId) return;
      if (!result?.success) {
        throw new Error(result?.error || 'The report could not be loaded.');
      }

      const nextReport = normalizeReport(result.data);
      const reportWithFallbacks = {
        ...nextReport,
        studentInsights: addFallbackInsightExplanations(nextReport.studentInsights),
      };
      setReport(reportWithFallbacks);
      setClassOptions((current) => {
        const optionsById = new Map();
        [...current, ...nextReport.classes].forEach((item) => {
          if (item?.id) optionsById.set(item.id, item);
        });
        return [...optionsById.values()].sort((left, right) => (
          classLabel(left).localeCompare(classLabel(right))
        ));
      });
      const explainedInsights = await fetchStudentInsightExplanations(nextReport.studentInsights);
      if (requestSequence.current === requestId) {
        setReport((current) => current ? { ...current, studentInsights: explainedInsights } : current);
      }
    } catch (loadError) {
      if (requestSequence.current !== requestId) return;
      setReport(null);
      setError(loadError?.message || 'The report could not be loaded.');
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [classId, days, teacherId]);

  useEffect(() => {
    loadReport();
    return () => {
      requestSequence.current += 1;
    };
  }, [loadReport]);

  useEffect(() => {
    if (!selectedInsight) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedInsight(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedInsight]);

  const summary = report?.summary || EMPTY_SUMMARY;
  const selectedClass = classOptions.find((item) => item.id === classId);
  const selectedClassLabel = selectedClass ? classLabel(selectedClass) : 'All classes';

  const statusRows = useMemo(() => {
    const assigned = Math.max(0, asNumber(summary.assigned));
    const toAssignedPercent = (value) => assigned > 0 ? (asNumber(value) / assigned) * 100 : 0;
    return [
      { key: 'submitted', label: 'Submitted', value: summary.submitted, percent: toAssignedPercent(summary.submitted), tone: 'blue' },
      { key: 'reviewed', label: 'Reviewed', value: summary.reviewed, percent: toAssignedPercent(summary.reviewed), tone: 'green' },
      { key: 'pending-review', label: 'Pending review', value: summary.pendingReview, percent: toAssignedPercent(summary.pendingReview), tone: 'purple' },
      { key: 'missing', label: 'Missing', value: summary.missing, percent: toAssignedPercent(summary.missing), tone: 'red' },
      { key: 'pending', label: 'Not due yet', value: summary.pending, percent: toAssignedPercent(summary.pending), tone: 'gray' },
      { key: 'late', label: 'Late submissions', value: summary.lateSubmissions, percent: toAssignedPercent(summary.lateSubmissions), tone: 'orange' },
    ];
  }, [summary]);

  const maximumTrendCount = useMemo(() => (
    Math.max(0, ...(report?.submissionTrend || []).map((item) => asNumber(item.count)))
  ), [report]);

  const qualityItems = useMemo(() => {
    if (!report?.dataQuality) return [];
    const labels = {
      duplicateAssignments: 'duplicate assignments resolved',
      duplicateSubmissions: 'duplicate submissions resolved',
      orphanSubmissions: 'submissions without assignments excluded',
      assignmentsMissingActivity: 'assignments with missing activities excluded',
    };
    return Object.entries(labels)
      .map(([key, label]) => ({ key, label, value: Math.max(0, asNumber(report.dataQuality[key])) }))
      .filter((item) => item.value > 0);
  }, [report]);

  const exportReport = () => {
    if (!report) return;

    const rows = [
      serializeCsvRow(['E-Likha Teacher Reports & Analytics']),
      serializeCsvRow(['Teacher', userInfo.name || 'Teacher']),
      serializeCsvRow(['Class', selectedClassLabel]),
      serializeCsvRow(['Submission trend period', `Last ${days} days`]),
      serializeCsvRow(['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })]),
      '',
      serializeCsvRow(['Summary metric', 'Value']),
      serializeCsvRow(['Total students', summary.totalStudents]),
      serializeCsvRow(['Total activities', summary.totalActivities]),
      serializeCsvRow(['Assignments', summary.assigned]),
      serializeCsvRow(['Submitted', summary.submitted]),
      serializeCsvRow(['Reviewed', summary.reviewed]),
      serializeCsvRow(['Pending review', summary.pendingReview]),
      serializeCsvRow(['Missing', summary.missing]),
      serializeCsvRow(['Not due yet', summary.pending]),
      serializeCsvRow(['Late submissions', summary.lateSubmissions]),
      serializeCsvRow(['Completion rate', formatRate(summary.completionRate)]),
      serializeCsvRow(['Review rate', formatRate(summary.reviewRate)]),
      serializeCsvRow(['On-time rate', formatRate(summary.onTimeRate)]),
      serializeCsvRow(['Average score', formatScore(summary.averageScore)]),
      '',
      serializeCsvRow([
        'Activity', 'Class', 'Due date', 'Assigned', 'Submitted', 'Pending review',
        'Missing', 'Late submissions', 'Completion rate', 'Average score',
      ]),
      ...report.activityPerformance.map((activity) => serializeCsvRow([
        activity.activity_title,
        activity.class_name || 'No class',
        formatDate(activity.due_date),
        activity.assigned,
        activity.submissions,
        activity.pending_review,
        activity.missing,
        activity.late_submissions,
        formatRate(activity.completion_rate),
        formatScore(activity.average_score),
      ])),
      '',
      serializeCsvRow(['Students needing attention']),
      serializeCsvRow(['Student', 'Class', 'Missing', 'Pending review', 'Late submissions', 'Average score']),
      ...report.studentAttention.map((student) => serializeCsvRow([
        student.student_name,
        student.class_name || 'No class',
        student.missing,
        student.pending_review,
        student.late_submissions,
        formatScore(student.average_score),
      ])),
      '',
      serializeCsvRow(['Student insights']),
      serializeCsvRow(['Category', 'Student', 'Result', 'Evidence count', 'Method']),
      ...report.studentInsights.map((insight) => serializeCsvRow([
        insight.title, insight.student_name || 'Not enough data', insight.value || '', insight.evidence || 0, insight.detail || '',
      ])),
      '',
      serializeCsvRow(['Submission trend']),
      serializeCsvRow(['Period', 'Submissions']),
      ...report.submissionTrend.map((item) => serializeCsvRow([item.label, item.count])),
    ];

    const datePart = new Date().toISOString().slice(0, 10);
    downloadCsv(
      rows.join('\r\n'),
      `E-Likha_Teacher_Report_${safeFilePart(selectedClassLabel)}_${days}d_${datePart}.csv`
    );
  };

  return (
    <div className="teacher-reports-page">
      <Navbar />
      <main className="teacher-reports-content" aria-busy={loading}>
        <header className="teacher-reports-header">
          <div>
            <p className="teacher-reports-eyebrow">Teacher workspace</p>
            <h1>Reports &amp; Analytics</h1>
            <p className="teacher-reports-subtitle">
              Track completion, reviews, ratings, and learners who may need support.
            </p>
          </div>
          <button
            type="button"
            className="teacher-reports-export"
            onClick={exportReport}
            disabled={loading || !report}
          >
            Export CSV
          </button>
        </header>

        <section className="teacher-reports-filters" aria-label="Report filters">
          <fieldset className="teacher-reports-range">
            <legend>Submission trend period</legend>
            <div className="teacher-reports-range-options">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={days === option.value ? 'teacher-reports-range-button is-active' : 'teacher-reports-range-button'}
                  aria-pressed={days === option.value}
                  onClick={() => setDays(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="teacher-reports-class-filter">
            <span>Class</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="all">All classes</option>
              {classOptions.map((item) => (
                <option value={item.id} key={item.id}>{classLabel(item)}</option>
              ))}
            </select>
          </label>

          <div className="teacher-reports-filter-summary" aria-live="polite">
            <strong>{selectedClassLabel}</strong>
            <span>Current assignment status · {days}-day submission trend</span>
          </div>
        </section>

        <nav className="teacher-reports-nav" aria-label="Report sections">
          {[
            ['overview', 'Overview'], ['insights', 'Student insights'],
            ['activities', 'Activities'], ['support', 'Needs support'],
          ].map(([key, label]) => (
            <button key={key} type="button" className={activeSection === key ? 'is-active' : ''} onClick={() => setActiveSection(key)}>
              {label}
            </button>
          ))}
        </nav>

        {error && (
          <section className="teacher-reports-message teacher-reports-message--error" role="alert">
            <div>
              <strong>Could not load this report</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={loadReport}>Try again</button>
          </section>
        )}

        {loading && (
          <section className="teacher-reports-message" role="status" aria-live="polite">
            <span className="teacher-reports-spinner" aria-hidden="true" />
            <div>
              <strong>{report ? 'Updating your report' : 'Preparing your report'}</strong>
              <p>Calculating assignment and submission totals…</p>
            </div>
          </section>
        )}

        {!loading && report && (
          <>
            {activeSection === 'overview' && <><section className="teacher-reports-kpis" aria-label="Report summary">
              <article className="teacher-reports-kpi">
                <span>Students</span>
                <strong>{formatCount(summary.totalStudents)}</strong>
                <small>In the selected class scope</small>
              </article>
              <article className="teacher-reports-kpi">
                <span>Activities</span>
                <strong>{formatCount(summary.totalActivities)}</strong>
                <small>{formatCount(summary.assigned)} assignments</small>
              </article>
              <article className="teacher-reports-kpi teacher-reports-kpi--blue">
                <span>Completion rate</span>
                <strong>{formatRate(summary.completionRate)}</strong>
                <small>{formatCount(summary.submitted)} of {formatCount(summary.assigned)} submitted</small>
              </article>
              <article className="teacher-reports-kpi teacher-reports-kpi--purple">
                <span>Pending review</span>
                <strong>{formatCount(summary.pendingReview)}</strong>
                <small>{formatRate(summary.reviewRate)} of submissions reviewed</small>
              </article>
              <article className="teacher-reports-kpi teacher-reports-kpi--red">
                <span>Missing work</span>
                <strong>{formatCount(summary.missing)}</strong>
                <small>{formatCount(summary.lateSubmissions)} late submissions</small>
              </article>
              <article className="teacher-reports-kpi teacher-reports-kpi--green">
                <span>Average rating</span>
                <strong>{formatScore(summary.averageScore)}</strong>
                <small>{formatRate(summary.onTimeRate)} submitted on time</small>
              </article>
            </section>

            <section className="teacher-reports-overview">
              <article className="teacher-reports-card">
                <div className="teacher-reports-card-heading">
                  <div>
                    <h2>Assignment indicators</h2>
                    <p>Indicators can overlap; for example, reviewed and late work is also submitted.</p>
                  </div>
                </div>
                <div className="teacher-reports-status-list">
                  {statusRows.map((item) => (
                    <div className="teacher-reports-status-row" key={item.key}>
                      <div className="teacher-reports-status-label">
                        <span>{item.label}</span>
                        <strong>{formatCount(item.value)}</strong>
                      </div>
                      <div
                        className="teacher-reports-status-track"
                        role="progressbar"
                        aria-label={`${item.label}: ${formatCount(item.value)} of ${formatCount(summary.assigned)}`}
                        aria-valuemin={0}
                        aria-valuemax={Math.max(1, asNumber(summary.assigned))}
                        aria-valuenow={Math.max(0, asNumber(item.value))}
                      >
                        <div
                          className={`teacher-reports-status-fill teacher-reports-status-fill--${item.tone}`}
                          style={{ width: `${clampPercent(item.percent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="teacher-reports-card teacher-reports-trend-card">
                <div className="teacher-reports-card-heading">
                  <div>
                    <h2>Submission trend</h2>
                    <p>Actual submissions received during the selected period.</p>
                  </div>
                  <strong className="teacher-reports-trend-total">
                    {formatCount(report.submissionTrend.reduce((total, item) => total + asNumber(item.count), 0))}
                  </strong>
                </div>

                {report.submissionTrend.length === 0 || maximumTrendCount === 0 ? (
                  <div className="teacher-reports-empty">No submission events in this period.</div>
                ) : (
                  <figure className="teacher-reports-trend" aria-label={`Submission counts for the last ${days} days`}>
                    <div className="teacher-reports-trend-bars">
                      {report.submissionTrend.map((item) => {
                        const count = Math.max(0, asNumber(item.count));
                        const height = maximumTrendCount > 0 ? (count / maximumTrendCount) * 100 : 0;
                        return (
                          <div
                            className="teacher-reports-trend-column"
                            key={item.key || item.label}
                            role="img"
                            aria-label={`${item.label}: ${formatCount(count)} submission${count === 1 ? '' : 's'}`}
                          >
                            <strong>{formatCount(count)}</strong>
                            <div className="teacher-reports-trend-track" aria-hidden="true">
                              <div
                                className="teacher-reports-trend-bar"
                                style={{ height: `${clampPercent(height)}%` }}
                              />
                            </div>
                            <span title={item.label}>{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </figure>
                )}
              </article>
            </section></>}

            {activeSection === 'insights' && (
              <section className="teacher-reports-section teacher-reports-insights" aria-labelledby="teacher-reports-insights-title">
                <div className="teacher-reports-section-heading">
                  <div>
                    <h2 id="teacher-reports-insights-title">Student insights</h2>
                    <p>Evidence-based highlights. AI can structure instructions, while rankings use saved AR events and teacher-confirmed results.</p>
                  </div>
                </div>
                <div className="teacher-reports-insight-grid">
                  {report.studentInsights.map((insight) => (
                    <button
                      type="button"
                      className={`teacher-reports-insight-card teacher-reports-insight-card--${insight.key}`}
                      key={insight.key}
                      onClick={() => setSelectedInsight(insight)}
                      aria-label={`View the complete ${insight.title} student ranking`}
                    >
                      <div className="teacher-reports-insight-card__visual">
                        <InsightRing insight={insight} />
                      </div>
                      <div className="teacher-reports-insight-card__body">
                        <span>{insight.title}</span>
                        {insight.student_id ? <h3>{insight.student_name}</h3> : <h3>Not enough data yet</h3>}
                        <em className={`teacher-reports-insight-source is-${insight.explanation_source || 'evidence'}`}>
                          {insight.explanation_source === 'ai' ? 'Groq AI explanation' : 'Evidence explanation'}
                        </em>
                        <p>{insight.ai_explanation || insight.detail}</p>
                        <small>{formatCount(insight.evidence)} qualifying {insight.key === 'improved' ? 'reviewed activities' : `record${asNumber(insight.evidence) === 1 ? '' : 's'}`}</small>
                        <b className="teacher-reports-insight-card__action">View all students →</b>
                      </div>
                    </button>
                  ))}
                </div>
                <aside className="teacher-reports-quality">
                  <strong>Fair-use safeguard</strong>
                  <p>Insights are category-specific, show their evidence count, and never replace the teacher’s final assessment.</p>
                </aside>
              </section>
            )}

            {activeSection === 'activities' && <section className="teacher-reports-section" aria-labelledby="teacher-reports-activity-title">
              <div className="teacher-reports-section-heading">
                <div>
                  <h2 id="teacher-reports-activity-title">Activity performance</h2>
                  <p>Compare assignment progress across activities in {selectedClassLabel.toLowerCase()}.</p>
                </div>
                <span>{formatCount(report.activityPerformance.length)} activities</span>
              </div>
              <div className="teacher-reports-table-wrap" role="region" aria-label="Activity performance table" tabIndex={0}>
                <table className="teacher-reports-table">
                  <thead>
                    <tr>
                      <th scope="col">Activity</th>
                      <th scope="col">Class</th>
                      <th scope="col">Due</th>
                      <th scope="col">Assigned</th>
                      <th scope="col">Submitted</th>
                      <th scope="col">Pending review</th>
                      <th scope="col">Missing</th>
                      <th scope="col">Late</th>
                      <th scope="col">Completion</th>
                      <th scope="col">Average rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.activityPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="teacher-reports-table-empty">No assigned activities match these filters.</td>
                      </tr>
                    ) : report.activityPerformance.map((activity) => (
                      <tr key={activity.activity_id}>
                        <th scope="row">{activity.activity_title || 'Untitled activity'}</th>
                        <td>{activity.class_name || 'No class'}</td>
                        <td>{formatDate(activity.due_date)}</td>
                        <td>{formatCount(activity.assigned)}</td>
                        <td>{formatCount(activity.submissions)}</td>
                        <td>{formatCount(activity.pending_review)}</td>
                        <td>{formatCount(activity.missing)}</td>
                        <td>{formatCount(activity.late_submissions)}</td>
                        <td>
                          <div className="teacher-reports-table-rate">
                            <span>{formatRate(activity.completion_rate)}</span>
                            <div aria-hidden="true">
                              <i style={{ width: `${clampPercent(activity.completion_rate)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>{formatScore(activity.average_score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>}

            {activeSection === 'support' && <section className="teacher-reports-section" aria-labelledby="teacher-reports-attention-title">
              <div className="teacher-reports-section-heading">
                <div>
                  <h2 id="teacher-reports-attention-title">Learners needing attention</h2>
                  <p>Prioritized from missing work and late submissions; review backlog remains visible for teacher action.</p>
                </div>
                <span>{formatCount(report.studentAttention.length)} learners</span>
              </div>
              <div className="teacher-reports-table-wrap" role="region" aria-label="Learners needing attention table" tabIndex={0}>
                <table className="teacher-reports-table teacher-reports-attention-table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Class</th>
                      <th scope="col">Missing</th>
                      <th scope="col">Pending review</th>
                      <th scope="col">Late submissions</th>
                      <th scope="col">Average rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.studentAttention.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="teacher-reports-table-empty teacher-reports-table-empty--positive">
                          No learners need additional follow-up for these filters.
                        </td>
                      </tr>
                    ) : report.studentAttention.map((student) => (
                      <tr key={student.student_id}>
                        <th scope="row">{student.student_name || 'Student'}</th>
                        <td>{student.class_name || 'No class'}</td>
                        <td><span className={asNumber(student.missing) > 0 ? 'teacher-reports-count-pill teacher-reports-count-pill--red' : 'teacher-reports-count-pill'}>{formatCount(student.missing)}</span></td>
                        <td><span className={asNumber(student.pending_review) > 0 ? 'teacher-reports-count-pill teacher-reports-count-pill--purple' : 'teacher-reports-count-pill'}>{formatCount(student.pending_review)}</span></td>
                        <td><span className={asNumber(student.late_submissions) > 0 ? 'teacher-reports-count-pill teacher-reports-count-pill--orange' : 'teacher-reports-count-pill'}>{formatCount(student.late_submissions)}</span></td>
                        <td>{formatScore(student.average_score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>}

            {qualityItems.length > 0 && (
              <aside className="teacher-reports-quality" aria-label="Report data notes">
                <strong>Data quality note</strong>
                <p>
                  The report handled {qualityItems.map((item) => `${formatCount(item.value)} ${item.label}`).join(', ')}.
                </p>
              </aside>
            )}
          </>
        )}
      </main>
      <InsightLeaderboardModal insight={selectedInsight} onClose={() => setSelectedInsight(null)} />
    </div>
  );
};

export default Reports;
