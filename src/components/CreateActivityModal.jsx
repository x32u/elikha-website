import React, { useEffect, useMemo, useState } from 'react';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  AR_OBJECT_LIBRARY,
  DEFAULT_ALLOWED_OBJECT_IDS,
  DEFAULT_MODEL_ID,
  DEFAULT_PUZZLE_PIECES,
  encodeActivityDescription,
  getArRenderableModelLibrary,
  PUZZLE_PIECE_OPTIONS,
} from '../utils/activityArConfig';
import { createActivityThumbnailDataUrl } from '../utils/activityThumbnail';
import { uploadActivityThumbnail } from '../services/activityThumbnailStorage';
import { createActivity } from '../services/teacherApi';
import { formatClassLabel } from '../utils/classLabels';
import { sanitizeColorRequirements } from '../utils/activityColorRequirements';
import ActivityColorPalettePicker from './ActivityColorPalettePicker';
import ActivityColorRequirements from './ActivityColorRequirements';
import './CreateActivityModal.css';

const MAX_MODEL_QUANTITY = 12;

const createInitialForm = (preselectedClassId = '') => ({
  title: '',
  description: '',
  instructions: '',
  classId: preselectedClassId || '',
  dueDate: '',
  allowedObjects: [...DEFAULT_ALLOWED_OBJECT_IDS],
  modelIds: [DEFAULT_MODEL_ID],
  puzzlePieces: DEFAULT_PUZZLE_PIECES,
  thumbnailUrl: '',
  thumbnailName: '',
  thumbnailError: '',
  rubricId: '',
  allowedColors: [],
  colorRequirements: [],
});

const getModelQuantity = (modelIds, modelId) => (
  (Array.isArray(modelIds) ? modelIds : []).filter((id) => id === modelId).length
);

const clampModelQuantity = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(MAX_MODEL_QUANTITY, Math.floor(count)));
};

const CreateActivityModal = ({
  isOpen,
  onClose,
  onCreated,
  classes = [],
  rubrics = [],
  preselectedClassId = '',
}) => {
  const [formData, setFormData] = useState(() => createInitialForm(preselectedClassId));
  const [creating, setCreating] = useState(false);
  const [modelOptions, setModelOptions] = useState(() => getArRenderableModelLibrary());
  const hasPreselectedClass = Boolean(preselectedClassId);

  useEffect(() => {
    const refreshModels = () => setModelOptions(getArRenderableModelLibrary());
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, refreshModels);
  }, []);

  useEffect(() => {
    if (isOpen) setFormData(createInitialForm(preselectedClassId));
  }, [isOpen, preselectedClassId]);

  const selectedClassId = hasPreselectedClass ? preselectedClassId : formData.classId;
  const selectedModelCount = useMemo(
    () => (Array.isArray(formData.modelIds) ? formData.modelIds.length : 0),
    [formData.modelIds]
  );

  if (!isOpen) return null;

  const closeModal = () => {
    if (creating) return;
    setFormData(createInitialForm(preselectedClassId));
    onClose?.();
  };

  const toggleAllowedObject = (objectId) => {
    setFormData((current) => {
      const exists = current.allowedObjects.includes(objectId);
      if (exists) {
        const next = current.allowedObjects.filter((id) => id !== objectId);
        return next.length > 0 ? { ...current, allowedObjects: next } : current;
      }
      return { ...current, allowedObjects: [...current.allowedObjects, objectId] };
    });
  };

  const updateModelQuantity = (modelId, nextQuantity) => {
    const quantity = clampModelQuantity(nextQuantity);
    setFormData((current) => {
      const currentIds = current.modelIds?.length ? current.modelIds : [DEFAULT_MODEL_ID];
      const counts = new Map();
      currentIds.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
      counts.set(modelId, quantity);
      const modelIds = modelOptions.flatMap((model) => (
        Array.from({ length: counts.get(model.id) || 0 }, () => model.id)
      ));
      return modelIds.length > 0 ? { ...current, modelIds } : current;
    });
  };

  const handleThumbnailFileChange = async (file) => {
    if (!file) return;
    setFormData((current) => ({ ...current, thumbnailError: '' }));
    try {
      const thumbnailUrl = await createActivityThumbnailDataUrl(file);
      setFormData((current) => ({
        ...current,
        thumbnailUrl,
        thumbnailName: file.name,
        thumbnailError: '',
      }));
    } catch (error) {
      setFormData((current) => ({
        ...current,
        thumbnailError: error.message || 'Unable to process thumbnail image.',
      }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.title.trim() || !selectedClassId) {
      setFormData((current) => ({
        ...current,
        thumbnailError: !selectedClassId
          ? 'Enter an activity title and select a class.'
          : 'Enter an activity title.',
      }));
      return;
    }

    setCreating(true);
    setFormData((current) => ({ ...current, thumbnailError: '' }));
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const uploadedThumbnailUrl = await uploadActivityThumbnail({
        imageUrl: formData.thumbnailUrl,
        teacherId: userInfo.id,
        fileName: formData.thumbnailName || formData.title,
      });
      const description = encodeActivityDescription(formData.description, {
        instructions: formData.instructions,
        allowedObjectIds: formData.allowedObjects,
        modelId: formData.modelIds[0] || DEFAULT_MODEL_ID,
        modelIds: formData.modelIds,
        puzzlePieces: formData.puzzlePieces,
        allowedColors: formData.allowedColors,
        colorRequirements: formData.colorRequirements,
      });
      const result = await createActivity({
        teacher_id: userInfo.id,
        class_id: selectedClassId,
        title: formData.title.trim(),
        description,
        due_date: formData.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        image_url: uploadedThumbnailUrl,
        rubric_id: formData.rubricId || null,
      });

      if (!result.success) throw new Error(result.error || 'Failed to create activity.');
      setFormData(createInitialForm(preselectedClassId));
      onClose?.();
      await onCreated?.(result.data);
    } catch (error) {
      setFormData((current) => ({
        ...current,
        thumbnailError: error.message || 'Failed to create activity.',
      }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="create-activity-modal__overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeModal();
    }}>
      <form className="create-activity-modal" onSubmit={handleSubmit} aria-labelledby="create-activity-title">
        <header className="create-activity-modal__header">
          <div>
            <p className="create-activity-modal__eyebrow">Teacher workspace</p>
            <h2 id="create-activity-title">Create New Activity</h2>
          </div>
          <button type="button" className="create-activity-modal__close" onClick={closeModal} aria-label="Close create activity form">×</button>
        </header>

        <div className="create-activity-modal__body">
          <div className="form-group">
            <label className="form-label" htmlFor="activity-title">Activity Title</label>
            <input id="activity-title" className="form-input" required value={formData.title} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} placeholder="Enter activity title" />
          </div>

          {!hasPreselectedClass && (
            <div className="form-group">
              <label className="form-label" htmlFor="activity-class">Select Class</label>
              <select id="activity-class" className="form-input" required value={formData.classId} onChange={(event) => setFormData((current) => ({ ...current, classId: event.target.value }))}>
                <option value="">Select a class</option>
                {classes.map((klass) => <option key={klass.id} value={klass.id}>{formatClassLabel(klass)}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="activity-rubric">Rubric (optional)</label>
            <select id="activity-rubric" className="form-input" value={formData.rubricId} onChange={(event) => setFormData((current) => ({ ...current, rubricId: event.target.value }))}>
              <option value="">No rubric</option>
              {rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title}</option>)}
            </select>
            <small className="form-help">Students can review it before starting; its criteria guide the AI draft and teacher review.</small>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="activity-description">Activity Description</label>
            <textarea id="activity-description" className="form-textarea" rows="3" value={formData.description} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} placeholder="Describe the activity" />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="activity-instructions">Instructions (optional)</label>
            <textarea id="activity-instructions" className="form-textarea" rows="4" value={formData.instructions} onChange={(event) => setFormData((current) => ({ ...current, instructions: event.target.value }))} placeholder="Add detailed instructions for students" />
          </div>

          <div className="form-group">
            <span className="form-label">AR Object Kit</span>
            <div className="create-activity-modal__object-grid">
              {AR_OBJECT_LIBRARY.map((item) => {
                const selected = formData.allowedObjects.includes(item.id);
                return <button key={item.id} type="button" className={`activity-object-chip ${selected ? 'active' : ''}`} aria-pressed={selected} onClick={() => toggleAllowedObject(item.id)}><span>{item.icon}</span><span>{item.label}</span></button>;
              })}
            </div>
          </div>

          <div className="form-group">
            <span className="form-label">Base 3D Models</span>
            <div className="model-quantity-grid">
              {modelOptions.map((model) => {
                const quantity = getModelQuantity(formData.modelIds, model.id);
                return (
                  <div key={model.id} className={`model-quantity-row ${quantity > 0 ? 'active' : ''}`}>
                    <span className="model-quantity-name">{model.label}</span>
                    <div className="model-quantity-controls">
                      <button type="button" onClick={() => updateModelQuantity(model.id, quantity - 1)} disabled={quantity === 0 || selectedModelCount === quantity} aria-label={`Remove one ${model.label}`}>−</button>
                      <span className="model-quantity-count" aria-label={`${model.label} quantity ${quantity}`}>{quantity}</span>
                      <button type="button" onClick={() => updateModelQuantity(model.id, quantity + 1)} disabled={quantity >= MAX_MODEL_QUANTITY} aria-label={`Add one ${model.label}`}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <small className="form-help">Set how many of each model students need.</small>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="activity-puzzle-pieces">Puzzle Pieces</label>
            <select id="activity-puzzle-pieces" className="form-input" value={formData.puzzlePieces} onChange={(event) => setFormData((current) => ({ ...current, puzzlePieces: Number(event.target.value) }))}>
              {PUZZLE_PIECE_OPTIONS.map((count) => <option key={count} value={count}>{count === 0 ? 'Off' : `${count} pieces`}</option>)}
            </select>
          </div>

          <ActivityColorPalettePicker value={formData.allowedColors} onChange={(allowedColors) => setFormData((current) => ({ ...current, allowedColors, colorRequirements: sanitizeColorRequirements(current.colorRequirements, allowedColors) }))} />
          <ActivityColorRequirements instructions={formData.instructions} allowedObjectIds={formData.allowedObjects} modelIds={formData.modelIds} modelOptions={modelOptions} allowedColors={formData.allowedColors} value={formData.colorRequirements} onChange={(colorRequirements) => setFormData((current) => ({ ...current, colorRequirements }))} />

          <div className="form-section">
            <h3 className="form-section-title">Activity Thumbnail</h3>
            <div className={`create-activity-modal__upload ${formData.thumbnailUrl ? 'has-preview' : ''}`}>
              {formData.thumbnailUrl && <img src={formData.thumbnailUrl} alt="Activity thumbnail preview" className="thumbnail-preview" />}
              <div className="create-activity-modal__upload-content">
                <p>Upload an image shown on student activity cards.</p>
                <div className="thumbnail-actions">
                  <label className="btn-upload">Choose Image<input type="file" accept="image/*" onChange={(event) => { handleThumbnailFileChange(event.target.files?.[0]); event.target.value = ''; }} /></label>
                  {formData.thumbnailUrl && <button type="button" className="btn-clear-thumbnail" onClick={() => setFormData((current) => ({ ...current, thumbnailUrl: '', thumbnailName: '', thumbnailError: '' }))}>Remove</button>}
                </div>
                {formData.thumbnailName && <p className="thumbnail-file-name">{formData.thumbnailName}</p>}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="activity-due-date">Due Date</label>
            <input id="activity-due-date" type="date" className="form-input" value={formData.dueDate} onChange={(event) => setFormData((current) => ({ ...current, dueDate: event.target.value }))} />
          </div>

          {formData.thumbnailError && <p className="create-activity-modal__error" role="alert">{formData.thumbnailError}</p>}
        </div>

        <footer className="create-activity-modal__footer">
          <button type="button" className="btn ghost" onClick={closeModal} disabled={creating}>Cancel</button>
          <button type="submit" className="btn primary" disabled={creating}>{creating ? 'Creating…' : 'Create Activity'}</button>
        </footer>
      </form>
    </div>
  );
};

export default CreateActivityModal;
