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
  restoreAdminClassSection,
  updateAdminClassSection,
} from '../../services/adminApi';
import { formatClassLabel } from '../../utils/classLabels';
import { normalizeHexColor } from '../../utils/arColorPalette';

const DEFAULT_GRADE_SUGGESTIONS = [
  'Kindergarten',
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
  color: normalizeHexColor(classInfo?.color) || COLOR_OPTIONS[0],
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const hsvToHex = (h, s, v) => {
  const chroma = v * s;
  const section = (h / 60) % 6;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0]
    : section < 3 ? [0, chroma, x] : section < 4 ? [0, x, chroma]
      : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return `#${[r1, g1, b1].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

const hexToHsv = (hex) => {
  const safe = normalizeHexColor(hex) || COLOR_OPTIONS[0];
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(safe.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    hue = max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * (((b - r) / delta) + 2)
        : 60 * (((r - g) / delta) + 4);
  }
  return { h: hue < 0 ? hue + 360 : hue, s: max ? delta / max : 0, v: max };
};

function ClassColorPicker({ value, onChange }) {
  const safeValue = normalizeHexColor(value) || COLOR_OPTIONS[0];
  const [hsv, setHsv] = React.useState(() => hexToHsv(safeValue));
  const [hexDraft, setHexDraft] = React.useState(safeValue);
  const squareRef = React.useRef(null);

  React.useEffect(() => {
    const normalized = normalizeHexColor(value);
    if (!normalized || normalized === hsvToHex(hsv.h, hsv.s, hsv.v)) return;
    setHsv(hexToHsv(normalized));
    setHexDraft(normalized);
  }, [value, hsv.h, hsv.s, hsv.v]);

  const setColor = React.useCallback((next) => {
    const hex = hsvToHex(next.h, next.s, next.v);
    setHsv(next);
    setHexDraft(hex);
    onChange(hex);
  }, [onChange]);

  const setFromSquare = React.useCallback((clientX, clientY) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    setColor({
      ...hsv,
      s: clamp((clientX - rect.left) / rect.width),
      v: 1 - clamp((clientY - rect.top) / rect.height),
    });
  }, [hsv, setColor]);

  const handleHexChange = (event) => {
    const draftValue = event.target.value.toUpperCase();
    setHexDraft(draftValue);
    const normalized = normalizeHexColor(draftValue);
    if (normalized) {
      setHsv(hexToHsv(normalized));
      onChange(normalized);
    }
  };

  return (
    <div className="ac-class-color-picker">
      <div
        ref={squareRef}
        className="ac-color-square"
        role="slider"
        tabIndex="0"
        aria-label="Class color saturation and brightness"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        style={{ '--ac-picker-hue': hsvToHex(hsv.h, 1, 1) }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setFromSquare(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            setFromSquare(event.clientX, event.clientY);
          }
        }}
        onKeyDown={(event) => {
          const directions = {
            ArrowLeft: [-0.02, 0],
            ArrowRight: [0.02, 0],
            ArrowUp: [0, 0.02],
            ArrowDown: [0, -0.02],
          };
          const direction = directions[event.key];
          if (!direction) return;
          event.preventDefault();
          setColor({
            ...hsv,
            s: clamp(hsv.s + direction[0]),
            v: clamp(hsv.v + direction[1]),
          });
        }}
      >
        <span
          className="ac-color-handle"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div className="ac-color-controls">
        <label className="ac-color-control">
          <span>Hue</span>
          <input
            className="ac-color-hue"
            type="range"
            min="0"
            max="359"
            value={Math.round(hsv.h)}
            onChange={(event) => setColor({ ...hsv, h: Number(event.target.value) })}
          />
        </label>
        <label className="ac-color-control">
          <span>Hex color</span>
          <span className="ac-color-hex-field">
            <i style={{ backgroundColor: safeValue }} aria-hidden="true" />
            <input
              value={hexDraft}
              maxLength="7"
              spellCheck="false"
              aria-label="Class color hex value"
              aria-invalid={!normalizeHexColor(hexDraft)}
              onChange={handleHexChange}
              onBlur={() => setHexDraft(safeValue)}
            />
          </span>
        </label>
        <div className="ac-color-quick" aria-label="Quick class colors">
          <span>Quick choices</span>
          <div className="ac-colors">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={safeValue === color ? 'active' : ''}
                style={{ background: color }}
                onClick={() => {
                  setHsv(hexToHsv(color));
                  setHexDraft(color);
                  onChange(color);
                }}
                aria-label={`Use ${color}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

    const normalizedColor = normalizeHexColor(draft.color);

    const payload = {
      grade: draft.grade.trim(),
      section: draft.section.trim(),
      subject: draft.subject.trim(),
      teacherId: draft.teacherId,
      color: normalizedColor || '',
    };

    if (!payload.grade || !payload.section || !payload.subject || !payload.teacherId) {
      setSaveError('Grade, section, subject, and teacher are required.');
      return;
    }

    if (!payload.color) {
      setSaveError('Choose a valid six-digit class color.');
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
    const confirmed = window.confirm(
      `Disable ${label}? It will disappear from active class lists, but its students, activities, submissions, and reports will stay in the database.`
    );
    if (!confirmed) return;

    const result = await deleteAdminClassSection(classInfo.id);
    if (!result.success) {
      setError(result.error || 'Failed to disable class.');
      return;
    }

    await loadData();
  };

  const restoreClass = async (classInfo) => {
    const result = await restoreAdminClassSection(classInfo.id);
    if (!result.success) {
      setError(result.error || 'Failed to restore class.');
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
  const gradeSuggestions = React.useMemo(() => Array.from(new Set([
    ...DEFAULT_GRADE_SUGGESTIONS,
    ...classes.map((classInfo) => String(classInfo.grade || '').trim()).filter(Boolean),
  ])).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), [classes]);

  return (
    <AdminShell active="classes" onNavigate={onNavigate} className="page-admin page-admin-classes" homePageKey="homepage">
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
          <span>Active Classes</span>
          <strong>{classes.filter((item) => item.is_active !== false).length}</strong>
        </div>
        <div className="ac-stat">
          <span>Teachers Available</span>
          <strong>{teachers.length}</strong>
        </div>
        <div className="ac-stat">
          <span>Inactive Classes</span>
          <strong>{classes.filter((item) => item.is_active === false).length}</strong>
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
                <tr key={classInfo.id} className={classInfo.is_active === false ? 'is-inactive' : ''}>
                  <td>
                    <div className="ac-class-cell">
                      <span className="ac-color" style={{ background: classInfo.color || '#1800AD' }} />
                      <div>
                        <strong>
                          {formatClassLabel(classInfo)}
                          <span className={`ac-status ${classInfo.is_active === false ? 'inactive' : 'active'}`}>
                            {classInfo.is_active === false ? 'Inactive' : 'Active'}
                          </span>
                        </strong>
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
                      {classInfo.is_active === false ? (
                        <button type="button" onClick={() => restoreClass(classInfo)}>Restore</button>
                      ) : (
                        <button type="button" className="danger" onClick={() => removeClass(classInfo)}>Disable</button>
                      )}
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
                <span>Grade level</span>
                <input
                  className="ac-grade-input"
                  value={draft.grade}
                  list="admin-grade-suggestions"
                  maxLength="60"
                  autoComplete="off"
                  onChange={(event) => updateDraft('grade', event.target.value)}
                  placeholder="Kindergarten, Grade 6, Senior High"
                />
                <small className="ac-field-hint">Choose an existing value or type a new grade level.</small>
                <datalist id="admin-grade-suggestions">
                  {gradeSuggestions.map((grade) => <option key={grade} value={grade} />)}
                </datalist>
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

              <div className="ac-field ac-field--full ac-color-field">
                <span>Color</span>
                <small className="ac-field-hint">Pick any color for class cards and labels.</small>
                <ClassColorPicker value={draft.color} onChange={(color) => updateDraft('color', color)} />
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
