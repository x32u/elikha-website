import React from 'react';
import { getArModelDefinition, resolveArObjectDefinitions } from '../utils/activityArConfig';
import { useStoredUserSettings } from '../hooks/useStoredUserSettings';
import { shouldLoadRichMedia } from '../utils/userSettings';
import './ActivityCard.css';

const isImageThumbnail = (value) => {
  const src = String(value || '').trim();
  if (!src) return false;
  if (src.startsWith('data:image/')) return true;
  const clean = src.split('?')[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg)$/.test(clean);
};

const getModelNameFromUrl = (value) => {
  const clean = String(value || '').split('?')[0].split('/').filter(Boolean).pop() || '';
  if (!clean) return '3D Model';
  try {
    return decodeURIComponent(clean).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  } catch {
    return clean.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  }
};

const getModelPreview = (activity) => {
  const model = getArModelDefinition(
    activity.modelId,
    activity.modelUrl,
    activity.modelFileType
  );
  const label = model?.label || getModelNameFromUrl(activity.modelUrl);
  const text = `${label} ${activity.modelUrl || ''} ${activity.title || ''}`.toLowerCase();
  const objectIcons = resolveArObjectDefinitions(activity.allowedObjectIds || [])
    .map((item) => item.icon)
    .slice(0, 3);

  if (text.includes('bottle') || text.includes('coca')) {
    return { icon: '🥤', label: label || 'Bottle', theme: 'drink', objectIcons };
  }

  if (text.includes('mask')) {
    return { icon: '🎭', label: label || 'Mask', theme: 'mask', objectIcons };
  }

  if (text.includes('cat')) {
    return { icon: '🐱', label: label || 'Cat', theme: 'creature', objectIcons };
  }

  return { icon: '🧩', label: label || '3D Model', theme: 'default', objectIcons };
};

const ActivityCard = ({ activity, onClick }) => {
  const settings = useStoredUserSettings();
  const hasImage = shouldLoadRichMedia(settings) && isImageThumbnail(activity.image);
  const preview = getModelPreview(activity);

  const isUrgent = () => {
    if (!activity.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = new Date(activity.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate.getTime() === tomorrow.getTime();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`activity-card ${isUrgent() ? 'urgent' : ''}`} onClick={() => onClick(activity)}>
      <div className="activity-info">
        <span className="activity-label">{activity.label}</span>
        <h3 className="activity-title">{activity.title}</h3>
        <p className="activity-description">{activity.description}</p>
        {activity.dueDate && (
          <span className="activity-date">Due: {formatDate(activity.dueDate)}</span>
        )}
      </div>
      <div className="activity-thumbnail">
        {hasImage ? (
          <img src={activity.image} alt={activity.title} />
        ) : (
          <div className={`activity-placeholder activity-model-preview ${preview.theme}`}>
            <span className="activity-model-emoji" aria-hidden="true">{preview.icon}</span>
            <span className="activity-model-label">{preview.label}</span>
            {preview.objectIcons.length > 0 && (
              <span className="activity-object-icons" aria-label="Available add-on shapes">
                {preview.objectIcons.map((icon, index) => (
                  <span key={`${icon}-${index}`} aria-hidden="true">{icon}</span>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityCard;
