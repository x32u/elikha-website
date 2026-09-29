import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { MODEL_SORTS, MODEL_SIZE_FILTERS, formatModelSize, selectLibraryModels } from '../../utils/modelLibraryView';
import './styles/AdminModels.css';
import AdminShell from './components/AdminShell';
import Navbar from '../../components/Navbar';
import { fetchAdminTeachers } from '../../services/adminApi';
import {
  AR_MODEL_LIBRARY_UPDATED_EVENT,
  getArModelLibrary,
} from '../../utils/activityArConfig';
import {
  deleteR2Model,
  fetchR2StorageUsage,
  importR2ModelFromUrl,
  isR2ModelStorageConfigured,
  refreshR2ModelLibrary,
  searchFreeModelCatalog,
  updateR2Model,
  uploadR2Model,
} from '../../services/r2ModelApi';

const SUPPORTED_EXTENSIONS = ['obj', '3ds', 'glb', 'blend'];

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

const formatStorage = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1000) return `${value} B`;
  if (value < 1000 ** 2) return `${(value / 1000).toFixed(1)} KB`;
  if (value < 1000 ** 3) return `${(value / (1000 ** 2)).toFixed(1)} MB`;
  return `${(value / (1000 ** 3)).toFixed(2)} GB`;
};

const ModelPageShell = ({ role, onNavigate, homePageKey, isSuperAdmin, children }) => {
  if (role === 'Teacher') {
    return (
      <div className="teacher-models-page">
        <Navbar />
        <main className="teacher-models-main page-models">{children}</main>
      </div>
    );
  }

  return (
    <AdminShell
      active="models"
      onNavigate={onNavigate}
      className={`page-models ${isSuperAdmin ? 'page-superadmin page-superadmin-models' : 'page-admin page-admin-models'}`}
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      auditPageKey="audit"
    >
      {children}
    </AdminShell>
  );
};

function AdminModels({ onNavigate, role }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const sort = Object.keys(MODEL_SORTS).includes(searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const type = SUPPORTED_EXTENSIONS.includes(searchParams.get('type')) ? searchParams.get('type') : 'all';
  const size = Object.keys(MODEL_SIZE_FILTERS).includes(searchParams.get('size')) ? searchParams.get('size') : 'all';
  const setFilter = (key, value) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (!value || value === 'all' || (key === 'sort' && value === 'newest')) next.delete(key);
    else next.set(key, value);
    return next;
  }, { replace: true });
  const resetFilters = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    ['q', 'sort', 'type', 'size'].forEach((key) => next.delete(key));
    return next;
  }, { replace: true });
  const [models, setModels] = React.useState(() => getArModelLibrary());
  const [teachers, setTeachers] = React.useState([]);
  const [teacherError, setTeacherError] = React.useState('');
  const [teachersLoading, setTeachersLoading] = React.useState(role !== 'Teacher');
  const selectedOwner = searchParams.get('owner') || '';
  React.useEffect(() => {
    if (role === 'Teacher') return undefined;
    let active = true;
    fetchAdminTeachers().then((result) => {
      if (!active) return;
      setTeachersLoading(false);
      if (result.success) setTeachers(result.data);
      else setTeacherError(result.error || 'Unable to load teacher names. Refresh to retry.');
    }).catch(() => {
      if (active) { setTeachersLoading(false); setTeacherError('Unable to load teacher names. Refresh to retry.'); }
    });
    return () => { active = false; };
  }, [role]);
  const libraries = React.useMemo(() => {
    const owners = new Map(teachers.map((teacher) => [teacher.id, { ...teacher, count: 0 }]));
    models.forEach((model) => {
      const id = model.ownerId || 'unassigned';
      if (!owners.has(id)) owners.set(id, { id, name: id === 'unassigned' ? 'Unassigned library' : 'Other account library', email: id === 'unassigned' ? '' : id, count: 0 });
      owners.get(id).count += 1;
    });
    return [...owners.values()];
  }, [teachers, models]);
  const libraryModels = React.useMemo(() => role === 'Teacher' ? models : models.filter((model) => (model.ownerId || 'unassigned') === selectedOwner), [models, role, selectedOwner]);

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [removing, setRemoving] = React.useState(null);
  const [draft, setDraft] = React.useState({ name: '', desc: '', file: null });
  const [error, setError] = React.useState('');
  const [libraryError, setLibraryError] = React.useState('');
  const [storage, setStorage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(null);
  const [apiQuery, setApiQuery] = React.useState('');
  const [apiResults, setApiResults] = React.useState([]);
  const [apiLoading, setApiLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState('');
  const [importingId, setImportingId] = React.useState('');

  const refreshModels = React.useCallback(async () => {
    try {
      const nextModels = await refreshR2ModelLibrary();
      setModels(nextModels);
      setStorage(await fetchR2StorageUsage());
      setLibraryError('');
    } catch (refreshError) {
      setModels(getArModelLibrary());
      setLibraryError(
        refreshError instanceof Error ? refreshError.message : 'Unable to reach Cloudflare R2 storage.'
      );
    }
  }, []);

  React.useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  React.useEffect(() => {
    const onModelsUpdated = () => setModels(getArModelLibrary());
    window.addEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, onModelsUpdated);
    return () => window.removeEventListener(AR_MODEL_LIBRARY_UPDATED_EVENT, onModelsUpdated);
  }, []);

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
      if (event.key === 'Escape' && !busy) closeModals();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeModals, busy]);

  const filtered = React.useMemo(() => selectLibraryModels(libraryModels, { query, type, size, sort }), [libraryModels, query, type, size, sort]);

  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'Please select a model file.' };

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return { valid: false, error: 'Only .obj, .3ds, .glb, and .blend files are supported right now.' };
    }

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      return { valid: false, error: 'File is too large. Maximum supported size is 50 MB.' };
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
      const { results } = await searchFreeModelCatalog(search, { page: 1 });
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
      await importR2ModelFromUrl({
        sourceUrl: entry.downloadUrl,
        label: entry.name,
        description: entry.description || `${entry.source} • ${entry.license}`,
        fileName: `${entry.id}.glb`,
        source: entry.source,
        license: entry.license,
        attribution: entry.attribution,
      });
      await refreshModels();
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

    setUploadProgress(null);
    setBusy(true);
    setError('');

    try {
      await uploadR2Model({
        label,
        description: draft.desc,
        file: draft.file,
        onProgress: setUploadProgress,
      });

      closeModals();
      await refreshModels();
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

    setUploadProgress(null);
    setBusy(true);
    setError('');

    try {
      let replacementFile = null;

      if (draft.file) {
        const validation = validateFile(draft.file);
        if (!validation.valid) {
          setError(validation.error);
          setBusy(false);
          return;
        }

        replacementFile = draft.file;
      }

      await updateR2Model(editing.id, {
        label,
        description: draft.desc,
        file: replacementFile,
        onProgress: setUploadProgress,
      });

      closeModals();
      await refreshModels();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update model.');
      setBusy(false);
    }
  };

  const removeModel = (model) => {
    if (!model.isCustom || model.storageProvider !== 'r2') return;
    setRemoving(model);
    setError('');
    setIsRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setUploadProgress(null);
    setBusy(true);
    setError('');
    try {
      await deleteR2Model(removing.id);
      closeModals();
      await refreshModels();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove model.');
      setBusy(false);
    }
  };

  return (
    <ModelPageShell
      role={role}
      onNavigate={onNavigate}
      homePageKey={homePageKey}
      isSuperAdmin={isSuperAdmin}
    >
      <header className="m3d-header">
        <h1 className="m3d-title">3D Models</h1>
        <button className="m3d-add" type="button" onClick={openAdd} disabled={!isR2ModelStorageConfigured}>
          Add New 3D Model
        </button>
      </header>

      <section className="m3d-storage-summary" aria-label="Cloudflare R2 model storage">
        <div>
          <strong>{role === 'Teacher' ? 'Your model storage' : 'Total storage used'}</strong>
          <span aria-live="polite">
            {storage
              ? storage.capacityBytes
                ? `${formatStorage(storage.usedBytes)} / 15 GB used`
                : `${formatStorage(storage.usedBytes)} in Cloudflare R2`
              : 'Checking storage usage…'}
          </span>
          {storage?.capacityBytes ? <progress aria-label="Teacher model storage used" max={storage.capacityBytes} value={storage.usedBytes} /> : null}
          <small>{role === 'Teacher'
            ? 'Private to you and students in your classes. Files retained for saved artwork count toward storage.'
            : 'Actual stored files, including images and retained artwork models. Shared files count once.'}</small>
        </div>
        <span className={`m3d-cloud-status ${libraryError ? 'error' : ''}`}>
          {libraryError ? 'Unavailable' : 'Connected'}
        </span>
      </section>
      {libraryError ? <div className="m3d-page-note error">{libraryError}</div> : null}

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
            name="modelSearch"
            aria-label="Search your model library"
            autoComplete="off"
            placeholder="Search 3D models…"
            value={query}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </div>
      </section>

      <section className="m3d-sourcewrap" aria-label="Find free 3D models">
        <div className="m3d-source-head">
          <h2 className="m3d-source-title">Find Free Models (Poly Pizza)</h2>
          <p className="m3d-source-sub">Search and import free CC-BY / CC0 3D models directly to your library. Attribution is saved and shown with each model.</p>
        </div>
        <div className="m3d-source-search">
          <input
            className="m3d-input"
            type="text"
            name="externalModelSearch"
            autoComplete="off"
            placeholder="Try mask, bottle, fruit, or animal…"
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
            {apiLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {apiError ? <div className="m3d-danger-note">{apiError}</div> : null}
        {apiResults.length > 0 ? (
          <div className="m3d-source-grid">
            {apiResults.map((entry) => (
              <article className="m3d-source-card" key={entry.id}>
                <div className="m3d-source-thumb">
                  {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt={entry.name} loading="lazy" width="86" height="64" /> : <span>No preview</span>}
                </div>
                <div className="m3d-source-body">
                  <div className="m3d-source-name">{entry.name}</div>
                  <div className="m3d-source-meta">
                    {[entry.category || 'Model', entry.creator, entry.license].filter(Boolean).join(' • ')}
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

      {role !== 'Teacher' && <section className="m3d-owner-directory" aria-label="Teacher model libraries">
        <h2>Model libraries</h2>
        <p>Select a teacher to browse their models. Identical models in different libraries remain separate entries.</p>
        {teachersLoading && <p role="status">Loading teacher names…</p>}
        {teacherError && <p role="alert">{teacherError}</p>}
        <div className="m3d-owner-list">
          {libraries.map((owner) => <button type="button" key={owner.id} aria-pressed={selectedOwner === owner.id} onClick={() => setFilter('owner', owner.id)}>
            <span className="m3d-owner-initial" aria-hidden="true">{owner.name.charAt(0).toUpperCase()}</span>
            <span className="m3d-owner-name"><strong>{owner.name}</strong><small>{owner.email}</small></span>
            <span>{owner.count} models</span>
          </button>)}
        </div>
        {selectedOwner && <h3>{libraries.find((owner) => owner.id === selectedOwner)?.name || 'Selected library'}</h3>}
      </section>}
      {(role === 'Teacher' || selectedOwner) && <>
      <section className="m3d-library-controls" aria-label="Model library filters">
        <label>Sort by
          <select name="modelSort" value={sort} onChange={(event) => setFilter('sort', event.target.value)}>
            {Object.entries(MODEL_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>File type
          <select name="modelType" value={type} onChange={(event) => setFilter('type', event.target.value)}>
            <option value="all">All file types</option>
            {SUPPORTED_EXTENSIONS.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
          </select>
        </label>
        <label>File size
          <select name="modelSize" value={size} onChange={(event) => setFilter('size', event.target.value)}>
            {Object.entries(MODEL_SIZE_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="m3d-library-count" role="status">{filtered.length} of {libraryModels.length} models</div>
        {(query || type !== 'all' || size !== 'all' || sort !== 'newest') && <button type="button" className="m3d-btn" onClick={resetFilters}>Reset filters</button>}
      </section>
      <section className="m3d-tablewrap" aria-label="3D models table" tabIndex={0}>
        <table className="m3d-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>File</th>
              <th scope="col" className="m3d-size">Size</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="m3d-empty" colSpan={5}>
                  {libraryModels.length ? 'No models match. Try another search or reset the filters.' : 'This library has no models yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((model) => {
                const canManage = model.isCustom && model.storageProvider === 'r2';
                return (
                <tr key={model.id}>
                  <td>
                    {model.label}
                    {!model.isCustom ? <div className="m3d-muted">Built-in</div> : null}
                    {model.storageProvider === 'browser' ? <div className="m3d-muted">This device only (legacy)</div> : null}
                    {model.fileType === 'blend' ? <div className="m3d-muted">Source file — convert to .glb for AR</div> : null}
                    {model.attribution ? <div className="m3d-muted m3d-attribution">{model.attribution}</div> : null}
                  </td>
                  <td className="m3d-muted">{model.description || '—'}</td>
                  <td className="m3d-muted">{inferFileName(model)}</td>
                  <td className="m3d-size">{formatModelSize(model)}</td>
                  <td className="m3d-actions">
                    <button
                      className="m3d-action"
                      type="button"
                      onClick={() => openEdit(model)}
                      disabled={!canManage}
                      title={!canManage ? 'Only uploaded R2 models can be edited' : 'Edit model'}
                    >
                      Edit
                    </button>
                    <button
                      className="m3d-action danger"
                      type="button"
                      onClick={() => removeModel(model)}
                      disabled={!canManage}
                      title={!canManage ? 'Only uploaded R2 models can be removed' : 'Remove model'}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      </>}

      {isAddOpen && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={() => { if (!busy) closeModals(); }}>
          <div className="m3d-modal" role="dialog" aria-modal="true" aria-label="Add new 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Add New 3D Model</div>
              <button className="m3d-modal-x" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note" role="alert">{error}</div>}
              {busy && <div role="status" aria-live="polite" style={{ padding: '12px 0' }}>
                <p>{uploadProgress === 100 ? 'Processing model and refreshing library…' : uploadProgress === null ? (draft.file ? 'Preparing upload…' : 'Saving changes…') : `Uploading… ${uploadProgress}%`}</p>
                <progress aria-label="Model upload progress" max="100" value={uploadProgress === null || uploadProgress === 100 ? undefined : uploadProgress} style={{ width: '100%' }} />
                <p>Please keep this window open until the model is saved.</p>
              </div>}

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
                <span>Upload Model File (.obj, .3ds, .glb, or .blend)</span>
                <input
                  className="m3d-file-input"
                  disabled={busy}
                  type="file"
                  accept=".obj,.3ds,.glb,.blend"
                  onChange={(event) => setDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                />
                <div className={`m3d-file-meta ${draft.file ? '' : 'muted'}`}>
                  {draft.file ? draft.file.name : 'No file selected'}
                </div>
                <div className="m3d-file-meta muted">Max file size: 50 MB</div>
                <div className="m3d-file-meta muted">Blender files are stored as source files and must be converted to .glb before use in AR.</div>
              </label>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }}>
                Cancel
              </button>
              <button className="m3d-btn primary" type="button" onClick={saveAdd} disabled={busy}>
                {busy ? 'Saving…' : 'Add Model'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditOpen && editing && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={() => { if (!busy) closeModals(); }}>
          <div className="m3d-modal" role="dialog" aria-modal="true" aria-label="Edit 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Edit 3D Model</div>
              <button className="m3d-modal-x" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note" role="alert">{error}</div>}
              {busy && <div role="status" aria-live="polite" style={{ padding: '12px 0' }}>
                <p>{uploadProgress === 100 ? 'Processing model and refreshing library…' : uploadProgress === null ? (draft.file ? 'Preparing upload…' : 'Saving changes…') : `Uploading… ${uploadProgress}%`}</p>
                <progress aria-label="Model upload progress" max="100" value={uploadProgress === null || uploadProgress === 100 ? undefined : uploadProgress} style={{ width: '100%' }} />
                <p>Please keep this window open until the model is saved.</p>
              </div>}

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
                  disabled={busy}
                  type="file"
                  accept=".obj,.3ds,.glb,.blend"
                  onChange={(event) => setDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                />
                <div className="m3d-file-meta muted">Current: {inferFileName(editing)}</div>
                <div className={`m3d-file-meta ${draft.file ? '' : 'muted'}`}>
                  {draft.file ? `New: ${draft.file.name}` : 'No replacement selected'}
                </div>
                <div className="m3d-file-meta muted">Max file size: 50 MB</div>
              </label>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }}>
                Cancel
              </button>
              <button className="m3d-btn primary" type="button" onClick={saveEdit} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRemoveOpen && removing && (
        <div className="m3d-modal-backdrop" role="presentation" onClick={() => { if (!busy) closeModals(); }}>
          <div className="m3d-modal m3d-modal-sm" role="dialog" aria-modal="true" aria-label="Remove 3D model" onClick={(event) => event.stopPropagation()}>
            <div className="m3d-modal-head">
              <div className="m3d-modal-title">Remove 3D Model</div>
              <button className="m3d-modal-x" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }} aria-label="Close">
                x
              </button>
            </div>

            <div className="m3d-modal-body">
              {error && <div className="m3d-danger-note" role="alert">{error}</div>}
              <div className="m3d-danger-note">
                <div className="m3d-danger-title">This action can&apos;t be undone.</div>
                <div className="m3d-danger-sub">
                  You&apos;re about to remove <strong>{removing.label}</strong>.
                </div>
              </div>
            </div>

            <div className="m3d-modal-actions">
              <button className="m3d-btn ghost" type="button" disabled={busy} onClick={() => { if (!busy) closeModals(); }}>
                Cancel
              </button>
              <button className="m3d-btn danger" type="button" onClick={confirmRemove} disabled={busy}>
                {busy ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModelPageShell>
  );
}

export default AdminModels;
