import { detectColorRequirementsLocally, evaluateColorRequirements } from './activityColorRequirements';

describe('activity color requirements', () => {
  it('extracts only explicit targets and colors from the AR palette', () => {
    expect(detectColorRequirementsLocally({
      instructions: 'Color the cube red and make the cactus green.',
      targets: [
        { type: 'object', id: 'cube', label: 'Cube' },
        { type: 'model', id: 'cactus', label: 'Cactus' },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'cube', colorHex: '#FF0000' }),
      expect.objectContaining({ targetId: 'cactus', colorHex: '#00A651' }),
    ]));
  });

  it('scores primitive and model colors deterministically', () => {
    const result = evaluateColorRequirements({
      requirements: [
        { targetType: 'object', targetId: 'cube', targetLabel: 'Cube', colorHex: '#FF0000' },
        { targetType: 'model', targetId: 'cactus', targetLabel: 'Cactus', colorHex: '#00A651' },
      ],
      sceneState: [{ objectId: 'cube', color: '#ff0000', paint: [] }],
      paintState: [{ targetId: 'cactus', color: '#00a651' }],
    });
    expect(result).toMatchObject({ matched: 2, total: 2, accuracyPercent: 100, complete: true });
  });

  it('accepts only the configured activity colors', () => {
    expect(detectColorRequirementsLocally({
      instructions: 'Color the cube ocean blue and then red.',
      targets: [{ type: 'object', id: 'cube', label: 'Cube' }],
      allowedColors: [{ hex: '#13579B', name: 'ocean blue' }],
    })).toEqual([expect.objectContaining({ targetId: 'cube', colorHex: '#13579B' })]);
    expect(evaluateColorRequirements({
      requirements: [{ targetType: 'object', targetId: 'cube', colorHex: '#FF0000' }],
      allowedColors: [{ hex: '#13579B', name: 'ocean blue' }],
    }).total).toBe(0);
  });
});
