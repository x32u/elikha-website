import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import Navbar from '../../components/Navbar';
import {
  getClassById,
  getClassStudents,
  getClassActivities,
  createActivity,
  updateActivity,
  enrollStudentToClassByEmail,
  removeStudentFromClass,
} from '../../services/teacherApi';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  AR_OBJECT_LIBRARY,
  DEFAULT_ALLOWED_OBJECT_IDS,
  DEFAULT_MODEL_ID,
  DEFAULT_PUZZLE_PIECES,
  encodeActivityDescription,
  getArModelLibrary,
  parseActivityDescription,
  PUZZLE_PIECE_OPTIONS,
} from '../../utils/activityArConfig';
import { createActivityThumbnailDataUrl } from '../../utils/activityThumbnail';
import { uploadActivityThumbnail } from '../../services/activityThumbnailStorage';
import { formatClassLabel } from '../../utils/classLabels';
import './ClassDetails.css';

const MAX_MODEL_QUANTITY = 12;

const clampModelQuantity = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(MAX_MODEL_QUANTITY, Math.floor(count)));
};

const getModelQuantity = (modelIds, modelId) => (
  (Array.isArray(modelIds) ? modelIds : []).filter((id) => id === modelId).length
);

const ClassDetails = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState(null);
  const [students, setStudents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [enrollNotice, setEnrollNotice] = useState('');
  const [removeBusyId, setRemoveBusyId] = useState(null);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityInstructions, setActivityInstructions] = useState('');
  const [activityDueDate, setActivityDueDate] = useState('');
  const [activityThumbnailUrl, setActivityThumbnailUrl] = useState('');
  const [activityThumbnailName, setActivityThumbnailName] = useState('');
  const [activityThumbnailError, setActivityThumbnailError] = useState('');
  const [activityAllowedObjects, setActivityAllowedObjects] = useState([...DEFAULT_ALLOWED_OBJECT_IDS]);
  const [activityModelIds, setActivityModelIds] = useState([DEFAULT_MODEL_ID]);
  const [activityPuzzlePieces, setActivityPuzzlePieces] = useState(DEFAULT_PUZZLE_PIECES);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editThumbnailUrl, setEditThumbnailUrl] = useState('');
  const [editThumbnailName, setEditThumbnailName] = useState('');
  const [editThumbnailError, setEditThumbnailError] = useState('');
  const [editAllowedObjects, setEditAllowedObjects] = useState([...DEFAULT_ALLOWED_OBJECT_IDS]);
  const [editModelIds, setEditModelIds] = useState([DEFAULT_MODEL_ID]);
  const [editPuzzlePieces, setEditPuzzlePieces] = useState(DEFAULT_PUZZLE_PIECES);
  const [modelOptions, setModelOptions] = useState(() => getArModelLibrary());
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadClassData();
  }, [classId]);

  useEffect(() => {
    const refreshModels = () => setModelOptions(getArModelLibrary());
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
  }, []);

  const loadClassData = async () => {
    setLoading(true);
    try {
      // Load class info
      const classResult = await getClassById(classId);
      if (classResult.success) {
        setClassData(classResult.data);
      }

      // Load students
      const studentsResult = await getClassStudents(classId);
      if (studentsResult.success) {
        setStudents(studentsResult.data);
      }

      // Load activities
      const activitiesResult = await getClassActivities(classId);
      if (activitiesResult.success) {
        setActivities(activitiesResult.data);
      }
    } catch (error) {
      console.error('Error loading class data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleThumbnailChange = async (file, setUrl, setName, setError) => {
    if (!file) return;
    setError('');
    try {
      const thumbnailUrl = await createActivityThumbnailDataUrl(file);
      setUrl(thumbnailUrl);
      setName(file.name);
    } catch (error) {
      setError(error.message || 'Unable to process thumbnail image.');
    }
  };

  const resetCreateActivityForm = () => {
    setActivityName('');
    setActivityDescription('');
    setActivityInstructions('');
    setActivityDueDate('');
    setActivityThumbnailUrl('');
    setActivityThumbnailName('');
    setActivityThumbnailError('');
    setActivityAllowedObjects([...DEFAULT_ALLOWED_OBJECT_IDS]);
    setActivityModelIds([DEFAULT_MODEL_ID]);
    setActivityPuzzlePieces(DEFAULT_PUZZLE_PIECES);
  };

  const handleAddActivity = async () => {
    if (activityName.trim()) {
      setActivityThumbnailError('');
      try {
        const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
        const encodedDescription = encodeActivityDescription(activityDescription, {
          instructions: activityInstructions,
          allowedObjectIds: activityAllowedObjects,
          modelIds: activityModelIds,
          puzzlePieces: activityPuzzlePieces,
        });
        const uploadedThumbnailUrl = await uploadActivityThumbnail({
          imageUrl: activityThumbnailUrl,
          teacherId: userInfo.id,
          fileName: activityThumbnailName || activityName,
        });

        const result = await createActivity(userInfo.id, {
          title: activityName,
          description: encodedDescription,
          class_id: classId,
          due_date: activityDueDate || null,
          status: 'active',
          image_url: uploadedThumbnailUrl
        });

        if (result.success) {
          setActivities([...activities, result.data]);
          resetCreateActivityForm();
          setShowActivityForm(false);
        } else {
          setActivityThumbnailError(result.error || 'Failed to create activity.');
          console.error('Failed to create activity:', result.error);
        }
      } catch (error) {
        setActivityThumbnailError(error.message || 'Failed to create activity.');
        console.error('Failed to create activity:', error);
      }
    }
  };

  const handleEnrollStudent = async () => {
    const email = String(enrollEmail || '').trim().toLowerCase();
    if (!email) {
      setEnrollError('Student email is required.');
      setEnrollNotice('');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setEnrollError('Enter a valid student email.');
      setEnrollNotice('');
      return;
    }

    const confirmEnroll = window.confirm(`Add "${email}" to this class?`);
    if (!confirmEnroll) return;

    setEnrollBusy(true);
    setEnrollError('');
    setEnrollNotice('');

    const result = await enrollStudentToClassByEmail(classId, email);
    setEnrollBusy(false);

    if (!result.success) {
      setEnrollError(result.error || 'Failed to add student to class.');
      return;
    }

    const alreadyEnrolled = Boolean(result.data?.already_enrolled);
    setEnrollEmail('');
    setEnrollError('');
    setEnrollNotice(alreadyEnrolled ? 'Student is already in this class.' : 'Student added to class successfully.');
    await loadClassData();
  };

  const handleRemoveStudent = async (student) => {
    if (!student?.id) return;

    const label = student?.name || student?.email || 'this student';
    const confirmRemove = window.confirm(`Remove "${label}" from this class?`);
    if (!confirmRemove) return;

    setRemoveBusyId(student.id);
    const result = await removeStudentFromClass(classId, student.id);
    setRemoveBusyId(null);

    if (!result.success) {
      setEnrollError(result.error || 'Failed to remove student.');
      setEnrollNotice('');
      return;
    }

    setEnrollError('');
    setEnrollNotice('Student removed from class.');
    await loadClassData();
  };

  const formatDateInput = (value) => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const handleEditClick = (activity) => {
    const parsedDescription = parseActivityDescription(activity.description);
    setShowActivityForm(false);
    setEditingActivityId(activity.id);
    setEditName(activity.title || '');
    setEditDescription(parsedDescription.summary || '');
    setEditInstructions(parsedDescription.instructions || '');
    setEditDueDate(formatDateInput(activity.due_date));
    setEditThumbnailUrl(activity.image_url || '');
    setEditThumbnailName(activity.image_url ? 'Current thumbnail' : '');
    setEditThumbnailError('');
    setEditAllowedObjects(parsedDescription.allowedObjectIds || [...DEFAULT_ALLOWED_OBJECT_IDS]);
    setEditModelIds(
      Array.isArray(parsedDescription.modelIds) && parsedDescription.modelIds.length > 0
        ? parsedDescription.modelIds
        : [parsedDescription.modelId || DEFAULT_MODEL_ID]
    );
    setEditPuzzlePieces(parsedDescription.puzzlePieces || DEFAULT_PUZZLE_PIECES);
  };

  const handleCancelEdit = () => {
    setEditingActivityId(null);
    setEditName('');
    setEditDescription('');
    setEditInstructions('');
    setEditDueDate('');
    setEditThumbnailUrl('');
    setEditThumbnailName('');
    setEditThumbnailError('');
    setEditAllowedObjects([...DEFAULT_ALLOWED_OBJECT_IDS]);
    setEditModelIds([DEFAULT_MODEL_ID]);
    setEditPuzzlePieces(DEFAULT_PUZZLE_PIECES);
  };

  const handleSaveEdit = async () => {
    if (!editingActivityId || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const encodedDescription = encodeActivityDescription(editDescription, {
        instructions: editInstructions,
        allowedObjectIds: editAllowedObjects,
        modelIds: editModelIds,
        puzzlePieces: editPuzzlePieces,
      });
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const uploadedThumbnailUrl = await uploadActivityThumbnail({
        imageUrl: editThumbnailUrl,
        teacherId: userInfo.id,
        fileName: editThumbnailName || editName,
      });
      const result = await updateActivity(editingActivityId, {
        title: editName.trim(),
        description: encodedDescription,
        due_date: editDueDate || null,
        image_url: uploadedThumbnailUrl
      });

      if (result.success) {
        setActivities((prev) =>
          prev.map((activity) =>
            activity.id === editingActivityId ? { ...activity, ...result.data } : activity
          )
        );
        handleCancelEdit();
      } else {
        console.error('Failed to update activity:', result.error);
      }
    } catch (error) {
      setEditThumbnailError(error.message || 'Error updating activity.');
      console.error('Error updating activity:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleAllowedObject = (selectedIds, setSelectedIds, objectId) => {
    if (selectedIds.includes(objectId)) {
      const next = selectedIds.filter((id) => id !== objectId);
      if (next.length === 0) return;
      setSelectedIds(next);
      return;
    }
    setSelectedIds([...selectedIds, objectId]);
  };

  const updateModelQuantity = (selectedIds, setSelectedIds, modelId, nextQuantity) => {
    const quantity = clampModelQuantity(nextQuantity);
    const currentIds = Array.isArray(selectedIds) && selectedIds.length > 0
      ? selectedIds
      : [DEFAULT_MODEL_ID];
    const counts = new Map();
    currentIds.forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    counts.set(modelId, quantity);

    const nextModelIds = modelOptions.flatMap((model) => (
      Array.from({ length: counts.get(model.id) || 0 }, () => model.id)
    ));

    if (nextModelIds.length === 0) return;
    setSelectedIds(nextModelIds);
  };

  if (loading) {
    return (
      <div className="page-container">
        <Header />
        <main className="page-content">
          <div className="class-details-shell">
            <p>Loading...</p>
          </div>
        </main>
        <Navbar />
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="page-container">
        <Header />
        <main className="page-content">
          <div className="class-details-shell">
            <p>Class not found</p>
            <button onClick={() => navigate('/classes')}>Back to Classes</button>
          </div>
        </main>
        <Navbar />
      </div>
    );
  }

  const classLabel = formatClassLabel(classData);

  return (
    <div className="page-container">
      <Header />
      <main className="page-content">
        <div className="class-details-shell">
          <header className="class-details-header">
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
            <div className="class-details-title">
              <div className="class-badge" style={{ background: classData.color || '#1800AD' }}>
                {classData.grade?.charAt(0) || 'C'}
              </div>
              <div>
                <h1>{classLabel}</h1>
                <p className="class-subtitle">{students.length} students • {activities.length} activities</p>
              </div>
            </div>
          </header>

          <div className="class-details-layout">
            {/* Students Section */}
            <section className="class-section students-section">
              <h2>Students in This Class</h2>
              <div className="enroll-box">
                <p className="enroll-title">Add Student to Class</p>
                <div className="enroll-row">
                  <input
                    type="email"
                    placeholder="Student email"
                    value={enrollEmail}
                    onChange={(event) => {
                      setEnrollEmail(event.target.value);
                      if (enrollError) setEnrollError('');
                      if (enrollNotice) setEnrollNotice('');
                    }}
                    className="form-input enroll-input"
                  />
                  <button
                    className="btn-submit enroll-btn"
                    onClick={handleEnrollStudent}
                    disabled={enrollBusy}
                  >
                    {enrollBusy ? 'Adding...' : 'Add to Class'}
                  </button>
                </div>
                {enrollError ? <p className="enroll-msg error">{enrollError}</p> : null}
                {enrollNotice ? <p className="enroll-msg success">{enrollNotice}</p> : null}
              </div>
              <div className="students-list">
                {students.length === 0 ? (
                  <p className="no-students">No students added yet.</p>
                ) : (
                  students.map((student) => (
                    <div key={student.id} className="student-item">
                      <div className="student-avatar">
                        {student.name?.charAt(0) || 'S'}
                      </div>
                      <div className="student-info">
                        <div className="student-name">{student.name}</div>
                        {student.email ? <div className="student-email">{student.email}</div> : null}
                        <div className="student-status completed">
                          ✓ In class
                        </div>
                      </div>
                      <div className="student-actions">
                        <button
                          className="btn-remove-student"
                          type="button"
                          onClick={() => handleRemoveStudent(student)}
                          disabled={removeBusyId === student.id}
                        >
                          {removeBusyId === student.id ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Activities Section */}
            <section className="class-section activities-section">
              <div className="activities-header">
                <h2>Class Activities</h2>
                <button 
                  className="btn-add-activity"
                  onClick={() => {
                    if (showActivityForm) {
                      resetCreateActivityForm();
                    }
                    setShowActivityForm(!showActivityForm);
                  }}
                >
                  + Add Activity
                </button>
              </div>

              {showActivityForm && (
                <div className="activity-form">
                  <input
                    type="text"
                    placeholder="Activity name"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    className="form-input"
                  />
                  <textarea
                    placeholder="Activity description (optional)"
                    value={activityDescription}
                    onChange={(e) => setActivityDescription(e.target.value)}
                    className="form-textarea"
                    rows="3"
                  />
                  <textarea
                    placeholder="Teacher instructions shown before AR starts"
                    value={activityInstructions}
                    onChange={(e) => setActivityInstructions(e.target.value)}
                    className="form-textarea"
                    rows="4"
                  />
                  <input
                    type="date"
                    placeholder="Due date"
                    value={activityDueDate}
                    onChange={(e) => setActivityDueDate(e.target.value)}
                    className="form-input"
                  />
                  <div className="activity-thumbnail-upload">
                    <label className="form-label">Activity Thumbnail</label>
                    {activityThumbnailUrl && (
                      <img
                        src={activityThumbnailUrl}
                        alt="Activity thumbnail preview"
                        className="activity-thumbnail-preview"
                      />
                    )}
                    <div className="activity-thumbnail-actions">
                      <label className="btn-upload-thumbnail">
                        Choose Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handleThumbnailChange(
                              e.target.files?.[0],
                              setActivityThumbnailUrl,
                              setActivityThumbnailName,
                              setActivityThumbnailError
                            );
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {activityThumbnailUrl && (
                        <button
                          type="button"
                          className="btn-clear-thumbnail"
                          onClick={() => {
                            setActivityThumbnailUrl('');
                            setActivityThumbnailName('');
                            setActivityThumbnailError('');
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {activityThumbnailName && (
                      <p className="thumbnail-file-name">{activityThumbnailName}</p>
                    )}
                    {activityThumbnailError && (
                      <p className="thumbnail-error">{activityThumbnailError}</p>
                    )}
                  </div>
                  <div className="object-kit-selector">
                    <p className="object-kit-title">AR Object Kit</p>
                    <div className="object-kit-grid">
                      {AR_OBJECT_LIBRARY.map((item) => {
                        const selected = activityAllowedObjects.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`object-kit-chip ${selected ? 'active' : ''}`}
                            onClick={() =>
                              toggleAllowedObject(activityAllowedObjects, setActivityAllowedObjects, item.id)
                            }
                          >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="object-kit-help">Choose which objects students can spawn in AR.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Base 3D Models</label>
                    <div className="model-quantity-grid">
                      {modelOptions.map((model) => {
                        const quantity = getModelQuantity(activityModelIds, model.id);
                        return (
                          <div key={model.id} className={`model-quantity-row ${quantity > 0 ? 'active' : ''}`}>
                            <span className="model-quantity-name">{model.label}</span>
                            <div className="model-quantity-controls">
                              <button
                                type="button"
                                onClick={() => updateModelQuantity(activityModelIds, setActivityModelIds, model.id, quantity - 1)}
                                disabled={quantity === 0 || activityModelIds.length === quantity}
                                aria-label={`Remove one ${model.label}`}
                              >
                                -
                              </button>
                              <span
                                className="model-quantity-count"
                                aria-label={`${model.label} quantity ${quantity}`}
                              >
                                {quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateModelQuantity(activityModelIds, setActivityModelIds, model.id, quantity + 1)}
                                disabled={quantity >= MAX_MODEL_QUANTITY}
                                aria-label={`Add one ${model.label}`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="object-kit-help">Set how many of each model students need, for example 2 popsicle sticks.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Puzzle Pieces</label>
                    <select
                      className="form-input"
                      value={activityPuzzlePieces}
                      onChange={(e) => setActivityPuzzlePieces(Number(e.target.value))}
                    >
                      {PUZZLE_PIECE_OPTIONS.map((count) => (
                        <option key={count} value={count}>
                          {count === 0 ? 'Off' : `${count} pieces`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn-cancel"
                      onClick={() => {
                        resetCreateActivityForm();
                        setShowActivityForm(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button className="btn-submit" onClick={handleAddActivity}>
                      Add Activity
                    </button>
                  </div>
                </div>
              )}

              <div className="activities-list">
                {activities.length === 0 ? (
                  <p className="no-activities">No activities yet. Create one to get started!</p>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      {editingActivityId === activity.id ? (
                        <div className="activity-form activity-edit-form">
                          <input
                            type="text"
                            placeholder="Activity name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="form-input"
                          />
                          <textarea
                            placeholder="Activity description (optional)"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="form-textarea"
                            rows="3"
                          />
                          <textarea
                            placeholder="Teacher instructions shown before AR starts"
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            className="form-textarea"
                            rows="4"
                          />
                          <input
                            type="date"
                            placeholder="Due date"
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            className="form-input"
                          />
                          <div className="activity-thumbnail-upload">
                            <label className="form-label">Activity Thumbnail</label>
                            {editThumbnailUrl && (
                              <img
                                src={editThumbnailUrl}
                                alt="Activity thumbnail preview"
                                className="activity-thumbnail-preview"
                              />
                            )}
                            <div className="activity-thumbnail-actions">
                              <label className="btn-upload-thumbnail">
                                Choose Image
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    handleThumbnailChange(
                                      e.target.files?.[0],
                                      setEditThumbnailUrl,
                                      setEditThumbnailName,
                                      setEditThumbnailError
                                    );
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {editThumbnailUrl && (
                                <button
                                  type="button"
                                  className="btn-clear-thumbnail"
                                  onClick={() => {
                                    setEditThumbnailUrl('');
                                    setEditThumbnailName('');
                                    setEditThumbnailError('');
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            {editThumbnailName && (
                              <p className="thumbnail-file-name">{editThumbnailName}</p>
                            )}
                            {editThumbnailError && (
                              <p className="thumbnail-error">{editThumbnailError}</p>
                            )}
                          </div>
                          <div className="object-kit-selector">
                            <p className="object-kit-title">AR Object Kit</p>
                            <div className="object-kit-grid">
                              {AR_OBJECT_LIBRARY.map((item) => {
                                const selected = editAllowedObjects.includes(item.id);
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={`object-kit-chip ${selected ? 'active' : ''}`}
                                    onClick={() =>
                                      toggleAllowedObject(editAllowedObjects, setEditAllowedObjects, item.id)
                                    }
                                  >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Base 3D Models</label>
                            <div className="model-quantity-grid">
                              {modelOptions.map((model) => {
                                const quantity = getModelQuantity(editModelIds, model.id);
                                return (
                                  <div key={model.id} className={`model-quantity-row ${quantity > 0 ? 'active' : ''}`}>
                                    <span className="model-quantity-name">{model.label}</span>
                                    <div className="model-quantity-controls">
                                      <button
                                        type="button"
                                        onClick={() => updateModelQuantity(editModelIds, setEditModelIds, model.id, quantity - 1)}
                                        disabled={quantity === 0 || editModelIds.length === quantity}
                                        aria-label={`Remove one ${model.label}`}
                                      >
                                        -
                                      </button>
                                      <span
                                        className="model-quantity-count"
                                        aria-label={`${model.label} quantity ${quantity}`}
                                      >
                                        {quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updateModelQuantity(editModelIds, setEditModelIds, model.id, quantity + 1)}
                                        disabled={quantity >= MAX_MODEL_QUANTITY}
                                        aria-label={`Add one ${model.label}`}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="object-kit-help">Set how many of each model students need.</p>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Puzzle Pieces</label>
                            <select
                              className="form-input"
                              value={editPuzzlePieces}
                              onChange={(e) => setEditPuzzlePieces(Number(e.target.value))}
                            >
                              {PUZZLE_PIECE_OPTIONS.map((count) => (
                                <option key={count} value={count}>
                                  {count === 0 ? 'Off' : `${count} pieces`}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-actions">
                            <button className="btn-cancel" onClick={handleCancelEdit}>
                              Cancel
                            </button>
                            <button className="btn-submit" onClick={handleSaveEdit} disabled={savingEdit}>
                              {savingEdit ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="activity-content">
                            {(() => {
                              const parsed = parseActivityDescription(activity.description);
                              const selectedModels = (Array.isArray(parsed.modelIds) && parsed.modelIds.length > 0
                                ? parsed.modelIds
                                : [parsed.modelId]
                              )
                                .map((modelId) => modelOptions.find((model) => model.id === modelId))
                                .filter(Boolean);
                              const selectedModelLabels = [];
                              const selectedModelCounts = new Map();
                              selectedModels.forEach((model) => {
                                if (!selectedModelCounts.has(model.id)) {
                                  selectedModelLabels.push(model);
                                }
                                selectedModelCounts.set(model.id, (selectedModelCounts.get(model.id) || 0) + 1);
                              });
                              const fallbackModelLabel = parsed.modelUrl
                                ? String(parsed.modelUrl).split('?')[0].split('/').filter(Boolean).pop()
                                : '';
                              return (
                                <>
                            <div className="activity-name">{activity.title}</div>
                            {parsed.summary && (
                              <div className="activity-description">{parsed.summary}</div>
                            )}
                            {activity.image_url && (
                              <img
                                src={activity.image_url}
                                alt={`${activity.title} thumbnail`}
                                className="activity-list-thumbnail"
                              />
                            )}
                            {parsed.instructions && (
                              <div className="activity-description">Instructions: {parsed.instructions}</div>
                            )}
                            {(selectedModels.length > 0 || fallbackModelLabel || parsed.puzzlePieces > 0) && (
                              <div className="activity-object-tags">
                                {(selectedModels.length > 0 || fallbackModelLabel) && (
                                  <span className="activity-object-tag">
                                    Models: {selectedModelLabels.length > 0
                                      ? selectedModelLabels
                                        .map((model) => {
                                          const count = selectedModelCounts.get(model.id) || 1;
                                          return count > 1 ? `${model.label} x${count}` : model.label;
                                        })
                                        .join(', ')
                                      : fallbackModelLabel}
                                  </span>
                                )}
                                {parsed.puzzlePieces > 0 && (
                                  <span className="activity-object-tag">
                                    Puzzle: {parsed.puzzlePieces} pieces
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="activity-object-tags">
                              {parsed.allowedObjectIds.map((objectId) => {
                                const objectDef = AR_OBJECT_LIBRARY.find((item) => item.id === objectId);
                                if (!objectDef) return null;
                                return (
                                  <span key={`${activity.id}-${objectId}`} className="activity-object-tag">
                                    {objectDef.icon} {objectDef.label}
                                  </span>
                                );
                              })}
                            </div>
                            {activity.due_date && (
                              <div className="activity-due-date">
                                {(() => {
                                  const dueDate = new Date(activity.due_date);
                                  if (Number.isNaN(dueDate.getTime())) return 'Due: No due date';
                                  return `Due: ${dueDate.toLocaleDateString()}`;
                                })()}
                              </div>
                            )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="activity-action">
                            <button className="btn-edit" onClick={() => handleEditClick(activity)}>Edit</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      <Navbar />
    </div>
  );
};

export default ClassDetails;
