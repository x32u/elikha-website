import React from 'react';
import './ProfileSection.css';

const formatFallbackGrade = (grade) => {
  const value = String(grade || '').trim();
  if (!value) return 'No class assigned';
  return /^grade\b/i.test(value) ? value : `Grade ${value}`;
};

const ProfileSection = ({ userName, grade, classLabel, completedCount = 0, pendingCount = 0 }) => {
  const displayClass = classLabel || formatFallbackGrade(grade);

  return (
    <section className="profile-section">
      <div className="profile-image">
        <div className="profile-placeholder">
          {userName.charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="profile-info">
        <h1 className="profile-greeting">hi, {userName}!</h1>
        <p className="profile-grade">{displayClass}</p>
      </div>
      <div className="profile-stats">
        <div className="profile-stat profile-stat--completed">
          <span className="profile-stat__count">{completedCount}</span>
          <span className="profile-stat__label">Completed</span>
        </div>
        <div className="profile-stat profile-stat--pending">
          <span className="profile-stat__count">{pendingCount}</span>
          <span className="profile-stat__label">Pending</span>
        </div>
      </div>
    </section>
  );
};

export default ProfileSection;
