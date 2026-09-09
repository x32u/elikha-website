import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_VISIBLE_MODELS = 80;

const searchableModelText = (model) => [
  model.label,
  model.id,
  model.description,
  model.fileName,
  model.fileType,
  model.attribution,
].filter(Boolean).join(' ').toLocaleLowerCase();

const SandboxModelPicker = ({ models = [], value = '', onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftModelId, setDraftModelId] = useState(value);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const selectedModel = models.find((model) => model.id === value) || models[0];

  const matchingModels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return models;
    return models.filter((model) => searchableModelText(model).includes(normalizedQuery));
  }, [models, query]);
  const visibleModels = matchingModels.slice(0, MAX_VISIBLE_MODELS);

  const closeLibrary = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openLibrary = () => {
    setDraftModelId(selectedModel?.id || '');
    setQuery('');
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLibrary();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeLibrary, isOpen]);

  const applySelection = () => {
    if (!draftModelId) return;
    onChange?.(draftModelId);
    closeLibrary();
  };

  return (
    <div className="sandbox-model-picker">
      <span className="sandbox-model-picker__label">Base Model</span>
      <button
        ref={triggerRef}
        type="button"
        className="sandbox-model-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={openLibrary}
      >
        <span className="sandbox-model-picker__icon" aria-hidden="true">◇</span>
        <span className="sandbox-model-picker__selection">
          <strong>{selectedModel?.label || 'No Model Available'}</strong>
          <small>{selectedModel ? `${String(selectedModel.fileType || '3D').toUpperCase()} model` : 'Add a model to the library first'}</small>
        </span>
        <span className="sandbox-model-picker__action">Browse Models</span>
      </button>
      <small className="sandbox-model-picker__help">Search the model library and choose 1 object for this practice session.</small>

      {isOpen && createPortal(
        <div
          className="sandbox-model-modal__overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLibrary();
          }}
        >
          <section
            ref={dialogRef}
            className="sandbox-model-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sandbox-model-modal-title"
            aria-describedby="sandbox-model-modal-description"
            tabIndex={-1}
          >
            <header className="sandbox-model-modal__header">
              <div>
                <h2 id="sandbox-model-modal-title">Choose a 3D Model</h2>
                <p id="sandbox-model-modal-description">Pick the object you want to practice with.</p>
              </div>
              <button type="button" className="sandbox-model-modal__close" onClick={closeLibrary} aria-label="Close model library">×</button>
            </header>

            <div className="sandbox-model-modal__search">
              <label htmlFor="sandbox-model-search">Search Models</label>
              <input
                id="sandbox-model-search"
                name="sandbox-model-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try “cactus” or “tree”…"
              />
              <span aria-live="polite">{matchingModels.length} of {models.length} models</span>
            </div>

            <div className="sandbox-model-modal__grid">
              {visibleModels.map((model) => {
                const selected = draftModelId === model.id;
                return (
                  <label className={`sandbox-model-card ${selected ? 'is-selected' : ''}`} key={model.id}>
                    <input
                      type="radio"
                      name="sandbox-base-model"
                      value={model.id}
                      checked={selected}
                      onChange={() => setDraftModelId(model.id)}
                    />
                    <span className="sandbox-model-card__mark" aria-hidden="true">{selected ? '✓' : '◇'}</span>
                    <span className="sandbox-model-card__copy">
                      <strong title={model.label}>{model.label}</strong>
                      <small>{String(model.fileType || '3D').toUpperCase()} model</small>
                    </span>
                  </label>
                );
              })}
              {matchingModels.length === 0 && (
                <div className="sandbox-model-modal__empty">
                  <strong>No Matching Models</strong>
                  <span>Try a shorter or different search term.</span>
                </div>
              )}
            </div>

            <footer className="sandbox-model-modal__footer">
              <p aria-live="polite">
                {matchingModels.length > visibleModels.length
                  ? `Showing the first ${MAX_VISIBLE_MODELS} matches. Refine your search to see more.`
                  : draftModelId
                    ? `${models.find((model) => model.id === draftModelId)?.label || '1 model'} selected`
                    : 'Select 1 model.'}
              </p>
              <div>
                <button type="button" className="sandbox-model-modal__cancel" onClick={closeLibrary}>Cancel</button>
                <button type="button" className="sandbox-model-modal__apply" onClick={applySelection} disabled={!draftModelId}>
                  Use This Model
                </button>
              </div>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SandboxModelPicker;
