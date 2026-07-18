import React from 'react';
import './styles/AdminClasses.css';
import AdminShell from './components/AdminShell';
import {
  createAdminClassSection,
  deleteAdminClassSection,
  fetchAdminClassSections,
  fetchAdminClassStudents,
  fetchAdminTeachers,
  removeAdminStudentFromClass,
  updateAdminClassSection,
} from '../../services/adminApi';
import { formatClassLabel } from '../../utils/classLabels';

const GRADE_OPTIONS = [
  'Grade 4',
  'Grade 5',
  'Grade 6',
];

const COLOR_OPTIONS = ['#1800AD', '#2F80ED', '#138A45', '#AD5900', '#8A2BE2', '#C2410C'];

const emptyDraft = {
  grade: '',
  section: '',
  subject: '',
  teacherId: '',
  color: COLOR_OPTIONS[0],
};

const normalizeDraftFromClass = (classInfo) => ({
  grade: classInfo?.grade || '',
  section: classInfo?.section || '',
  subject: classInfo?.subject || '',
  teacherId: classInfo?.teacher_id || '',
  color: classInfo?.color || COLOR_OPTIONS[0],
});

function AdminClasses({ onNavigate }) {
  const [classes, setClasses] = React.useState([]);
  const [teachers, setTeachers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [modalMode, setModalMode] = React.useState(null);
  const [editingClass, setEditingClass] = React.useState(null);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [classStudents, setClassStudents] = React.useState([]);
  const [studentsLoading, setStudentsLoading] = React.useState(false);
  const [studentsError, setStudentsError] = React.useState('');
  const [removingStudentId, setRemovingStudentId] = React.useState('');

  const isModalOpen = modalMode === 'create' || modalMode === 'edit';

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const [classesResult, teachersResult] = await Promise.all([
      fetchAdminClassSections(),
      fetchAdminTeachers(),
    ]);

    if (!classesResult.success) {
      setError(classesResult.error || 'Failed to load classes.');
      setClasses([]);
    } else {
      setClasses(classesResult.data || []);
    }

    if (!teachersResult.success) {
      setError((prev) => prev || teachersResult.error || 'Failed to load teachers.');
      setTeachers([]);
    } else {
      setTeachers(teachersResult.data || []);
    }

    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const loadClassStudents = React.useCallback(async (classId) => {
    if (!classId) {
      setClassStudents([]);
      return;
    }

    setStudentsLoading(true);
    setStudentsError('');

    const result = await fetchAdminClassStudents(classId);

    if (!result.success) {
      setClassStudents([]);
      setStudentsError(result.error || 'Failed to load enrolled students.');
    } else {
      setClassStudents(result.data || []);
    }

    setStudentsLoading(false);
  }, []);

  const openCreate = () => {
    setDraft({
      ...emptyDraft,
      teacherId: teachers[0]?.id || '',
    });
    setEditingClass(null);
    setClassStudents([]);
    setStudentsError('');
    setRemovingStudentId('');
    setSaveError('');
    setModalMode('create');
  };

  const openEdit = (classInfo) => {
    setEditingClass(classInfo);
    setDraft(normalizeDraftFromClass(classInfo));
    setClassStudents([]);
    setStudentsError('');
    setRemovingStudentId('');
    setSaveError('');
    setModalMode('edit');
    loadClassStudents(classInfo.id);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingClass(null);
    setDraft(emptyDraft);
    setClassStudents([]);
    setStudentsError('');
    setRemovingStudentId('');
    setSaveBusy(false);
    setSaveError('');
  };

  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveClass = async () => {
    setSaveError('');

    const payload = {
      grade: draft.grade.trim(),
      section: draft.section.trim(),
      subject: draft.subject.trim(),
      teacherId: draft.teacherId,
      color: draft.color,
    };

    if (!payload.grade || !payload.section || !payload.subject || !payload.teacherId) {
      setSaveError('Grade, section, subject, and teacher are required.');
      return;
    }

    setSaveBusy(true);

    const result = modalMode === 'edit' && editingClass?.id
      ? await updateAdminClassSection(editingClass.id, payload)
      : await createAdminClassSection(payload);

    setSaveBusy(false);

    if (!result.success) {
      setSaveError(result.error || 'Failed to save class.');
      return;
    }

    closeModal();
    await loadData();
  };

  const removeClass = async (classInfo) => {
    const label = formatClassLabel(classInfo);
    const confirmed = window.confirm(`Delete ${label}? This only works if it has no students or activities.`);
    if (!confirmed) return;

    const result = await deleteAdminClassSection(classInfo.id);
    if (!result.success) {
      setError(result.error || 'Failed to delete class.');
      return;
    }

    await loadData();
  };

  const removeStudent = async (student) => {
    if (!editingClass?.id || !student?.student_id) return;

    const name = student.name || student.email || 'this student';
    const label = formatClassLabel(editingClass);
    const confirmed = window.confirm(
      `Remove ${name} from ${label}? Pending activities from this class will be removed. Submitted work will stay for teacher review.`
    );
    if (!confirmed) return;

    setRemovingStudentId(student.student_id);
    setStudentsError('');

    const result = await removeAdminStudentFromClass(editingClass.id, student.student_id);

    setRemovingStudentId('');

    if (!result.success) {
      setStudentsError(result.error || 'Failed to remove student.');
      return;
    }

    await Promise.all([
      loadClassStudents(editingClass.id),
      loadData(),
    ]);
  };

  const selectedTeacher = teachers.find((teacher) => teacher.id === draft.teacherId);
  const previewName = [draft.grade, draft.section].filter(Boolean).join(' - ') || 'New Class Section';

  return (
    <AdminShell active="classes" onNavigate={onNavigate} className="page-admin-classes" homePageKey="homepage">
      <header className="ac-header">
        <div>
          <h1 className="ac-title">Classes & Sections</h1>
          <p className="ac-subtitle">Create school sections, assign teachers, then enroll students into the right class.</p>
        </div>
        <button className="ac-primary" type="button" onClick={openCreate}>
          + Create Class
        </button>
      </header>

      {error && <div className="ac-alert">{error}</div>}

      <section className="ac-summary" aria-label="Class summary">
        <div className="ac-stat">
          <span>Total Classes</span>
          <strong>{classes.length}</strong>
        </div>
        <div className="ac-stat">
          <span>Teachers Available</span>
          <strong>{teachers.length}</strong>
        </div>
        <div className="ac-stat">
          <span>Students Assigned</span>
          <strong>{classes.reduce((sum, item) => sum + Number(item.student_count || 0), 0)}</strong>
        </div>
      </section>

      <section className="ac-table-card" aria-label="Classes table">
        <table className="ac-table">
          <thead>
            <tr>
              <th>Class / Section</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Students</th>
              <th>Activities</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="ac-empty">Loading classes...</td>
              </tr>
            ) : classes.length === 0 ? (
              <tr>
                <td colSpan={6} className="ac-empty">No classes yet. Create one first, then student dropdowns will have section options.</td>
              </tr>
            ) : (
              classes.map((classInfo) => (
                <tr key={classInfo.id}>
                  <td>
                    <div className="ac-class-cell">
                      <span className="ac-color" style={{ background: classInfo.color || '#1800AD' }} />
                      <div>
                        <strong>{formatClassLabel(classInfo)}</strong>
                        <span>{classInfo.name || 'Class section'}</span>
                      </div>
                    </div>
                  </td>
                  <td>{classInfo.subject || '—'}</td>
                  <td>
                    <strong>{classInfo.teacher_name || 'Unassigned Teacher'}</strong>
                    <span className="ac-muted">{classInfo.teacher_email || ''}</span>
                  </td>
                  <td>{classInfo.student_count || 0}</td>
                  <td>{classInfo.activity_count || 0}</td>
                  <td>
                    <div className="ac-actions">
                      <button type="button" onClick={() => openEdit(classInfo)}>Edit</button>
                      <button type="button" className="danger" onClick={() => removeClass(classInfo)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {isModalOpen && (
        <div className="ac-modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="ac-modal" role="dialog" aria-modal="true" aria-label="Class form" onClick={(event) => event.stopPropagation()}>
            <div className="ac-modal-head">
              <div>
                <p className="ac-modal-eyebrow">{modalMode === 'edit' ? 'Edit Section' : 'New Section'}</p>
                <h2>{previewName}</h2>
              </div>
              <button type="button" className="ac-close" onClick={closeModal} aria-label="Close">×</button>
            </div>

            <div className="ac-modal-body">
              {saveError && <div className="ac-alert">{saveError}</div>}
              {teachers.length === 0 && (
                <div className="ac-alert">No teacher accounts found. Create a teacher account first in Users.</div>
              )}

              <label className="ac-field">
                <span>Grade</span>
                <select value={draft.grade} onChange={(event) => updateDraft('grade', event.target.value)}>
                  <option value="">Select grade</option>
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </label>

              <label className="ac-field">
                <span>Section</span>
                <input
                  value={draft.section}
                  onChange={(event) => updateDraft('section', event.target.value)}
                  placeholder="Ruby, Emerald, Section A"
                />
              </label>

              <label className="ac-field">
                <span>Subject</span>
                <input
                  value={draft.subject}
                  onChange={(event) => updateDraft('subject', event.target.value)}
                  placeholder="MAPEH, Arts, Filipino"
                />
              </label>

              <label className="ac-field">
                <span>Assigned Teacher</span>
                <select value={draft.teacherId} onChange={(event) => updateDraft('teacherId', event.target.value)}>
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}{teacher.email ? ` - ${teacher.email}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ac-field">
                <span>Color</span>
                <div className="ac-colors">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={draft.color === color ? 'active' : ''}
                      style={{ background: color }}
                      onClick={() => updateDraft('color', color)}
                      aria-label={`Use ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div className="ac-preview">
                <span>Preview</span>
                <strong>{previewName}</strong>
                <small>{selectedTeacher ? `Teacher: ${selectedTeacher.name}` : 'No teacher selected'}</small>
              </div>

              {modalMode === 'edit' && (
                <section className="ac-students-panel" aria-label="Students enrolled in this class">
                  <div className="ac-students-head">
                    <div>
                      <span>Students</span>
                      <strong>{classStudents.length} enrolled</strong>
                    </div>
                    <button type="button" className="ac-secondary" onClick={() => loadClassStudents(editingClass?.id)} disabled={studentsLoading}>
                      {studentsLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  {studentsError && <div className="ac-inline-error">{studentsError}</div>}

                  {studentsLoading ? (
                    <div className="ac-students-empty">Loading students...</div>
                  ) : classStudents.length === 0 ? (
                    <div className="ac-students-empty">No students enrolled in this class yet.</div>
                  ) : (
                    <div className="ac-students-list">
                      {classStudents.map((student) => (
                        <article className="ac-student-row" key={student.id || student.student_id}>
                          <div className="ac-student-avatar" aria-hidden="true">
                            {(student.name || student.email || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div className="ac-student-info">
                            <strong>{student.name || 'Student'}</strong>
                            <span>{student.email || 'No email'}</span>
                            {student.enrolled_at && (
                              <small>Enrolled {new Date(student.enrolled_at).toLocaleDateString()}</small>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ac-remove-student"
                            onClick={() => removeStudent(student)}
                            disabled={removingStudentId === student.student_id}
                          >
                            {removingStudentId === student.student_id ? 'Removing...' : 'Remove'}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>

            <div className="ac-modal-actions">
              <button type="button" className="ac-secondary" onClick={closeModal}>Cancel</button>
              <button type="button" className="ac-primary" onClick={saveClass} disabled={saveBusy || teachers.length === 0}>
                {saveBusy ? 'Saving...' : modalMode === 'edit' ? 'Save Changes' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminClasses;
