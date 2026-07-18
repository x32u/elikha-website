import React from 'react';
import './styles/AdminModels.css';
import AdminShell from './components/AdminShell';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  deleteCustomArModel,
  getArModelLibrary,
  saveCustomArModel,
  updateCustomArModel,
} from '../../utils/activityArConfig';
import { resolveFreeModelImport, searchFreeModelCatalog } from '../../services/modelSearchApi';

const SUPPORTED_EXTENSIONS = ['obj', '3ds', 'glb'];

const getFileExtension = (name = '') => {
  const value = String(name || '').trim().toLowerCase();
  const index = value.lastIndexOf('.');
  if (index < 0) return '';
  return value.slice(index + 1);
};

const inferFileName = (model) => {
  if (model?.fileName) return model.fileName;
  const clean = String(model?.modelUrl || '').split('?')[0].trim();
  if (!clean) return '—';
  if (clean.startsWith('data:')) return `model.${model?.fileType || 'obj'}`;
  if (clean.startsWith('idb://')) return model?.fileName || `model.${model?.fileType || 'obj'}`;
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] || clean;
};

function AdminModels({ onNavigate, role }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';

  const [query, setQuery] = React.useState('');
  const [models, setModels] = React.useState(() => getArModelLibrary());

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [removing, setRemoving] = React.useState(null);
  const [draft, setDraft] = React.useState({ name: '', desc: '', file: null });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [apiQuery, setApiQuery] = React.useState('');
  const [apiResults, setApiResults] = React.useState([]);
  const [apiLoading, setApiLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState('');
  const [importingId, setImportingId] = React.useState('');

  const refreshModels = React.useCallback(() => {
    setModels(getArModelLibrary());
  }, []);

  React.useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  React.useEffect(() => {
    const onModelsUpdated = () => refreshModels();
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, onModelsUpdated);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, onModelsUpdated);
  }, [refreshModels]);

  const closeModals = React.useCallback(() => {
    setIsAddOpen(false);
    setIsEditOpen(false);
    setIsRemoveOpen(false);
    setEditing(null);
    setRemoving(null);
    setDraft({ name: '', desc: '', file: null });
    setError('');
    setBusy(false);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeModals();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeModals]);

  const filtered = models.filter((model) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    return (
      String(model.label || '').toLowerCase().includes(q) ||
      String(model.description || '').toLowerCase().includes(q) ||
      String(inferFileName(model)).toLowerCase().includes(q)
    );
  });

  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'Please select a model file.' };

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return { valid: false, error: 'Only .obj, .3ds, and .glb files are supported right now.' };
    }

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      return { valid: false, error: 'File is too large. Maximum supported size is 50MB.' };
    }

    return { valid: true, extension };
  };

  const openAdd = () => {
    setDraft({ name: '', desc: '', file: null });
    setError('');
    setIsAddOpen(true);
  };

  const openEdit = (model) => {
    if (!model.isCustom) return;
    setEditing(model);
    setDraft({
      name: model.label || '',
      desc: model.description || '',
      file: null,
    });
    setError('');
    setIsEditOpen(true);
  };

  const runApiSearch = async () => {
    const search = apiQuery.trim();
    if (!search) {
      setApiError('Enter a keyword to search free models.');
      setApiResults([]);
      return;
    }

    setApiLoading(true);
    setApiError('');

    try {
      const results = await searchFreeModelCatalog(search, { limit: 12 });
      setApiResults(results);
      if (results.length === 0) {
        setApiError('No matching free models found.');
      }
    } catch (searchError) {
      setApiResults([]);
      setApiError(searchError instanceof Error ? searchError.message : 'Failed to search model catalog.');
    } finally {
      setApiLoading(false);
    }
  };

  const importFromCatalog = async (entry) => {
    if (!entry?.id) return;
    setImportingId(entry.id);
    setApiError('');

    try {
      const resolved = await resolveFreeModelImport(entry.id);
      const saveResult = await saveCustomArModel({
        id: `polyhaven-${entry.id}`,
        label: entry.name,
        description: entry.description || `${entry.source} • ${entry.license}`,
        modelUrl: resolved.modelUrl,
        fileType: resolved.fileType,
        fileName: resolved.fileName,
      });

      if (!saveResult.success) {
        setApiError(saveResult.error || 'Unable to import model.');
        return;
      }

      refreshModels();
    } catch (importError) {
      setApiError(importError instanceof Error ? importError.message : 'Unable to import model.');
    } finally {
      setImportingId('');
    }
  };

  const saveAdd = async () => {
    const label = draft.name.trim();
    if (!label) {
      setError('Model name is required.');
      return;
    }

    const validation = validateFile(draft.file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = saveCustomArModel({
        label,
        description: draft.desc,
        file: draft.file,
        fileType: validation.extension,
        fileName: draft.file.name,
      });
      const saved = await result;

      if (!saved.success) {
        setError(saved.error || 'Unable to add model.');
        setBusy(false);
        return;
      }

      closeModals();
      refreshModels();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add model.');
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;

    const label = draft.name.trim();
    if (!label) {
      setError('Model name is required.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      let modelUrl = editing.modelUrl;
      let fileType = editing.fileType;
      let fileName = editing.fileName || inferFileName(editing);
      let replacementFile = null;

      if (draft.file) {
        const validation = validateFile(draft.file);
        if (!validation.valid) {
          setError(validation.error);
          setBusy(false);
          return;
        }

        replacementFile = draft.file;
        fileType = validation.extension;
        fileName = draft.file.name;
      }

      const result = updateCustomArModel(editing.id, {
        label,
        description: draft.desc,
        modelUrl,
        fileType,
        fileName,
        file: replacementFile,
      });
      const saved = await result;

      if (!saved.success) {
        setError(saved.error || 'Unable to update model.');
        setBusy(false);
        return;
      }

      closeModals();
      refreshModels();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update model.');
      setBusy(false);
    }
  };

  const removeModel = (model) => {
    if (!model.isCustom) return;
    setRemoving(model);
    setError('');
    setIsRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (!removing) return;

    const result = await deleteCustomArModel(removing.id);
    if (!result.success) {
      setError(result.error || 'Unable to remove model.');
      return;
    }

    closeModals();
    refreshModels();
  };

  return (
    <AdminShell
      active="models"
      onNavigate={onNavigate}
      className="page-models"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      showPasswordResets={isSuperAdmin}
      auditPageKey="audit"
    >
      <header className="m3d-header">
        <h1 className="m3d-title">3D Models</h1>
        <button className="m3d-add" type="button" onClick={openAdd}>
          Add New 3D Model
        </button>
      </header>

      <section className="m3d-searchwrap" aria-label="Search 3D models">
        <div className="m3d-search">
          <div className="m3d-search-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <input
            className="m3d-search-input"
            type="text"
            placeholder="Search 3D Models"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      <section className="m3d-sourcewrap" aria-label="Find free 3D models">
        <div className="m3d-source-head">
          <h2 className="m3d-source-title">Find Free Models (Poly Haven)</h2>
          <p className="m3d-source-sub">Search and import CC0 models directly to your library.</p>
        </div>
        <div className="m3d-source-search">
          <input
            className="m3d-input"
            type="text"
            placeholder="Try: mask, bottle, fruit, animal..."
            value={apiQuery}
            onChange={(event) => setApiQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runApiSearch();
              }
            }}
          />
          <button className="m3d-btn primary" type="button" onClick={runApiSearch} disabled={apiLoading}>
            {apiLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {apiError ? <div className="m3d-danger-note">{apiError}</div> : null}
        {apiResults.length > 0 ? (
          <div className="m3d-source-grid">
            {apiResults.map((entry) => (
              <article className="m3d-source-card" key={entry.id}>
                <div className="m3d-source-thumb">
                  {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt={entry.name} loading="lazy" /> : <span>No preview</span>}
                </div>
                <div className="m3d-source-body">
                  <div className="m3d-source-name">{entry.name}</div>
                  <div className="m3d-source-meta">
                    {entry.categories.slice(0, 2).join(' • ') || 'Model'} • {entry.license}
                  </div>
                  <div className="m3d-source-desc">{entry.description || 'No description provided.'}</div>
                </div>
                <button
                  className="m3d-btn primary"
                  type="button"
                  onClick={() => importFromCatalog(entry)}
                  disabled={importingId === entry.id}
                >
                  {importingId === entry.id ? 'Importing...' : 'Import'}
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="m3d-tablewrap" aria-label="3D models table">
        <table className="m3d-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>File</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="m3d-empty" colSpan={4}>
                  No 3D models found.
                </td>
              </tr>
            ) : (
              filtered.map((model) => (
                <tr key={model.id}>
                  <td>
                    {model.label}
                    {!model.isCustom ? <div className="m3d-muted">Built-in</div> : null}
                  </td>
                  <td className="m3d-muted">{model.description || '—'}</td>
                  <td className="m3d-muted">{inferFileName(model)}</td>
                  <td className="m3d-actions">
                    <button
                      className="m3d-action"
                      type="button"
                      onClick={() => openEdit(model)}
                      disabled={!model.isCustom}
                      title={!model.isCustom ? 'Built-in models cannot be edited' : 'Edit model'}
                    >
                      Edit
                    </button>
                    <button
                      className="m3d-action danger"
                      type="button"
                      onClick={() => removeModel(model)}
                      disabled={!model.isCustom}
                      title={!model.isCustom ? 'Built-in models cannot be removed' : 'Remove model'}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {isAddOpen && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={closeModals}>
          <div className="m3d-modal" role="dialog" aria-modal="true" aria-label="Add new 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Add New 3D Model</div>
              <button className="m3d-modal-x" type="button" onClick={closeModals} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note">{error}</div>}

              <label className="m3d-field">
                <span>Name</span>
                <input
                  className="m3d-input"
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Model name"
                />
              </label>

              <label className="m3d-field">
                <span>Description</span>
                <textarea
                  className="m3d-textarea"
                  value={draft.desc}
                  onChange={(event) => setDraft((prev) => ({ ...prev, desc: event.target.value }))}
                  placeholder="Detailed description"
                />
              </label>

              <label className="m3d-file">
                <span>Upload Model File (.obj, .3ds, or .glb)</span>
                <input
                  className="m3d-file-input"
                  type="file"
                  accept=".obj,.3ds,.glb"
                  onChange={(event) => setDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                />
                <div className={`m3d-file-meta ${draft.file ? '' : 'muted'}`}>
                  {draft.file ? draft.file.name : 'No file selected'}
                </div>
                <div className="m3d-file-meta muted">Max file size: 50MB</div>
              </label>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" onClick={closeModals}>
                Cancel
              </button>
              <button className="m3d-btn primary" type="button" onClick={saveAdd} disabled={busy}>
                {busy ? 'Saving...' : 'Add Model'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditOpen && editing && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={closeModals}>
          <div className="m3d-modal" role="dialog" aria-modal="true" aria-label="Edit 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Edit 3D Model</div>
              <button className="m3d-modal-x" type="button" onClick={closeModals} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note">{error}</div>}

              <label className="m3d-field">
                <span>Name</span>
                <input
                  className="m3d-input"
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>

              <label className="m3d-field">
                <span>Description</span>
                <textarea
                  className="m3d-textarea"
                  value={draft.desc}
                  onChange={(event) => setDraft((prev) => ({ ...prev, desc: event.target.value }))}
                />
              </label>

              <label className="m3d-file">
                <span>Replace File (optional)</span>
                <input
                  className="m3d-file-input"
                  type="file"
                  accept=".obj,.3ds,.glb"
                  onChange={(event) => setDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                />
                <div className="m3d-file-meta muted">Current: {inferFileName(editing)}</div>
                <div className={`m3d-file-meta ${draft.file ? '' : 'muted'}`}>
                  {draft.file ? `New: ${draft.file.name}` : 'No replacement selected'}
                </div>
                <div className="m3d-file-meta muted">Max file size: 50MB</div>
              </label>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" onClick={closeModals}>
                Cancel
              </button>
              <button className="m3d-btn primary" type="button" onClick={saveEdit} disabled={busy}>
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRemoveOpen && removing && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={closeModals}>
          <div className="m3d-modal m3d-modal-sm" role="dialog" aria-modal="true" aria-label="Remove 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Remove 3D Model</div>
              <button className="m3d-modal-x" type="button" onClick={closeModals} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note">{error}</div>}
              <div className="m3d-danger-note">
                <div className="m3d-danger-title">This action can&apos;t be undone.</div>
                <div className="m3d-danger-sub">
                  You&apos;re about to remove <strong>{removing.label}</strong>.
                </div>
              </div>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" onClick={closeModals}>
                Cancel
              </button>
              <button className="m3d-btn danger" type="button" onClick={confirmRemove}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminModels;
