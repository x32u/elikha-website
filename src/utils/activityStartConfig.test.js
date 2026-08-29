import {
  buildActivityStartConfig,
  resolveActivitySubmissionState,
} from './activityStartConfig';

describe('activity start configuration', () => {
  test('hydrates a direct activity route from authoritative server data', () => {
    const config = buildActivityStartConfig({
      activity: {
        assignment: { id: 'assignment-1', status: 'assigned' },
        allowed_object_ids: ['cube'],
        ar_instructions: 'Color the cube red.',
        model_url: 'https://models.example/cube.glb',
        model_file_type: 'GLB',
        model_configs: [
          {
            id: 'cube-model',
            label: 'Cube Model',
            modelUrl: 'https://models.example/cube.glb',
            modelFileType: 'GLB',
          },
        ],
        puzzle_pieces: 3,
        paint_state: [],
        scene_state: [],
        puzzle_state: [],
        model_state: [],
        group_state: null,
      },
      routeState: {
        allowedObjectIds: ['sphere'],
        modelUrl: 'https://stale.example/model.obj',
      },
    });

    expect(config).toEqual(
      expect.objectContaining({
        viewMode: false,
        readOnlyReason: '',
        allowedObjectIds: ['cube'],
        arInstructions: 'Color the cube red.',
        modelUrl: 'https://models.example/cube.glb',
        modelFileType: 'glb',
        puzzlePieces: 3,
      })
    );
    expect(config.modelConfigs).toEqual([
      expect.objectContaining({ id: 'cube-model', modelFileType: 'glb' }),
    ]);
  });

  test('forces submitted work into read-only mode and restores its saved state', () => {
    const config = buildActivityStartConfig({
      activity: {
        assignment: { id: 'assignment-1', status: 'submitted' },
        is_submitted: true,
        submission: {
          id: 'submission-1',
          status: 'submitted',
          submitted_at: '2026-08-13T10:00:00Z',
          artwork_url: 'data:image/webp;base64,saved',
        },
        allowed_object_ids: ['cube'],
        model_configs: [],
        paint_state: [{ color: '#ff0000' }],
        scene_state: [{ id: 'shape-1', editingLocked: true }],
        puzzle_state: [{ id: 'piece-1', snapped: true }],
        model_state: [{ id: 'model-1', editingLocked: true }],
        group_state: { nextGroupId: 2 },
      },
      routeState: { mode: 'edit', artworkUrl: 'data:image/png;base64,stale' },
    });

    expect(config.viewMode).toBe(true);
    expect(config.readOnlyReason).toBe('submitted');
    expect(config.artworkUrl).toBe('data:image/webp;base64,saved');
    expect(config.initialPaintState).toEqual([{ color: '#ff0000' }]);
    expect(config.initialSceneState).toEqual([{ id: 'shape-1', editingLocked: true }]);
    expect(config.initialPuzzleState).toEqual([{ id: 'piece-1', snapped: true }]);
    expect(config.initialModelState).toEqual([{ id: 'model-1', editingLocked: true }]);
    expect(config.initialGroupState).toEqual({ nextGroupId: 2 });
  });

  test('treats reviewed and graded statuses as submitted', () => {
    expect(
      resolveActivitySubmissionState({ submission: { status: 'graded' } })
    ).toEqual({ submitted: true, reviewed: true });

    const config = buildActivityStartConfig({
      activity: {
        student_status: 'reviewed',
        allowed_object_ids: [],
        model_configs: [],
      },
    });

    expect(config.viewMode).toBe(true);
    expect(config.readOnlyReason).toBe('reviewed');
  });

  test('preserves an explicitly requested viewer route without enabling edits', () => {
    const config = buildActivityStartConfig({
      routeState: {
        mode: 'view',
        artworkUrl: 'data:image/png;base64,route',
        paintState: [{ color: '#000000' }],
        allowedObjectIds: ['sphere'],
      },
    });

    expect(config.viewMode).toBe(true);
    expect(config.readOnlyReason).toBe('view');
    expect(config.artworkUrl).toBe('data:image/png;base64,route');
    expect(config.initialPaintState).toEqual([{ color: '#000000' }]);
    expect(config.allowedObjectIds).toEqual(['sphere']);
  });
});

