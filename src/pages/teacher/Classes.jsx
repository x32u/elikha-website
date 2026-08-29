import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Classes.css';
import { getTeacherClasses, createClass } from '../../services/teacherApi';
import { formatClassLabel } from '../../utils/classLabels';

const CLASS_COLORS = ['#1800AD', '#8A7861', '#1C170D', '#6B5A4D', '#AD5900'];

const Classes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [creating, setCreating] = useState(false);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await getTeacherClasses(userInfo.id);
      
      if (result.success) {
        // Transform the data to include pending count and color
        const transformedClasses = result.data.map((klass, index) => ({
          ...klass,
          icon: formatClassLabel(klass).charAt(0),
          label: formatClassLabel(klass),
          color: CLASS_COLORS[index % CLASS_COLORS.length],
          pending: klass.pending_assignments || 0
        }));
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
    if (!newClassName.trim() || !newClassGrade) {
      alert('Please enter both class name and select a grade');
      return;
    }

    setCreating(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      const result = await createClass(userInfo.id, {
        name: newClassName,
        grade: newClassGrade
      });

      if (result.success) {
        setShowCreateModal(false);
        setNewClassName('');
        setNewClassGrade('');
        await loadClasses(); // Reload classes
      } else {
        alert('Failed to create class: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating class:', error);
      alert('Failed to create class');
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
            <button className="btn primary" onClick={() => setShowCreateModal(true)}>+ New Class</button>
          </div>
        </header>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
            Loading classes...
          </div>
        ) : (
          <div className="classes-list">
              {classes.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
                  No classes yet. Click "+ New Class" to create one.
                </div>
              ) : (
                classes.map((klass) => (
                  <div
                    key={klass.id}
                    className="class-list-item"
                    onClick={() => handleClassClick(klass.id)}
                  >
                    <div className="class-list-avatar" style={{ background: klass.color }}>
                      {klass.icon}
                    </div>
                    <div className="class-list-content">
                      <div className="class-list-name">{klass.label}</div>
                      <div className="class-list-meta">{klass.student_count || 0} students • {klass.pending} pending</div>
                    </div>
                    <div className="class-list-action">
                      <span className="arrow-icon">→</span>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}

        {/* Create Class Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Create New Class</h2>
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#1C170D', fontWeight: '500' }}>
                  Class Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Grade 4 - 101"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D4C5B9',
                    borderRadius: '8px',
                    fontSize: '14px',
                    marginBottom: '16px'
                  }}
                />
                <label style={{ display: 'block', marginBottom: '8px', color: '#1C170D', fontWeight: '500' }}>
                  Grade Level
                </label>
                <select
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #D4C5B9',
                    borderRadius: '8px',
                    fontSize: '14px',
                    marginBottom: '24px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select a grade</option>
                  <option value="Grade 4">Grade 4</option>
                  <option value="Grade 5">Grade 5</option>
                  <option value="Grade 6">Grade 6</option>
                </select>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn secondary" 
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn primary" 
                    onClick={handleCreateClass}
                    disabled={creating}
                  >
                    {creating ? 'Creating...' : 'Create Class'}
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
