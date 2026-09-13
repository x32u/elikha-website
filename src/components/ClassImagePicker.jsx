import React, { useEffect, useState } from 'react';
import { CLASS_IMAGE_ACCEPT_ATTR, validateClassImageFile } from '../services/classImageApi';
import './ClassImagePicker.css';

const ClassImagePicker = ({ imageUrl = '', file = null, onFileChange, onRemove, error = '' }) => {
  const [localPreview, setLocalPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setLocalPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const previewUrl = localPreview || imageUrl;

  return (
    <div className="class-image-picker">
      <div className={`class-image-picker__preview ${previewUrl ? 'has-image' : ''}`}>
        {previewUrl ? (
          <img src={previewUrl} alt="Class artwork preview" width="112" height="112" />
        ) : (
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Zm1.5 10.9 3.28-3.28a1.75 1.75 0 0 1 2.47 0l1.14 1.14 1.86-1.86a1.75 1.75 0 0 1 2.47 0l1.78 1.78V5.75a.25.25 0 0 0-.25-.25H5.75a.25.25 0 0 0-.25.25v10.9Zm13 0-2.84-2.84a.25.25 0 0 0-.36 0l-2.38 2.38a.75.75 0 0 1-1.06 0l-1.67-1.67a.25.25 0 0 0-.35 0L5.5 18.86a.25.25 0 0 0 .25.14h12.5a.25.25 0 0 0 .25-.25v-2.1ZM8.75 10.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
            </svg>
          </span>
        )}
      </div>
      <div className="class-image-picker__content">
        <strong>Class Image</strong>
        <p>Add a simple photo or icon learners can recognize quickly.</p>
        <div className="class-image-picker__actions">
          <label className="class-image-picker__choose">
            {previewUrl ? 'Replace Image' : 'Choose Image'}
            <input
              type="file"
              accept={CLASS_IMAGE_ACCEPT_ATTR}
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] || null;
                if (selectedFile) onFileChange(selectedFile, validateClassImageFile(selectedFile));
                event.target.value = '';
              }}
            />
          </label>
          {previewUrl && (
            <button type="button" className="class-image-picker__remove" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
        <small>PNG, JPG, or WebP up to 20 MB. The image is cropped to a square.</small>
        {error && <span className="class-image-picker__error" role="alert">{error}</span>}
      </div>
    </div>
  );
};

export default ClassImagePicker;
