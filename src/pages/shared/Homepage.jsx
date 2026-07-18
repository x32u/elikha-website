import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import ProfileSection from '../../components/ProfileSection';
import ArtworkCarousel from '../../components/ArtworkCarousel';
import ActivityCard from '../../components/ActivityCard';
import Navbar from '../../components/Navbar';
import { getStudentPendingActivities, getStudentArtworks, getStudentDashboardStats, getStudentActivities, getStudentClasses } from '../../services/studentApi';
import { formatStudentClassLabel } from '../../utils/classLabels';
import './Homepage.css';

const Homepage = () => {
  const DEFAULT_VISIBLE_ACTIVITIES = 5;
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: 'Student', classLabel: 'Loading class...' });
  const [artworks, setArtworks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userInfo = sessionStorage.getItem('userInfo');
    if (userInfo) {
      const parsedUser = JSON.parse(userInfo);
      setUser({
        id: parsedUser.id,
        name: parsedUser.name || 'Student',
        classLabel: 'Loading class...'
      });
      loadStudentData(parsedUser.id);
    }
  }, []);

  useEffect(() => {
    if (activities.length <= DEFAULT_VISIBLE_ACTIVITIES && showAllActivities) {
      setShowAllActivities(false);
    }
  }, [activities, showAllActivities, DEFAULT_VISIBLE_ACTIVITIES]);

  const loadStudentData = async (studentId) => {
    setLoading(true);
    try {
      const [activitiesResult, artworksResult, statsResult, allActivitiesResult, classesResult] = await Promise.all([
        getStudentPendingActivities(studentId),
        getStudentArtworks(studentId),
        getStudentDashboardStats(studentId),
        getStudentActivities(studentId),
        getStudentClasses(studentId)
      ]);

      if (classesResult.success) {
        const classLabel = formatStudentClassLabel(classesResult.data);
        setUser((prev) => ({ ...prev, classLabel }));
      } else {
        setUser((prev) => ({ ...prev, classLabel: 'No class assigned' }));
      }

      if (activitiesResult.success) {
        const formattedActivities = activitiesResult.data.map((a, index) => ({
          id: a.id,
          label: `Activity ${index + 1}`,
          title: a.title,
          description: a.description || 'Complete this activity',
          arInstructions: a.ar_instructions || '',
          image: a.image_url,
          dueDate: a.due_date,
          allowedObjectIds: a.allowed_object_ids || [],
          modelId: a.model_id || undefined,
          modelUrl: a.model_url || undefined,
          modelFileType: a.model_file_type || undefined,
          modelConfigs: a.model_configs || [],
          puzzlePieces: a.puzzle_pieces || 0,
        }));
        setActivities(formattedActivities);
      }

      const completedFromActivities = allActivitiesResult.success
        ? (allActivitiesResult.data || [])
          .filter((a) => ['submitted', 'reviewed'].includes(String(a.status || '').toLowerCase()))
          .map((a) => ({
            id: `activity-${a.id}`,
            title: a.title || 'Artwork',
            arInstructions: a.ar_instructions || '',
            image: a.image_url || null,
            activityId: a.id,
            paintState: a.paint_state || [],
            sceneState: a.scene_state || [],
            puzzleState: a.puzzle_state || [],
            modelState: a.model_state || [],
            groupState: a.group_state || null,
            allowedObjectIds: a.allowed_object_ids || [],
            modelUrl: a.model_url || undefined,
            modelFileType: a.model_file_type || undefined,
            modelConfigs: a.model_configs || [],
            puzzlePieces: a.puzzle_pieces || 0,
          }))
        : [];

      if (artworksResult.success) {
        const formattedArtworks = (artworksResult.data || []).map(a => ({
          id: a.id,
          title: a.title || 'Artwork',
          arInstructions: a.ar_instructions || '',
          image: a.image_url,
          activityId: a.activity_id,
          paintState: a.paint_state || [],
          sceneState: a.scene_state || [],
          puzzleState: a.puzzle_state || [],
          modelState: a.model_state || [],
          groupState: a.group_state || null,
          allowedObjectIds: a.allowed_object_ids || [],
          modelUrl: a.model_url || undefined,
          modelFileType: a.model_file_type || undefined,
          modelConfigs: a.model_configs || [],
          puzzlePieces: a.puzzle_pieces || 0,
        }));
        if (formattedArtworks.length > 0) {
          setArtworks(formattedArtworks);
        } else if (completedFromActivities.length > 0) {
          setArtworks(completedFromActivities);
        } else {
          setArtworks([{ id: 1, title: 'No artworks yet', image: null }]);
        }
      } else if (completedFromActivities.length > 0) {
        setArtworks(completedFromActivities);
      }

      if (statsResult.success) {
        setStats(statsResult.data);
      }
    } catch (error) {
      console.error('Error loading student data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivityClick = (activity) => {
    navigate(`/activity/${activity.id}/start`, {
      state: {
        allowedObjectIds: activity.allowedObjectIds || [],
        modelUrl: activity.modelUrl || undefined,
        modelFileType: activity.modelFileType || undefined,
        modelConfigs: activity.modelConfigs || [],
        arInstructions: activity.arInstructions || '',
        puzzlePieces: activity.puzzlePieces || 0,
      },
    });
  };

  const handleArtworkClick = (artwork) => {
    if (!artwork?.activityId) {
      navigate('/profile');
      return;
    }

    navigate(`/activity/${artwork.activityId}/start`, {
      state: {
        mode: 'view',
        artworkUrl: artwork.image,
        paintState: artwork.paintState || [],
        sceneState: artwork.sceneState || [],
        puzzleState: artwork.puzzleState || [],
        modelState: artwork.modelState || [],
        groupState: artwork.groupState || null,
        allowedObjectIds: artwork.allowedObjectIds || [],
        modelUrl: artwork.modelUrl || undefined,
        modelFileType: artwork.modelFileType || undefined,
        modelConfigs: artwork.modelConfigs || [],
        arInstructions: artwork.arInstructions || '',
        puzzlePieces: artwork.puzzlePieces || 0,
      },
    });
  };

  const hasMoreActivities = activities.length > DEFAULT_VISIBLE_ACTIVITIES;
  const visibleActivities = showAllActivities
    ? activities
    : activities.slice(0, DEFAULT_VISIBLE_ACTIVITIES);

  return (
    <div className="homepage-container student-shell">
      <div className="homepage-wrapper">
        <Header />
        
        <main className="main-content">
          {/* Main Content */}
          <div className="content-area">
            <ProfileSection
              userName={user.name}
              classLabel={user.classLabel}
              completedCount={stats.completedCount || 0}
              pendingCount={stats.pendingCount || activities.length}
            />
            <ArtworkCarousel artworks={artworks} onArtworkClick={handleArtworkClick} />

            <section className="activities-section">
              <h2 className="section-title">Pending Activities</h2>
              {!loading && activities.length === 0 ? (
                <div className="activities-empty">
                  <span className="activities-empty__icon">🎉</span>
                  <p className="activities-empty__title">You're all caught up!</p>
                  <p className="activities-empty__sub">No pending activities right now.</p>
                </div>
              ) : (
                <div className="activities-container">
                  {visibleActivities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      onClick={handleActivityClick}
                    />
                  ))}
                </div>
              )}
              {hasMoreActivities && (
                <button
                  type="button"
                  className="activities-toggle-button"
                  onClick={() => setShowAllActivities((prev) => !prev)}
                >
                  {showAllActivities
                    ? 'Hide Less'
                    : `Show More (${activities.length - DEFAULT_VISIBLE_ACTIVITIES} more)`}
                </button>
              )}
            </section>
          </div>
        </main>
        
        <Navbar />
      </div>
    </div>
  );
};

export default Homepage;
