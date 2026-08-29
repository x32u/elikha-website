import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Activities.css';
import { getTeacherActivities, createActivity, getTeacherClasses } from '../../services/teacherApi';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  AR_OBJECT_LIBRARY,
  DEFAULT_ALLOWED_OBJECT_IDS,
  DEFAULT_MODEL_ID,
  DEFAULT_PUZZLE_PIECES,
  encodeActivityDescription,
  getArRenderableModelLibrary,
  PUZZLE_PIECE_OPTIONS,
} from '../../utils/activityArConfig';
import { createActivityThumbnailDataUrl } from '../../utils/activityThumbnail';
import { uploadActivityThumbnail } from '../../services/activityThumbnailStorage';
import { formatClassLabel } from '../../utils/classLabels';
import { getDueDateState } from '../../utils/dateDisplay';
import { getActivityRubricOptions } from '../../services/rubricApi';

const MAX_MODEL_QUANTITY = 12;
const ASSIGNMENTS_PER_PAGE = 5;

const clampModelQuantity = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(MAX_MODEL_QUANTITY, Math.floor(count)));
};

const getModelQuantity = (modelIds, modelId) => (
  (Array.isArray(modelIds) ? modelIds : []).filter((id) => id === modelId).length
);

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
  const [creating, setCreating] = useState(false);
  const [modelOptions, setModelOptions] = useState(() => getArRenderableModelLibrary());

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    classId: '',
    dueDate: '',
    materials: [{ id: 1, name: '', description: '' }],
    instructions: '',
    allowedObjects: [...DEFAULT_ALLOWED_OBJECT_IDS],
    modelId: DEFAULT_MODEL_ID,
    modelIds: [DEFAULT_MODEL_ID],
    puzzlePieces: DEFAULT_PUZZLE_PIECES,
    thumbnailUrl: '',
    thumbnailName: '',
    thumbnailError: '',
    rubricId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const refreshModels = () => setModelOptions(getArRenderableModelLibrary());
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
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

  const handleAddMaterial = () => {
    const newMaterial = {
      id: formData.materials.length + 1,
      name: '',
      description: ''
    };
    setFormData({
      ...formData,
      materials: [...formData.materials, newMaterial]
    });
  };

  const handleRemoveMaterial = (id) => {
    setFormData({
      ...formData,
      materials: formData.materials.filter(m => m.id !== id)
    });
  };

  const handleMaterialChange = (id, field, value) => {
    setFormData({
      ...formData,
      materials: formData.materials.map(m =>
        m.id === id ? { ...m, [field]: value } : m
      )
    });
  };

  const resetFormData = () => {
    setFormData({
      title: '',
      description: '',
      classId: '',
      dueDate: '',
      materials: [{ id: 1, name: '', description: '' }],
      instructions: '',
      allowedObjects: [...DEFAULT_ALLOWED_OBJECT_IDS],
      modelId: DEFAULT_MODEL_ID,
      modelIds: [DEFAULT_MODEL_ID],
      puzzlePieces: DEFAULT_PUZZLE_PIECES,
      thumbnailUrl: '',
      thumbnailName: '',
      thumbnailError: '',
      rubricId: '',
    });
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetFormData();
  };

  const handleThumbnailFileChange = async (file) => {
    if (!file) return;
    setFormData((prev) => ({ ...prev, thumbnailError: '' }));
    try {
      const thumbnailUrl = await createActivityThumbnailDataUrl(file);
      setFormData((prev) => ({
        ...prev,
        thumbnailUrl,
        thumbnailName: file.name,
        thumbnailError: '',
      }));
    } catch (error) {
      setFormData((prev) => ({
        ...prev,
        thumbnailError: error.message || 'Unable to process thumbnail image.',
      }));
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

  const handleCreateActivity = async () => {
    if (!formData.title.trim() || !formData.classId) {
      alert('Please fill in title and select a class');
      return;
    }

    setCreating(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const uploadedThumbnailUrl = await uploadActivityThumbnail({
        imageUrl: formData.thumbnailUrl,
        teacherId: userInfo.id,
        fileName: formData.thumbnailName || formData.title,
      });
      const encodedDescription = encodeActivityDescription(formData.description, {
        instructions: formData.instructions,
        allowedObjectIds: formData.allowedObjects,
        modelId: formData.modelIds?.[0] || formData.modelId,
        modelIds: formData.modelIds,
        puzzlePieces: formData.puzzlePieces,
      });
      const result = await createActivity({
        teacher_id: userInfo.id,
        class_id: formData.classId,
        title: formData.title,
        description: encodedDescription,
        instructions: formData.instructions,
        due_date: formData.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        materials: formData.materials.filter(m => m.name.trim()),
        image_url: uploadedThumbnailUrl,
        rubric_id: formData.rubricId || null,
      });

      if (result.success) {
        resetFormData();
        setShowCreateModal(false);
        await loadData(); // Reload activities
      } else {
        alert('Failed to create activity: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating activity:', error);
      setFormData((prev) => ({
        ...prev,
        thumbnailError: error.message || 'Failed to create activity',
      }));
      alert(error.message || 'Failed to create activity');
    } finally {
      setCreating(false);
    }
  };

  const toggleAllowedObject = (objectId) => {
    setFormData((prev) => {
      const exists = prev.allowedObjects.includes(objectId);
      if (exists) {
        const next = prev.allowedObjects.filter((id) => id !== objectId);
        if (next.length === 0) return prev;
        return { ...prev, allowedObjects: next };
      }
      return { ...prev, allowedObjects: [...prev.allowedObjects, objectId] };
    });
  };

  const updateModelQuantity = (modelId, nextQuantity) => {
    const quantity = clampModelQuantity(nextQuantity);
    setFormData((prev) => {
      const currentIds = Array.isArray(prev.modelIds) && prev.modelIds.length > 0
        ? prev.modelIds
        : [prev.modelId || DEFAULT_MODEL_ID];
      const counts = new Map();
      currentIds.forEach((id) => {
        counts.set(id, (counts.get(id) || 0) + 1);
      });
      counts.set(modelId, quantity);

      const nextModelIds = modelOptions.flatMap((model) => (
        Array.from({ length: counts.get(model.id) || 0 }, () => model.id)
      ));

      if (nextModelIds.length === 0) return prev;
      return {
        ...prev,
        modelId: nextModelIds[0],
        modelIds: nextModelIds,
      };
    });
  };

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

        {showCreateModal && (
          <div className="modal-overlay" onClick={closeCreateModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Activity</h2>
                <button className="modal-close" onClick={closeCreateModal}>×</button>
              </div>

              <div className="modal-body">
                {/* Activity Title */}
                <div className="form-group">
                  <label className="form-label">Activity Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter activity title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Developmental rubric (recommended)</label>
                  <select className="form-input" value={formData.rubricId} onChange={(e) => setFormData({ ...formData, rubricId: e.target.value })}>
                    <option value="">No rubric yet</option>
                    {rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title}</option>)}
                  </select>
                  <small className="form-help">Students can review it before starting; its saved criteria guide the AI draft and the teacher’s final review.</small>
                </div>

                {/* Activity Description */}
                <div className="form-group">
                  <label className="form-label">Activity Description</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe the activity"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="3"
                  />
                </div>

                {/* Class Selection */}
                <div className="form-group">
                  <label className="form-label">Class</label>
                  <select
                    className="form-input"
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                  >
                    <option value="">Select a class</option>
                    {classes.map(klass => (
                      <option key={klass.id} value={klass.id}>
                        {formatClassLabel(klass)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">AR Object Kit</label>
                  <div className="activity-object-picker">
                    {AR_OBJECT_LIBRARY.map((item) => {
                      const selected = formData.allowedObjects.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`activity-object-chip ${selected ? 'active' : ''}`}
                          onClick={() => toggleAllowedObject(item.id)}
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
                      const quantity = getModelQuantity(formData.modelIds, model.id);
                      return (
                        <div key={model.id} className={`model-quantity-row ${quantity > 0 ? 'active' : ''}`}>
                          <span className="model-quantity-name">{model.label}</span>
                          <div className="model-quantity-controls">
                            <button
                              type="button"
                              onClick={() => updateModelQuantity(model.id, quantity - 1)}
                              disabled={quantity === 0 || formData.modelIds.length === quantity}
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
                              onClick={() => updateModelQuantity(model.id, quantity + 1)}
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
                    value={formData.puzzlePieces}
                    onChange={(e) => setFormData({ ...formData, puzzlePieces: Number(e.target.value) })}
                  >
                    {PUZZLE_PIECE_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count === 0 ? 'Off' : `${count} pieces`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Required Materials */}
                <div className="form-section">
                  <h3 className="form-section-title">Required Materials</h3>
                  <div className="materials-list">
                    {formData.materials.map((material, index) => (
                      <div key={material.id} className="material-item">
                        <div className="material-number">+</div>
                        <div className="material-inputs">
                          <input
                            type="text"
                            className="material-name"
                            placeholder={`Material ${index + 1}`}
                            value={material.name}
                            onChange={(e) => handleMaterialChange(material.id, 'name', e.target.value)}
                          />
                          <input
                            type="text"
                            className="material-description"
                            placeholder="Description (e.g., Paper: 5 sheets)"
                            value={material.description}
                            onChange={(e) => handleMaterialChange(material.id, 'description', e.target.value)}
                          />
                        </div>
                        {formData.materials.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-material"
                            onClick={() => handleRemoveMaterial(material.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-add-material"
                    onClick={handleAddMaterial}
                  >
                    + Add Material
                  </button>
                </div>

                {/* Activity Thumbnail */}
                <div className="form-section">
                  <h3 className="form-section-title">Activity Thumbnail</h3>
                  <div className={`upload-area ${formData.thumbnailUrl ? 'has-preview' : ''}`}>
                    {formData.thumbnailUrl && (
                      <img
                        src={formData.thumbnailUrl}
                        alt="Activity thumbnail preview"
                        className="thumbnail-preview"
                      />
                    )}
                    <div className="upload-content">
                      <p className="upload-title">Upload Thumbnail Image</p>
                      <p className="upload-description">
                        This appears on student activity cards and pending activity thumbnails.
                      </p>
                      <div className="thumbnail-actions">
                        <label className="btn-upload">
                          Choose Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              handleThumbnailFileChange(e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {formData.thumbnailUrl && (
                          <button
                            type="button"
                            className="btn-clear-thumbnail"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                thumbnailUrl: '',
                                thumbnailName: '',
                                thumbnailError: '',
                              }))
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {formData.thumbnailName && (
                        <p className="thumbnail-file-name">{formData.thumbnailName}</p>
                      )}
                      {formData.thumbnailError && (
                        <p className="thumbnail-error">{formData.thumbnailError}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="form-section">
                  <h3 className="form-section-title">Details</h3>
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Instructions */}
                <div className="form-group">
                  <label className="form-label">Instructions (Optional)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Add detailed instructions for students"
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    rows="4"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  className="btn ghost" 
                  onClick={closeCreateModal}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button 
                  className="btn primary" 
                  onClick={handleCreateActivity}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Activity'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Activities;
