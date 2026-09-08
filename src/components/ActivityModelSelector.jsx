import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ActivityModelSelector.css';

const countModels = (modelIds = []) => {
  const counts = new Map();
  modelIds.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  return counts;
};

const clampQuantity = (value, maxQuantity) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.max(0, Math.min(maxQuantity, Math.floor(count)));
};

const ActivityModelSelector = ({
  modelOptions = [],
  modelIds = [],
  onChange,
  maxQuantity = 12,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftSelection, setDraftSelection] = useState(() => new Set());
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const modelCounts = useMemo(() => countModels(modelIds), [modelIds]);
  const selectedModels = useMemo(
    () => modelOptions.filter((model) => (modelCounts.get(model.id) || 0) > 0),
    [modelCounts, modelOptions]
  );
  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return modelOptions;
    return modelOptions.filter((model) => (
      `${model.label || ''} ${model.id || ''}`.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [modelOptions, query]);

  const closeLibrary = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openLibrary = () => {
    setDraftSelection(new Set(selectedModels.map((model) => model.id)));
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
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === dialogRef.current) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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

  const updateQuantity = (modelId, nextQuantity) => {
    const counts = countModels(modelIds);
    const quantity = clampQuantity(nextQuantity, maxQuantity);
    if (quantity === 0 && selectedModels.length > 1) counts.delete(modelId);
    else counts.set(modelId, Math.max(1, quantity));
    onChange?.(modelOptions.flatMap((model) => (
      Array.from({ length: counts.get(model.id) || 0 }, () => model.id)
    )));
  };

  const toggleDraftModel = (modelId) => {
    setDraftSelection((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const applySelection = () => {
    if (draftSelection.size === 0) return;
    const nextIds = modelOptions.flatMap((model) => {
      if (!draftSelection.has(model.id)) return [];
      const quantity = modelCounts.get(model.id) || 1;
      return Array.from({ length: quantity }, () => model.id);
    });
    onChange?.(nextIds);
    closeLibrary();
  };

  const totalQuantity = modelIds.length;

  return (
    <div className="activity-model-selector">
      <div className="activity-model-selector__summary">
        <div>
          <strong>Selected Models</strong>
          <span>{selectedModels.length} types, {totalQuantity} total</span>
        </div>
        <button
          ref={triggerRef}
          className="activity-model-selector__open"
          type="button"
          onClick={openLibrary}
        >
          Add 3D Models
        </button>
      </div>

      <div className="activity-model-selector__selected" aria-live="polite">
        {selectedModels.map((model) => {
          const quantity = modelCounts.get(model.id) || 1;
          const isOnlyModel = selectedModels.length === 1;
          return (
            <div className="activity-model-selector__row" key={model.id}>
              <span className="activity-model-selector__name" title={model.label}>{model.label}</span>
              <div className="activity-model-selector__quantity">
                <button
                  type="button"
                  onClick={() => updateQuantity(model.id, quantity - 1)}
                  disabled={quantity <= 1 && isOnlyModel}
                  aria-label={`Decrease ${model.label} quantity`}
                >
                  −
                </button>
                <span aria-label={`${model.label} quantity ${quantity}`}>{quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(model.id, quantity + 1)}
                  disabled={quantity >= maxQuantity}
                  aria-label={`Increase ${model.label} quantity`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <small className="form-help">Choose models in the library, then set how many students need.</small>

      {isOpen && createPortal(
        <div
          className="model-library-modal__overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLibrary();
          }}
        >
          <section
            ref={dialogRef}
            className="model-library-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-library-title"
            tabIndex={-1}
          >
            <header className="model-library-modal__header">
              <div>
                <h2 id="model-library-title">Choose Base 3D Models</h2>
                <p>Select every model students can use in this activity.</p>
              </div>
              <button type="button" className="model-library-modal__close" onClick={closeLibrary} aria-label="Close model library">×</button>
            </header>

            <div className="model-library-modal__search">
              <label htmlFor="activity-model-search">Search Models</label>
              <input
                id="activity-model-search"
                name="activity-model-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try “elephant” or “tree”…"
              />
              <span aria-live="polite">{visibleModels.length} of {modelOptions.length} models</span>
            </div>

            <div className="model-library-modal__grid">
              {visibleModels.map((model) => {
                const selected = draftSelection.has(model.id);
                return (
                  <label className={`model-library-card ${selected ? 'is-selected' : ''}`} key={model.id}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleDraftModel(model.id)}
                    />
                    <span className="model-library-card__mark" aria-hidden="true">{selected ? '✓' : '+'}</span>
                    <span className="model-library-card__name" title={model.label}>{model.label}</span>
                    <span className="model-library-card__type">3D model</span>
                  </label>
                );
              })}
              {visibleModels.length === 0 && (
                <div className="model-library-modal__empty">
                  <strong>No matching models</strong>
                  <span>Try a shorter or different search term.</span>
                </div>
              )}
            </div>

            <footer className="model-library-modal__footer">
              <p className={draftSelection.size === 0 ? 'is-warning' : ''} aria-live="polite">
                {draftSelection.size === 0
                  ? 'Select at least 1 model.'
                  : `${draftSelection.size} model ${draftSelection.size === 1 ? 'type' : 'types'} selected`}
              </p>
              <div>
                <button type="button" className="model-library-modal__cancel" onClick={closeLibrary}>Cancel</button>
                <button type="button" className="model-library-modal__apply" onClick={applySelection} disabled={draftSelection.size === 0}>
                  Save Model Selection
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

export default ActivityModelSelector;
