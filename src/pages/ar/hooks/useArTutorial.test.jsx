import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useArTutorial } from './useArTutorial';

const IDLE_HANDS = {
  isGrabbing: false,
  isPinching: false,
  isZooming: false,
  dx: 0,
  dy: 0,
  zoomDelta: 0,
};

const TutorialProbe = ({ voiceEnabled }) => {
  const { announce, currentTexts } = useArTutorial({
    grabState: IDLE_HANDS,
    enabled: false,
    voiceEnabled,
  });

  return (
    <div>
      <button type="button" onClick={() => announce('You pressed the color red.')}>Announce</button>
      <output>{currentTexts.join(' ')}</output>
    </div>
  );
};

describe('useArTutorial voice opt-out', () => {
  let container;
  let root;
  let speechSynthesis;
  let originalSpeechSynthesis;
  let originalUtterance;

  beforeEach(() => {
    originalSpeechSynthesis = window.speechSynthesis;
    originalUtterance = global.SpeechSynthesisUtterance;

    class FakeSpeechSynthesisUtterance {
      constructor(text) {
        this.text = text;
      }
    }

    speechSynthesis = {
      speaking: false,
      pending: false,
      getVoices: jest.fn(() => []),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      resume: jest.fn(),
      speak: jest.fn((utterance) => {
        speechSynthesis.speaking = true;
        utterance.onstart?.();
      }),
      cancel: jest.fn(() => {
        speechSynthesis.speaking = false;
        speechSynthesis.pending = false;
      }),
    };

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: speechSynthesis,
    });
    global.SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: originalSpeechSynthesis,
    });
    global.SpeechSynthesisUtterance = originalUtterance;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('cancels speech and clears its caption as soon as voice guidance is disabled', async () => {
    await act(async () => {
      root.render(<TutorialProbe voiceEnabled />);
    });

    const button = container.querySelector('button');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output').textContent).toBe('You pressed the color red.');

    await act(async () => {
      root.render(<TutorialProbe voiceEnabled={false} />);
    });

    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output').textContent).toBe('');
  });
});
