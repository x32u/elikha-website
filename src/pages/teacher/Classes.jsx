import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import ClassImagePicker from '../../components/ClassImagePicker';
import './Classes.css';
import { getTeacherClasses, createClass } from '../../services/teacherApi';
import { resolveClassImageUrl, uploadClassImage } from '../../services/classImageApi';
import { formatClassLabel } from '../../utils/classLabels';

const CLASS_COLORS = ['#1800AD', '#8A7861', '#1C170D', '#6B5A4D', '#AD5900'];

const Classes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newClassSubject, setNewClassSubject] = useState('');
  const [newClassImage, setNewClassImage] = useState(null);
  const [newClassImageError, setNewClassImageError] = useState('');
  const [pageError, setPageError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await getTeacherClasses(userInfo.id);
      
      if (result.success) {
        // Transform the data to include pending count and color
        const transformedClasses = await Promise.all(result.data.map(async (klass, index) => ({
          ...klass,
          icon: formatClassLabel(klass).charAt(0),
          label: formatClassLabel(klass),
          color: klass.color || CLASS_COLORS[index % CLASS_COLORS.length],
          imageSrc: await resolveClassImageUrl(klass.image_url),
          pending: klass.pending_assignments || 0
        })));
        setClasses(transformedClasses);
      } else {
        console.error('Failed to load classes:', result.error);
      }
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handleCreateClass = async () => {
    if (!newClassGrade.trim() || !newClassSection.trim() || !newClassSubject.trim()) {
      setPageError('Grade level, section, and subject are required.');
      return;
    }

    setCreating(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await createClass(userInfo.id, {
        grade: newClassGrade,
        section: newClassSection,
        subject: newClassSubject,
      });

      if (result.success) {
        if (newClassImage) {
          try {
            await uploadClassImage(result.data.id, newClassImage);
          } catch (error) {
            setPageError(`Class created, but its image could not be uploaded: ${error.message}`);
          }
        }
        setShowCreateModal(false);
        setNewClassGrade('');
        setNewClassSection('');
        setNewClassSubject('');
        setNewClassImage(null);
        setNewClassImageError('');
        await loadClasses(); // Reload classes
      } else {
        setPageError(`Failed to create class: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating class:', error);
      setPageError('Failed to create class. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleClassClick = (classId) => {
    navigate(`/class/${classId}`);
  };

  return (
    <div className="teacher-classes">
      <Navbar />
      <div className="classes-shell">
        <header className="classes-header">
          <div className="classes-header__titles">
            <span className="eyebrow">Classes</span>
            <h1>Manage Classes</h1>
            <p className="lede">View and manage your classes, students, and activities.</p>
          </div>
          <div className="classes-header__actions">
            <button className="btn primary" onClick={() => {
              setPageError('');
              setShowCreateModal(true);
            }}>+ New Class</button>
          </div>
        </header>

        {pageError && <div className="classes-alert" role="alert">{pageError}</div>}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
            Loading classes…
          </div>
        ) : (
          <div className="classes-list">
              {classes.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
                  No classes yet. Click "+ New Class" to create one.
                </div>
              ) : (
                classes.map((klass) => (
                  <button
                    type="button"
                    key={klass.id}
                    className="class-list-item"
                    onClick={() => handleClassClick(klass.id)}
                  >
                    <div className="class-list-avatar" style={{ background: klass.color }}>
                      {klass.imageSrc
                        ? <img src={klass.imageSrc} alt="" width="56" height="56" loading="lazy" />
                        : klass.icon}
                    </div>
                    <div className="class-list-content">
                      <div className="class-list-name">{klass.label}</div>
                      <div className="class-list-meta">{klass.student_count || 0} students • {klass.pending} pending</div>
                    </div>
                    <div className="class-list-action">
                      <span className="arrow-icon">→</span>
                    </div>
                  </button>
                ))
              )}
          </div>
        )}

        {/* Create Class Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="create-class-title" onClick={(e) => e.stopPropagation()}>
              <h2 id="create-class-title">Create New Class</h2>
              <div className="teacher-class-form">
                <label>
                  <span>Grade Level</span>
                <input
                  type="text"
                  name="classGrade"
                  autoComplete="off"
                  list="teacher-grade-suggestions"
                  placeholder="Kindergarten, Grade 6…"
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value)}
                  required
                />
                </label>
                <datalist id="teacher-grade-suggestions">
                  <option value="Kindergarten" />
                  <option value="Grade 4" />
                  <option value="Grade 5" />
                  <option value="Grade 6" />
                </datalist>
                <label>
                  <span>Section</span>
                  <input type="text" name="classSection" autoComplete="off" placeholder="Ruby, Sunflower…" value={newClassSection} onChange={(event) => setNewClassSection(event.target.value)} required />
                </label>
                <label>
                  <span>Subject</span>
                  <input type="text" name="classSubject" autoComplete="off" placeholder="Arts, MAPEH…" value={newClassSubject} onChange={(event) => setNewClassSubject(event.target.value)} required />
                </label>
                <ClassImagePicker
                  file={newClassImage}
                  onFileChange={(file, validation) => {
                    if (!validation.valid) {
                      setNewClassImage(null);
                      setNewClassImageError(validation.error);
                      return;
                    }
                    setNewClassImage(file);
                    setNewClassImageError('');
                  }}
                  onRemove={() => {
                    setNewClassImage(null);
                    setNewClassImageError('');
                  }}
                  error={newClassImageError}
                />
                <div className="teacher-class-form__actions">
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewClassImage(null);
                      setNewClassImageError('');
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn primary" 
                    onClick={handleCreateClass}
                    disabled={creating}
                  >
                    {creating ? 'Creating…' : 'Create Class'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Classes;
