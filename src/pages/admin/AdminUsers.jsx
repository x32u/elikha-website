import React from 'react';
import './styles/AdminUsers.css';
import AdminShell from './components/AdminShell';
import {
  createParentStudentLink,
  createPlatformUser,
  deleteParentStudentLink,
  fetchAllUsers,
  fetchClassDirectory,
  fetchParentLinkDirectory,
  fetchParentStudentLinks,
  updatePlatformUser,
} from '../../services/adminApi';
import { formatClassOptionLabel } from '../../utils/classLabels';

const ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Super Admin' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const roleLabel = (value) => {
  const normalized = String(value || '').toLowerCase().trim();
  return ROLE_OPTIONS.find((option) => option.value === normalized)?.label || 'Unknown';
};

function AdminUsers({ onNavigate, role }) {
  const isSuperAdmin = role === 'SuperAdmin';
  const editableRoleOptions = isSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value !== 'superadmin');
  const homePageKey = isSuperAdmin ? 'sa-dashboard' : 'homepage';

  const [query, setQuery] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [openMenu, setOpenMenu] = React.useState(null);

  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [classOptions, setClassOptions] = React.useState([]);
  const [classesLoading, setClassesLoading] = React.useState(false);
  const [classesError, setClassesError] = React.useState('');

  const [editing, setEditing] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState(null);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showAddPassword, setShowAddPassword] = React.useState(false);
  const [addBusy, setAddBusy] = React.useState(false);
  const [addError, setAddError] = React.useState('');
  const [addDraft, setAddDraft] = React.useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    classId: '',
  });
  const [showParentLinks, setShowParentLinks] = React.useState(false);
  const [parentLinks, setParentLinks] = React.useState([]);
  const [parentLinkOptions, setParentLinkOptions] = React.useState({
    parents: [],
    students: [],
  });
  const [parentLinksLoading, setParentLinksLoading] = React.useState(false);
  const [parentLinkBusy, setParentLinkBusy] = React.useState(false);
  const [parentLinkError, setParentLinkError] = React.useState('');
  const [parentLinkDraft, setParentLinkDraft] = React.useState({
    parentId: '',
    studentId: '',
  });

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const result = await fetchAllUsers();
    if (!result.success) {
      setError(result.error || 'Failed to load users.');
      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers(result.data || []);
    setLoading(false);
  }, []);

  const loadClassOptions = React.useCallback(async () => {
    setClassesLoading(true);
    setClassesError('');

    const result = await fetchClassDirectory();
    if (!result.success) {
      setClassOptions([]);
      setClassesError(result.error || 'Failed to load classes.');
      setClassesLoading(false);
      return;
    }

    setClassOptions(result.data || []);
    setClassesLoading(false);
  }, []);

  const loadParentLinks = React.useCallback(async () => {
    setParentLinksLoading(true);
    setParentLinkError('');

    const [directoryResult, linksResult] = await Promise.all([
      fetchParentLinkDirectory(),
      fetchParentStudentLinks(),
    ]);

    if (!directoryResult.success) {
      setParentLinkOptions({ parents: [], students: [] });
      setParentLinkError(directoryResult.error || 'Failed to load parent/student options.');
    } else {
      setParentLinkOptions(directoryResult.data || { parents: [], students: [] });
    }

    if (!linksResult.success) {
      setParentLinks([]);
      setParentLinkError((prev) =>
        prev || linksResult.error || 'Failed to load parent links.'
      );
    } else {
      setParentLinks(linksResult.data || []);
    }

    setParentLinksLoading(false);
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  React.useEffect(() => {
    if (isSuperAdmin) {
      loadClassOptions();
    }
  }, [isSuperAdmin, loadClassOptions]);

  React.useEffect(() => {
    const onDocClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest?.('.um-filterwrap')) return;
      setOpenMenu(null);
    };

    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const filteredUsers = users.filter((user) => {
    const q = query.trim().toLowerCase();
    const userRoleLabel = roleLabel(user.role);

    const matchesQuery =
      q.length === 0 ||
      String(user.name || '').toLowerCase().includes(q) ||
      String(user.email || '').toLowerCase().includes(q);

    const matchesRole = roleFilter === 'All' || userRoleLabel === roleFilter;
    const matchesStatus = statusFilter === 'All' || user.status_label === statusFilter;

    return matchesQuery && matchesRole && matchesStatus;
  });

  const openEdit = (user) => {
    if (!isSuperAdmin && String(user?.role || '').toLowerCase() === 'superadmin') return;
    setEditing(user);
    setEditDraft({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      role: String(user.role || '').toLowerCase(),
      status: user.status_label || 'Active',
    });
    setSaveError('');
  };

  const closeEdit = () => {
    setEditing(null);
    setEditDraft(null);
    setSaveError('');
  };

  const openAdd = () => {
    setShowAddModal(true);
    setShowAddPassword(false);
    setAddError('');
    setNotice('');
    setAddDraft({
      name: '',
      email: '',
      password: '',
      role: 'student',
      classId: '',
    });
  };

  const closeAdd = () => {
    setShowAddModal(false);
    setShowAddPassword(false);
    setAddBusy(false);
    setAddError('');
  };

  const openParentLinkManager = () => {
    setShowParentLinks(true);
    setParentLinkError('');
    setParentLinkDraft({ parentId: '', studentId: '' });
    loadParentLinks();
  };

  const closeParentLinkManager = () => {
    setShowParentLinks(false);
    setParentLinkBusy(false);
    setParentLinkError('');
  };

  const saveEdit = async () => {
    if (!editDraft) return;

    const name = editDraft.name.trim();
    const email = editDraft.email.trim();

    if (!name || !email) {
      setSaveError('Name and email are required.');
      return;
    }

    setSaveBusy(true);
    setSaveError('');

    const result = await updatePlatformUser(editDraft.id, {
      name,
      email,
      role: editDraft.role,
    });

    setSaveBusy(false);

    if (!result.success) {
      setSaveError(result.error || 'Failed to save user changes.');
      return;
    }

    setUsers((prev) => prev.map((user) => (user.id === result.data.id ? result.data : user)));
    closeEdit();
  };

  const saveAdd = async () => {
    const name = addDraft.name.trim();
    const email = addDraft.email.trim().toLowerCase();
    const password = addDraft.password;
    const classId = addDraft.role === 'student' ? String(addDraft.classId || '').trim() : '';

    if (!name || !email || !password) {
      setAddError('Name, email, and password are required.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      setAddError('Email format is invalid. Use a valid email like name@example.com.');
      return;
    }

    setAddBusy(true);
    setAddError('');

    const result = await createPlatformUser({
      name,
      email,
      password,
      role: addDraft.role,
      classId,
    });

    setAddBusy(false);

    if (!result.success) {
      setAddError(result.error || 'Failed to add user.');
      return;
    }

    setUsers((prev) => [result.data, ...prev.filter((user) => user.id !== result.data.id)]);
    closeAdd();
    setNotice(
      [result.message || 'User account created successfully.', result.warning]
        .filter(Boolean)
        .join(' ')
    );
  };

  const saveParentLink = async () => {
    const parentId = parentLinkDraft.parentId;
    const studentId = parentLinkDraft.studentId;

    if (!parentId || !studentId) {
      setParentLinkError('Choose a parent and student first.');
      return;
    }

    const alreadyLinked = parentLinks.some(
      (link) => link.parent_id === parentId && link.student_id === studentId
    );

    if (alreadyLinked) {
      setParentLinkError('That parent is already linked to this student.');
      return;
    }

    setParentLinkBusy(true);
    setParentLinkError('');

    const result = await createParentStudentLink({ parentId, studentId });
    if (!result.success) {
      setParentLinkBusy(false);
      setParentLinkError(result.error || 'Failed to link parent to student.');
      return;
    }

    await loadParentLinks();
    setParentLinkDraft((prev) => ({ ...prev, studentId: '' }));
    setParentLinkBusy(false);
  };

  const removeParentLink = async (link) => {
    const parentName = link.parent?.name || 'this parent';
    const studentName = link.student?.name || 'this student';
    const confirmed = window.confirm(`Remove ${parentName}'s access to ${studentName}?`);
    if (!confirmed) return;

    setParentLinkBusy(true);
    setParentLinkError('');

    const result = await deleteParentStudentLink(link.id);
    setParentLinkBusy(false);

    if (!result.success) {
      setParentLinkError(result.error || 'Failed to remove parent link.');
      return;
    }

    setParentLinks((prev) => prev.filter((item) => item.id !== link.id));
  };

  return (
    <AdminShell
      active="users"
      onNavigate={onNavigate}
      className="page-users"
      homePageKey={homePageKey}
      showAudit={isSuperAdmin}
      auditPageKey="audit"
    >
      <header className="um-header">
        <div className="um-titlewrap">
          <h1 className="um-title">User Management</h1>
          <p className="um-subtitle">Manage platform accounts and role access.</p>
        </div>
        {isSuperAdmin && (
          <div className="um-header-actions">
            <button className="um-secondary-btn" type="button" onClick={openParentLinkManager}>
              Parent Links
            </button>
            <button className="um-add-btn" type="button" onClick={openAdd}>
              + Add User
            </button>
          </div>
        )}
      </header>

      {error && <div className="um-empty" style={{ marginBottom: '12px' }}>{error}</div>}
      {notice && (
        <div className="um-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      <section className="um-searchwrap" aria-label="Search users">
        <div className="um-search">
          <div className="um-search-ico" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M16.2 16.2 21 21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <input
            className="um-search-input"
            type="text"
            placeholder="Search users"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      <section className="um-filters" aria-label="Filters">
        <div className="um-filterwrap">
          <button
            className="um-filter"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'role'}
            onClick={() => setOpenMenu((menu) => (menu === 'role' ? null : 'role'))}
          >
            <span>Role</span>
            <span className="um-filter-value">{roleFilter}</span>
            <span className="um-filter-caret" aria-hidden="true">
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5 10 12.5 15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {openMenu === 'role' && (
            <div className="um-menu" role="menu" aria-label="Role filter">
              {['All', ...ROLE_OPTIONS.map((option) => option.label)].map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={roleFilter === option}
                  className={`um-menuitem ${roleFilter === option ? 'active' : ''}`}
                  onClick={() => {
                    setRoleFilter(option);
                    setOpenMenu(null);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="um-filterwrap">
          <button
            className="um-filter"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'status'}
            onClick={() => setOpenMenu((menu) => (menu === 'status' ? null : 'status'))}
          >
            <span>Status</span>
            <span className="um-filter-value">{statusFilter}</span>
            <span className="um-filter-caret" aria-hidden="true">
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5 10 12.5 15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {openMenu === 'status' && (
            <div className="um-menu" role="menu" aria-label="Status filter">
              {['All', 'Active'].map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={statusFilter === option}
                  className={`um-menuitem ${statusFilter === option ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter(option);
                    setOpenMenu(null);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="um-clear"
          type="button"
          onClick={() => {
            setQuery('');
            setRoleFilter('All');
            setStatusFilter('All');
          }}
        >
          Clear
        </button>
      </section>

      <section className="um-tablewrap" aria-label="User table">
        <table className="um-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Email</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="um-empty" colSpan={5}>
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td className="um-empty" colSpan={5}>
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || 'Unnamed User'}</td>
                  <td>{roleLabel(user.role)}</td>
                  <td className="um-muted">{user.email || '—'}</td>
                  <td>
                    <span className="um-status active">{user.status_label || 'Active'}</span>
                  </td>
                  <td>
                    <button
                      className="um-action"
                      type="button"
                      onClick={() => openEdit(user)}
                      disabled={!isSuperAdmin && String(user.role || '').toLowerCase() === 'superadmin'}
                      title={!isSuperAdmin && String(user.role || '').toLowerCase() === 'superadmin'
                        ? 'Only a super administrator can edit this account.'
                        : 'Edit user'}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {editing && editDraft && (
        <div className="um-modal-backdrop" role="presentation" onClick={closeEdit}>
          <div
            className="um-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit user"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="um-modal-head">
              <div className="um-modal-title">Edit User</div>
              <button className="um-modal-x" type="button" onClick={closeEdit} aria-label="Close">
                ×
              </button>
            </div>

            <div className="um-modal-body">
              {saveError && <div className="um-empty" style={{ marginBottom: '10px' }}>{saveError}</div>}

              <label className="um-field">
                <span>Name</span>
                <input
                  className="um-input"
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="um-field">
                <span>Email</span>
                <input
                  className="um-input"
                  type="email"
                  value={editDraft.email}
                  disabled
                  title="Sign-in email changes require a secure Auth administration flow."
                />
              </label>

              <div className="um-fieldrow">
                <label className="um-field">
                  <span>Role</span>
                  <select
                    className="um-input"
                    value={editDraft.role}
                    onChange={(event) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        role: event.target.value,
                      }))
                    }
                  >
                    {editableRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="um-field">
                  <span>Status</span>
                  <input className="um-input" value="Active" disabled />
                </label>
              </div>
            </div>

            <div className="um-modal-actions">
              <button className="um-btn ghost" type="button" onClick={closeEdit}>
                Cancel
              </button>
              <button className="um-btn primary" type="button" onClick={saveEdit} disabled={saveBusy}>
                {saveBusy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="um-modal-backdrop" role="presentation" onClick={closeAdd}>
          <div
            className="um-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add user"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="um-modal-head">
              <div className="um-modal-title">Add User</div>
              <button className="um-modal-x" type="button" onClick={closeAdd} aria-label="Close">
                ×
              </button>
            </div>

            <div className="um-modal-body">
              {addError && <div className="um-empty" style={{ marginBottom: '10px' }}>{addError}</div>}

              <label className="um-field">
                <span>Name</span>
                <input
                  className="um-input"
                  value={addDraft.name}
                  onChange={(event) =>
                    setAddDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="um-field">
                <span>Email</span>
                <input
                  className="um-input"
                  type="email"
                  value={addDraft.email}
                  onChange={(event) =>
                    setAddDraft((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="um-field">
                <label htmlFor="add-user-password">Temporary Password</label>
                <div className="um-password-field">
                  <input
                    className="um-input"
                    id="add-user-password"
                    type={showAddPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={addDraft.password}
                    onChange={(event) =>
                      setAddDraft((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                  />
                  <button
                    className="um-password-toggle"
                    type="button"
                    aria-label={showAddPassword ? 'Hide temporary password' : 'Show temporary password'}
                    aria-pressed={showAddPassword}
                    onClick={() => setShowAddPassword((visible) => !visible)}
                  >
                    {showAddPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <label className="um-field">
                <span>Role</span>
                <select
                  className="um-input"
                  value={addDraft.role}
                  onChange={(event) =>
                    setAddDraft((prev) => ({
                      ...prev,
                      role: event.target.value,
                      classId: event.target.value === 'student' ? prev.classId : '',
                    }))
                  }
                >
                  {editableRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {addDraft.role === 'student' && (
                <label className="um-field">
                  <span>Class / Section</span>
                  <select
                    className="um-input"
                    value={addDraft.classId}
                    disabled={classesLoading}
                    onChange={(event) =>
                      setAddDraft((prev) => ({
                        ...prev,
                        classId: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {classesLoading ? 'Loading classes...' : 'No class assigned yet'}
                    </option>
                    {classOptions.map((classInfo) => (
                      <option key={classInfo.id} value={classInfo.id}>
                        {formatClassOptionLabel(classInfo)}
                      </option>
                    ))}
                  </select>
                  <span className="um-field-hint">
                    Pick this so the student home/profile shows the right grade and section.
                  </span>
                  {classesError && <span className="um-field-error">{classesError}</span>}
                </label>
              )}
            </div>

            <div className="um-modal-actions">
              <button className="um-btn ghost" type="button" onClick={closeAdd}>
                Cancel
              </button>
              <button className="um-btn primary" type="button" onClick={saveAdd} disabled={addBusy}>
                {addBusy ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showParentLinks && (
        <div className="um-modal-backdrop" role="presentation" onClick={closeParentLinkManager}>
          <div
            className="um-modal um-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Parent student links"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="um-modal-head">
              <div>
                <div className="um-modal-title">Parent Links</div>
                <p className="um-modal-subtitle">Link parent accounts to the students they can monitor.</p>
              </div>
              <button className="um-modal-x" type="button" onClick={closeParentLinkManager} aria-label="Close">
                ×
              </button>
            </div>

            <div className="um-modal-body">
              {parentLinkError && <div className="um-empty" style={{ marginBottom: '10px' }}>{parentLinkError}</div>}

              <div className="um-link-form">
                <label className="um-field">
                  <span>Parent</span>
                  <select
                    className="um-input"
                    value={parentLinkDraft.parentId}
                    onChange={(event) =>
                      setParentLinkDraft((prev) => ({
                        ...prev,
                        parentId: event.target.value,
                      }))
                    }
                    disabled={parentLinksLoading}
                  >
                    <option value="">
                      {parentLinksLoading ? 'Loading parents...' : 'Choose parent'}
                    </option>
                    {parentLinkOptions.parents.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name} {parent.email ? `(${parent.email})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="um-field">
                  <span>Student</span>
                  <select
                    className="um-input"
                    value={parentLinkDraft.studentId}
                    onChange={(event) =>
                      setParentLinkDraft((prev) => ({
                        ...prev,
                        studentId: event.target.value,
                      }))
                    }
                    disabled={parentLinksLoading}
                  >
                    <option value="">
                      {parentLinksLoading ? 'Loading students...' : 'Choose student'}
                    </option>
                    {parentLinkOptions.students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} {student.email ? `(${student.email})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="um-btn primary"
                  type="button"
                  onClick={saveParentLink}
                  disabled={parentLinkBusy || parentLinksLoading}
                >
                  {parentLinkBusy ? 'Linking...' : 'Link'}
                </button>
              </div>

              <div className="um-link-summary">
                <strong>{parentLinks.length}</strong> active parent link{parentLinks.length === 1 ? '' : 's'}
              </div>

              <div className="um-link-list" aria-label="Current parent links">
                {parentLinksLoading ? (
                  <div className="um-empty">Loading parent links...</div>
                ) : parentLinks.length === 0 ? (
                  <div className="um-empty">No parent links yet.</div>
                ) : (
                  parentLinks.map((link) => (
                    <div className="um-link-row" key={link.id}>
                      <div>
                        <div className="um-link-title">
                          {link.parent?.name || 'Parent'} → {link.student?.name || 'Student'}
                        </div>
                        <div className="um-link-meta">
                          {link.parent?.email || 'No parent email'} · {link.student?.email || 'No student email'}
                        </div>
                      </div>
                      <button
                        className="um-action danger"
                        type="button"
                        onClick={() => removeParentLink(link)}
                        disabled={parentLinkBusy}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminUsers;
