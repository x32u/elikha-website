import {
  encodeArSubmissionDescription,
  parseArSubmissionDescription,
} from './arSubmission';

describe('AR submission state', () => {
  it('round-trips duplicated and editing-locked scene objects', () => {
    const sceneState = [
      {
        id: 'scene-object-original',
        objectId: 'cube',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 0.32,
        color: '#ff0000',
        gluedTo: null,
        groupId: null,
        editingLocked: true,
        paint: [],
      },
      {
        id: 'scene-object-copy',
        objectId: 'cube',
        position: [0.22, 0.14, 0],
        rotation: [0, 0, 0],
        scale: 0.32,
        color: '#ff0000',
        gluedTo: null,
        groupId: null,
        editingLocked: false,
        paint: [
          {
            id: 'copy-paint-1',
            point: [0, 0, 0.5],
            normal: [0, 0, 1],
            size: 0.1,
            color: '#0000ff',
            timestamp: 1,
            layer: 1,
          },
        ],
      },
    ];

    const encoded = encodeArSubmissionDescription([], 'Submitted from AR', sceneState);
    const decoded = parseArSubmissionDescription(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded.sceneState).toEqual(sceneState);
  });

  it('continues to parse scene objects saved before editing locks existed', () => {
    const legacySceneState = [
      {
        id: 'legacy-object',
        objectId: 'sphere',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 0.32,
        paint: [],
      },
    ];

    const encoded = encodeArSubmissionDescription([], 'Submitted from AR', legacySceneState);
    const decoded = parseArSubmissionDescription(encoded);

    expect(decoded.sceneState).toEqual(legacySceneState);
  });
});
