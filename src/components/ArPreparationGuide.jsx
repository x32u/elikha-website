import React, { useId } from 'react';
import './ArPreparationGuide.css';

const AR_PREPARATION_STEPS = [
  {
    icon: '✨',
    title: 'Open AR',
    description: 'Select Start Project, read the safety reminder, then select Enter AR.',
  },
  {
    icon: '📷',
    title: 'Allow the camera',
    description: 'Select Allow camera and start, then choose Allow when your browser or device asks.',
  },
  {
    icon: '🔎',
    title: 'Check your space',
    description: 'Use a clear, well-lit area. Slowly point the camera around your work space and remove obstacles.',
  },
  {
    icon: '📱',
    title: 'Position your device',
    description: 'Hold the device steady and move or tilt it until your work area and the 3D model are easy to see.',
  },
];

const ArPreparationGuide = ({ compact = false, className = '' }) => {
  const generatedId = useId();
  const titleId = `ar-preparation-title-${generatedId.replace(/:/g, '')}`;
  const classes = [
    'ar-preparation-guide',
    compact ? 'ar-preparation-guide--compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <section
      className={classes}
      aria-labelledby={titleId}
      data-testid="ar-preparation-guide"
    >
      <header className="ar-preparation-guide__header">
        <p className="ar-preparation-guide__eyebrow">AR Quick Guide</p>
        <h2 id={titleId}>Get ready before you start</h2>
        <p>Follow these four quick steps for a safer and clearer AR experience.</p>
      </header>

      <ol className="ar-preparation-guide__steps">
        {AR_PREPARATION_STEPS.map((step, index) => (
          <li key={step.title} className="ar-preparation-guide__step">
            <span className="ar-preparation-guide__number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="ar-preparation-guide__icon" aria-hidden="true">
              {step.icon}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="ar-preparation-guide__permission-note">
        <strong>Camera blocked?</strong>{' '}
        Open your browser or device permissions, allow camera access for E-Likha, then reload the activity.
      </p>
    </section>
  );
};

export default ArPreparationGuide;
