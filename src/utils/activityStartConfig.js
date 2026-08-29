import { DEFAULT_ALLOWED_OBJECT_IDS } from './activityArConfig';

const SUBMITTED_STATUSES = new Set([
  'submitted',
  'late',
  'reviewed',
  'graded',
  'completed',
]);

const REVIEWED_STATUSES = new Set(['reviewed', 'graded', 'completed']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const normalizeModelConfigs = (models) => {
  if (!Array.isArray(models)) return [];

  return models
    .map((model, index) => {
      const modelUrl = String(model?.modelUrl || model?.model_url || '').trim();
      if (!modelUrl) return null;

      const modelFileType = String(
        model?.modelFileType || model?.model_file_type || model?.fileType || ''
      )
        .trim()
        .toLowerCase();

      return {
        id: model?.id || `model-${index}`,
        label: model?.label || `Model ${index + 1}`,
        modelUrl,
        modelFileType: modelFileType || undefined,
      };
    })
    .filter(Boolean);
};

export const resolveActivitySubmissionState = (activity) => {
  const submission = activity?.submission || null;
  const statuses = [
    activity?.student_status,
    submission?.status,
    activity?.assignment?.status,
  ].map(normalizeStatus);

  const reviewed = Boolean(
    activity?.is_reviewed ||
      submission?.reviewed_at ||
      statuses.some((status) => REVIEWED_STATUSES.has(status))
  );
  const submitted = Boolean(
    reviewed ||
      activity?.is_submitted ||
      submission?.submitted_at ||
      statuses.some((status) => SUBMITTED_STATUSES.has(status))
  );

  return { submitted, reviewed };
};

export const buildActivityStartConfig = ({ activity = null, routeState = null } = {}) => {
  const route = routeState && typeof routeState === 'object' ? routeState : {};
  const serverActivity = activity && typeof activity === 'object' ? activity : null;
  const { submitted, reviewed } = resolveActivitySubmissionState(serverActivity);
  const requestedViewMode = route.viewMode === true || route.mode === 'view';
  const viewMode = submitted || requestedViewMode;

  const requestedPuzzlePieces = Number(
    serverActivity ? serverActivity.puzzle_pieces : route.puzzlePieces
  );
  const puzzlePieces =
    requestedPuzzlePieces === 3 || requestedPuzzlePieces === 4 ? requestedPuzzlePieces : 0;

  const configuredObjectIds = serverActivity
    ? serverActivity.allowed_object_ids
    : route.allowedObjectIds;
  const allowedObjectIds =
    Array.isArray(configuredObjectIds) && configuredObjectIds.length > 0
      ? [...configuredObjectIds]
      : [...DEFAULT_ALLOWED_OBJECT_IDS];

  const configuredModels = serverActivity ? serverActivity.model_configs : route.modelConfigs;
  const modelConfigs = normalizeModelConfigs(configuredModels);
  const rawModelUrl = serverActivity ? serverActivity.model_url : route.modelUrl;
  const rawModelFileType = serverActivity
    ? serverActivity.model_file_type
    : route.modelFileType;

  const submissionArtworkUrl = String(serverActivity?.submission?.artwork_url || '').trim();
  const serverArtworkUrl = String(
    serverActivity?.artwork_url || serverActivity?.image_url || ''
  ).trim();
  const routeArtworkUrl = String(route.artworkUrl || '').trim();

  return {
    viewMode,
    readOnlyReason: reviewed ? 'reviewed' : submitted ? 'submitted' : requestedViewMode ? 'view' : '',
    artworkUrl: submissionArtworkUrl || serverArtworkUrl || routeArtworkUrl,
    arInstructions: String(
      serverActivity ? serverActivity.ar_instructions || '' : route.arInstructions || ''
    ),
    initialPaintState: Array.isArray(
      serverActivity ? serverActivity.paint_state : route.paintState
    )
      ? [...(serverActivity ? serverActivity.paint_state : route.paintState)]
      : [],
    initialSceneState: Array.isArray(
      serverActivity ? serverActivity.scene_state : route.sceneState
    )
      ? [...(serverActivity ? serverActivity.scene_state : route.sceneState)]
      : [],
    initialPuzzleState: Array.isArray(
      serverActivity ? serverActivity.puzzle_state : route.puzzleState
    )
      ? [...(serverActivity ? serverActivity.puzzle_state : route.puzzleState)]
      : [],
    initialModelState: Array.isArray(
      serverActivity ? serverActivity.model_state : route.modelState
    )
      ? [...(serverActivity ? serverActivity.model_state : route.modelState)]
      : [],
    initialGroupState:
      (serverActivity ? serverActivity.group_state : route.groupState) &&
      typeof (serverActivity ? serverActivity.group_state : route.groupState) === 'object'
        ? serverActivity
          ? serverActivity.group_state
          : route.groupState
        : null,
    allowedObjectIds,
    modelUrl:
      typeof rawModelUrl === 'string' && rawModelUrl.trim()
        ? rawModelUrl.trim()
        : undefined,
    modelFileType:
      typeof rawModelFileType === 'string' && rawModelFileType.trim()
        ? rawModelFileType.trim().toLowerCase()
        : undefined,
    modelConfigs,
    puzzlePieces,
  };
};

