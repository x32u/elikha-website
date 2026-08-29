import { supabase } from '../lib/supabase';

export const getTeacherRubrics = async (teacherId) => {
  const { data, error } = await supabase.from('rubrics').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false });
  return error ? { success: false, error: error.message } : { success: true, data };
};

export const getActivityRubricOptions = async (teacherId = null) => {
  const { data, error } = await supabase.rpc('get_activity_rubric_options', {
    p_teacher_id: teacherId || null,
  });
  return error
    ? { success: false, error: error.message }
    : { success: true, data: Array.isArray(data) ? data : [] };
};

export const createRubric = async ({ teacherId, title, description, criteria, metadata = {} }) => {
  const { data, error } = await supabase.from('rubrics').insert({ teacher_id: teacherId, title, description, criteria, metadata: { version: 1, ...metadata } }).select().single();
  return error ? { success: false, error: error.message } : { success: true, data };
};

export const saveRubricObservation = async ({ observation, criteria }) => {
  const { data, error } = await supabase.from('rubric_observations').insert(observation).select().single();
  if (error) return { success: false, error: error.message };
  const { error: criteriaError } = await supabase.from('rubric_criterion_observations').insert(criteria.map((item) => ({ ...item, observation_id: data.id })));
  return criteriaError ? { success: false, error: criteriaError.message } : { success: true, data };
};

export const getLearnerRubricObservations = async (learnerId) => {
  const { data, error } = await supabase.from('rubric_observations').select('*, rubric:rubrics(title, metadata), criterion_observations:rubric_criterion_observations(*)').eq('learner_id', learnerId).order('observation_date', { ascending: false });
  return error ? { success: false, error: error.message } : { success: true, data };
};

export const deleteRubric = async (id) => {
  const { count, error: usageError } = await supabase
    .from('activity_rubrics')
    .select('activity_id', { count: 'exact', head: true })
    .eq('rubric_id', id);
  if (usageError) return { success: false, error: usageError.message };
  if ((count || 0) > 0) {
    return {
      success: false,
      code: 'rubric_in_use',
      error: 'This rubric is attached to an activity and must be kept for its saved grading history. Use “Use as copy” to make a new version.',
    };
  }
  const { error } = await supabase.from('rubrics').delete().eq('id', id);
  return error ? { success: false, error: error.message } : { success: true };
};

export const assignRubricToActivity = async (activityId, rubricId) => {
  const { data, error } = await supabase.rpc('set_activity_rubric', {
    p_activity_id: activityId,
    p_rubric_id: rubricId || null,
  });
  return error
    ? { success: false, error: error.message }
    : { success: true, data };
};

export const getActivityRubricManagementState = async (activityId) => {
  const { data, error } = await supabase.rpc('get_activity_rubric_management_state', {
    p_activity_id: activityId,
  });
  return error
    ? { success: false, error: error.message }
    : {
      success: true,
      data: {
        rubricId: data?.rubric_id || '',
        rubricTitle: data?.rubric_title || '',
        rubricVersion: data?.rubric_version || '',
        changeLocked: Boolean(data?.change_locked),
        lockReason: data?.lock_reason || '',
        hasSubmissions: Boolean(data?.has_submissions),
      },
    };
};

export const getActivityRubric = async (activityId) => {
  const { data, error } = await supabase.from('activity_rubrics').select('rubric_snapshot,rubric_version,rubric:rubrics(*)').eq('activity_id', activityId).maybeSingle();
  const rubric = data?.rubric_snapshot || data?.rubric || null;
  return error ? { success: false, error: error.message } : { success: true, data: rubric ? { ...rubric, assignedVersion: data?.rubric_version } : null };
};
