import React, { useMemo, useState } from 'react';
import Navbar from '../../components/Navbar';
import ARApp from '../ar/ARApp';
import {
  DEFAULT_MODEL_ID,
  getArRenderableModelLibrary,
} from '../../utils/activityArConfig';
import {
  DEFAULT_PRACTICE_LEVEL_ID,
  getPracticeLevel,
  PRACTICE_LEVELS,
} from '../../utils/practiceLevels';
import { useUserSettings } from '../../hooks/useUserSettings';
import { saveUserSettings } from '../../services/userSettingsApi';
import './ArSandbox.css';

const ArSandbox = () => {
  const { settings: userSettings, userId } = useUserSettings();
  const models = useMemo(() => getArRenderableModelLibrary(), []);
  const [selectedModelId, setSelectedModelId] = useState(
    models.find((model) => model.id === DEFAULT_MODEL_ID)?.id || models[0]?.id || ''
  );
  const [difficultyId, setDifficultyId] = useState(DEFAULT_PRACTICE_LEVEL_ID);
  const [sessionId, setSessionId] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const selectedModel = models.find((model) => model.id === selectedModelId) || models[0];
  const selectedLevel = getPracticeLevel(difficultyId);
  const voiceGuideEnabled = userSettings.voiceInstructions !== false;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  const toggleVoiceGuide = () => {
    void saveUserSettings(userId, {
      ...userSettings,
      voiceInstructions: !voiceGuideEnabled,
    });
  };

  const startSandbox = () => {
    setSessionId((current) => current + 1);
    setIsRunning(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const exitSandbox = () => {
    setIsRunning(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (isRunning && selectedModel) {
    return (
      <ARApp
        key={`${selectedModel.id}:${selectedLevel.id}:${sessionId}`}
        sandboxMode
        sandboxDifficulty={selectedLevel.id}
        mobileMode={isMobile}
        modelUrl={selectedModel.modelUrl}
        modelFileType={selectedModel.fileType}
        modelConfigs={[{
          id: selectedModel.id,
          label: selectedModel.label,
          modelUrl: selectedModel.modelUrl,
          modelFileType: selectedModel.fileType,
        }]}
        allowedObjectIds={[]}
        puzzlePieces={selectedLevel.puzzlePieces}
        onExit={exitSandbox}
      />
    );
  }

  return (
    <div className="sandbox-page student-shell">
      <main className="sandbox-main">
        <section className="sandbox-hero">
          <div className="sandbox-hero-copy">
            <span className="sandbox-eyebrow">Student AR Sandbox</span>
            <h1>Practice AR by level</h1>
            <p>
              Start with coloring, continue with puzzles, then combine both skills.
              Sandbox work is temporary and cannot be submitted.
            </p>
          </div>
          <div className="sandbox-status">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Submission disabled</strong>
              <p>No grades, activity submissions, or artworks are created.</p>
            </div>
          </div>
        </section>

        <section className="sandbox-setup" aria-labelledby="sandbox-setup-title">
          <div className="sandbox-setup-heading">
            <div>
              <span>Sandbox setup</span>
              <h2 id="sandbox-setup-title">Choose your model and difficulty</h2>
            </div>
            <span className="sandbox-step">Ready when you are</span>
          </div>

          <div className="sandbox-fields sandbox-fields-single">
            <label className="sandbox-field">
              <span>Base model</span>
              <select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)}>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
              <small>Select the object you want to use for this practice session.</small>
            </label>
          </div>

          <section className="sandbox-voice-guide" aria-labelledby="sandbox-voice-guide-title">
            <span className="sandbox-voice-guide-icon" aria-hidden="true">
              {voiceGuideEnabled ? '🔊' : '🔇'}
            </span>
            <div className="sandbox-voice-guide-copy">
              <strong id="sandbox-voice-guide-title">Voice guide</strong>
              <small>
                Hear activity steps and confirmations such as “You pressed the color red.”
              </small>
            </div>
            <button
              type="button"
              className={`sandbox-voice-toggle ${voiceGuideEnabled ? 'active' : ''}`}
              aria-pressed={voiceGuideEnabled}
              aria-label={`Turn Sandbox voice guide ${voiceGuideEnabled ? 'off' : 'on'}`}
              onClick={toggleVoiceGuide}
            >
              Voice {voiceGuideEnabled ? 'On' : 'Off'}
            </button>
          </section>

          <fieldset className="sandbox-levels">
            <legend>Difficulty level</legend>
            <div className="sandbox-level-grid">
              {PRACTICE_LEVELS.map((level) => {
                const selected = selectedLevel.id === level.id;
                return (
                  <label className={`sandbox-level-card ${selected ? 'selected' : ''}`} key={level.id}>
                    <input
                      type="radio"
                      name="practice-difficulty"
                      value={level.id}
                      checked={selected}
                      onChange={() => setDifficultyId(level.id)}
                    />
                    <span className="sandbox-level-icon" aria-hidden="true">{level.icon}</span>
                    <span className="sandbox-level-copy">
                      <strong>{level.label}</strong>
                      <b>{level.summary}</b>
                      <small>{level.description}</small>
                    </span>
                    <span className="sandbox-level-check" aria-hidden="true">✓</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="sandbox-tools">
            <h3>Available in {selectedLevel.label}</h3>
            <div>
              {selectedLevel.tools.map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="sandbox-start"
            disabled={!selectedModel}
            onClick={startSandbox}
          >
            Start {selectedLevel.label} Practice
          </button>
          <p className="sandbox-safety">
            The camera is used only for the live AR session. Use AR in a clear, well-lit space.
          </p>
        </section>
      </main>
      <Navbar />
    </div>
  );
};

export default ArSandbox;
