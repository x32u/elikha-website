import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import Navbar from '../../components/Navbar';
import { getStudentProfile, getStudentActivities, getStudentClasses } from '../../services/studentApi';
import { useStoredUserSettings } from '../../hooks/useStoredUserSettings';
import { shouldLoadRichMedia } from '../../utils/userSettings';
import { formatStudentClassLabel } from '../../utils/classLabels';
import { hasStarRating, normalizeStarRating, starRatingText } from '../../utils/starRating';
import './Profile.css';

const PASTEL_THUMBNAIL_PALETTES = [
  ['#FFE7EC', '#FFD8F3', '#E8E7FF'],
  ['#E6F7FF', '#DFF1FF', '#EAF4FF'],
  ['#E8FCEB', '#DDF8ED', '#EFFCF6'],
  ['#FFF4DA', '#FFEBCD', '#FFF6E7'],
  ['#FDEBFF', '#F6E5FF', '#EDEBFF'],
  ['#EAFBF7', '#DDF7F6', '#E9F9FF'],
  ['#FFEDE1', '#FFE4D2', '#FFF1E8'],
  ['#EEF0FF', '#E8E8FF', '#F2F3FF']
];

const getStableColorIndex = (value = '') => {
  const text = String(value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % PASTEL_THUMBNAIL_PALETTES.length;
};

const shouldRenderImageThumb = (imageUrl) =>
  typeof imageUrl === 'string' &&
  imageUrl.trim().length > 0 &&
  (
    imageUrl.startsWith('http://') ||
    imageUrl.startsWith('https://') ||
    imageUrl.startsWith('data:image/')
  );

const isSnapshotDataUri = (imageUrl) =>
  typeof imageUrl === 'string' && imageUrl.startsWith('data:image/');

const hasSubmissionScore = (activity) =>
  hasStarRating(activity?.score);

const getFeedbackPreview = (feedback) => {
  if (typeof feedback !== 'string') return '';
  const text = feedback.trim();
  if (text.length <= 90) return text;
  return `${text.slice(0, 87)}...`;
};

const keyOutBlackBackground = (source) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = frame;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;

          if (max < 18 && chroma < 14) {
            data[i + 3] = 0;
            continue;
          }

          if (max < 36 && chroma < 20) {
            const alphaScale = Math.max(0, (max - 18) / 18);
            data[i + 3] = Math.round(data[i + 3] * alphaScale);
          }
        }

        ctx.putImageData(frame, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        console.error('Failed to process snapshot thumbnail:', error);
        resolve(source);
      }
    };
    img.onerror = () => resolve(source);
    img.src = source;
  });

const SnapshotThumbnailImage = ({ src, alt, className }) => {
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;

    if (!isSnapshotDataUri(src)) {
      setDisplaySrc(src);
      return () => {
        cancelled = true;
      };
    }

    keyOutBlackBackground(src).then((processedSrc) => {
      if (!cancelled) {
        setDisplaySrc(processedSrc);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={displaySrc} alt={alt} className={className} />;
};

const Profile = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('activities');
  const [activities, setActivities] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [profile, setProfile] = useState(null);
  const [classLabel, setClassLabel] = useState('Loading class...');
  const [loading, setLoading] = useState(true);
  const settings = useStoredUserSettings();

  // Get current user from session
  const userInfo = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const favoriteStorageKey = useMemo(
    () => (userInfo.id ? `elikha_favorite_artworks_${userInfo.id}` : ''),
    [userInfo.id]
  );

  useEffect(() => {
    if (!favoriteStorageKey) return;
    try {
      const raw = window.localStorage.getItem(favoriteStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoriteIds(parsed.map((id) => String(id)));
      }
    } catch {
      // ignore
    }
  }, [favoriteStorageKey]);

  useEffect(() => {
    if (!favoriteStorageKey) return;
    try {
      window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteIds));
    } catch {
      // ignore
    }
  }, [favoriteIds, favoriteStorageKey]);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!userInfo.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // Fetch profile, class, and activity list in parallel
      const [profileResult, activitiesResult, classesResult] = await Promise.all([
        getStudentProfile(userInfo.id),
        getStudentActivities(userInfo.id),
        getStudentClasses(userInfo.id)
      ]);

      if (profileResult.success) {
        setProfile(profileResult.data);
      }

      if (classesResult.success) {
        setClassLabel(formatStudentClassLabel(classesResult.data));
      } else {
        setClassLabel('No class assigned');
      }
      
      if (activitiesResult.success) {
        const completedActivities = (activitiesResult.data || []).filter((activity) =>
          ['submitted', 'reviewed'].includes(String(activity.status || '').toLowerCase())
        );

        // Map completed activities with stable pastel thumbnails and emojis
        const mappedActivities = completedActivities.map((activity, index) => ({
          ...activity,
          thumbPalette: PASTEL_THUMBNAIL_PALETTES[getStableColorIndex(activity.id || `${activity.title}-${index}`)],
          emoji: getActivityEmoji(activity.title),
          favorite: false,
        }));
        setActivities(mappedActivities);
      }
      
      setLoading(false);
    };

    fetchProfileData();
  }, [userInfo.id]);

  // Get emoji based on activity title keywords
  const getActivityEmoji = (title) => {
    const titleLower = (title || '').toLowerCase();
    if (titleLower.includes('paper') || titleLower.includes('origami')) return '📄';
    if (titleLower.includes('read') || titleLower.includes('book')) return '📚';
    if (titleLower.includes('stitch') || titleLower.includes('sew')) return '🧵';
    if (titleLower.includes('paint') || titleLower.includes('color')) return '🎨';
    if (titleLower.includes('clay') || titleLower.includes('sculpt')) return '🏺';
    if (titleLower.includes('draw') || titleLower.includes('sketch')) return '✏️';
    if (titleLower.includes('collage') || titleLower.includes('cut')) return '✂️';
    if (titleLower.includes('music') || titleLower.includes('sing')) return '🎵';
    if (titleLower.includes('dance') || titleLower.includes('move')) return '💃';
    return '🌅';
  };

  const activitiesWithFavoriteState = activities.map((item) => {
    const id = String(item.id || '');
    const isFavorite = favoriteIds.includes(id) || (normalizeStarRating(item.score) >= 5 && !favoriteIds.includes(id));
    return { ...item, favorite: isFavorite };
  });

  const favorites = activitiesWithFavoriteState.filter((item) => item.favorite);

  const toggleFavorite = (activityId) => {
    const id = String(activityId || '');
    if (!id) return;
    setFavoriteIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  // Get display name from profile or userInfo
  const displayName = profile?.name || userInfo.name || userInfo.firstName || userInfo.email?.split('@')[0] || 'Student';
  const gradeLevel = classLabel || 'No class assigned';
  const initial = displayName.charAt(0).toUpperCase();

  if (loading) {
    return (
      <div className="student-profile-page-container student-shell">
        <Header />
        <main className="student-profile-page">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading profile...</p>
          </div>
        </main>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="student-profile-page-container student-shell">
      <Header />
      <main className="student-profile-page">
        <section className="profile-header">
          <div className="profile-avatar" aria-hidden="true">{initial}</div>
          <div className="profile-header-body">
            <div className="profile-name-row">
              <h1 className="profile-username">{displayName}</h1>
            </div>
            <div className="profile-stats" aria-label="Activity count">
              <div className="stat">
                <span className="stat-number">{activities.length}</span>
                <span className="stat-label">Completed</span>
              </div>
              {favorites.length > 0 && (
                <div className="stat">
                  <span className="stat-number">{favorites.length}</span>
                  <span className="stat-label">Favorite</span>
                </div>
              )}
            </div>
            <div className="profile-bio" aria-label="Grade level">
              <p className="bio-text">{gradeLevel}</p>
            </div>
          </div>
        </section>

        <section className="profile-tabs" aria-label="Profile tabs">
          <button
            className={`tab ${activeTab === 'activities' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab('activities')}
          >
            Activities
          </button>
          <button
            className={`tab ${activeTab === 'favorites' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab('favorites')}
          >
            Favorite
          </button>
        </section>

        <section className="profile-grid" aria-label="Activities grid">
          {(activeTab === 'favorites' ? favorites : activitiesWithFavoriteState).length > 0 ? (
            (activeTab === 'favorites' ? favorites : activitiesWithFavoriteState).map((activity) => (
              <div
                key={activity.id}
                className="post-card"
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(`/activity/${activity.id}/start`, {
                    state: {
                      mode: 'view',
                      artworkUrl: activity.image_url,
                      paintState: activity.paint_state || [],
                      sceneState: activity.scene_state || [],
                      puzzleState: activity.puzzle_state || [],
                      modelState: activity.model_state || [],
                      groupState: activity.group_state || null,
                      allowedObjectIds: activity.allowed_object_ids || [],
                      modelUrl: activity.model_url || undefined,
                      modelFileType: activity.model_file_type || undefined,
                      modelConfigs: activity.model_configs || [],
                      puzzlePieces: activity.puzzle_pieces || 0,
                    },
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    navigate(`/activity/${activity.id}/start`, {
                      state: {
                        mode: 'view',
                        artworkUrl: activity.image_url,
                        paintState: activity.paint_state || [],
                        sceneState: activity.scene_state || [],
                        puzzleState: activity.puzzle_state || [],
                        modelState: activity.model_state || [],
                        groupState: activity.group_state || null,
                        allowedObjectIds: activity.allowed_object_ids || [],
                        modelUrl: activity.model_url || undefined,
                        modelFileType: activity.model_file_type || undefined,
                        modelConfigs: activity.model_configs || [],
                        puzzlePieces: activity.puzzle_pieces || 0,
                      },
                    });
                  }
                }}
                >
                <div
                  className="post-thumb"
                  style={{
                    background: `linear-gradient(135deg, ${activity.thumbPalette?.[0]} 0%, ${activity.thumbPalette?.[1]} 52%, ${activity.thumbPalette?.[2]} 100%)`,
                  }}
                  aria-hidden="true"
                >
                  {shouldLoadRichMedia(settings) && shouldRenderImageThumb(activity.image_url) ? (
                    <SnapshotThumbnailImage
                      src={activity.image_url}
                      alt={activity.title}
                      className={`post-thumb-img ${isSnapshotDataUri(activity.image_url) ? 'post-thumb-img--snapshot' : ''}`}
                    />
                  ) : (
                    <span className="post-thumb-icon" aria-hidden="true">{activity.emoji}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`favorite-badge ${activity.favorite ? '' : 'is-off'}`}
                  aria-label={activity.favorite ? 'Remove favorite' : 'Add favorite'}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(activity.id);
                  }}
                >
                  ★
                </button>
                <div className="post-meta">
                  <p className="post-title">{activity.title}</p>
                  {hasSubmissionScore(activity) && (
                    <p className="post-grade">Rating: {starRatingText(activity.score)}</p>
                  )}
                  {getFeedbackPreview(activity.feedback) && (
                    <p className="post-feedback">Feedback: {getFeedbackPreview(activity.feedback)}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-activities-profile">
              <p>{activeTab === 'favorites' ? 'No favorites yet' : 'No completed activities yet'}</p>
              <p className="empty-subtext">
                {activeTab === 'favorites'
                  ? 'Tap the star on an artwork to add it here.'
                  : 'Complete activities to see them here!'}
              </p>
            </div>
          )}
        </section>
      </main>
      <Navbar />
    </div>
  );
};

export default Profile;
