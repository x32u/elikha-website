import { supabase } from '../lib/supabase';
import { summarizeTeacherActivities } from '../utils/teacherActivitySummary';
import { countLateSubmissionsByStudent, isSubmissionLate } from '../utils/teacherStudentMetrics';

const REVIEWED_STATUSES = new Set(['reviewed', 'graded', 'completed']);
const SUBMITTED_STATUSES = new Set(['submitted', 'late', 'reviewed', 'graded', 'completed']);
const ASSIGNED_STATUSES = new Set(['assigned', 'pending', 'in_progress']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveStudentSubmissionState = ({
  assignmentStatus = '',
  submissionStatus = '',
  submittedAt = null,
  reviewedAt = null,
  dueDate = null,
} = {}) => {
  const normalizedAssignment = normalizeStatus(assignmentStatus);
  const normalizedSubmission = normalizeStatus(submissionStatus);
  const reviewed = Boolean(reviewedAt) || REVIEWED_STATUSES.has(normalizedSubmission);
  const submitted = Boolean(submittedAt) || SUBMITTED_STATUSES.has(normalizedSubmission) || reviewed;
  const due = parseDate(dueDate);
  const now = new Date();
  const overdue = Boolean(due && due < now);
  const late = submitted && isSubmissionLate({
    status: normalizedSubmission,
    submitted_at: submittedAt,
    due_date: dueDate,
  });

  if (reviewed) {
    return { status: 'reviewed', isSubmitted: true, isReviewed: true, isOverdue: false, isLate: late };
  }

  if (late) {
    return { status: 'late', isSubmitted: true, isReviewed: false, isOverdue: false, isLate: true };
  }

  if (submitted) {
    return { status: 'submitted', isSubmitted: true, isReviewed: false, isOverdue: false, isLate: false };
  }

  if (overdue) {
    return { status: 'overdue', isSubmitted: false, isReviewed: false, isOverdue: true, isLate: false };
  }

  if (ASSIGNED_STATUSES.has(normalizedAssignment)) {
    return { status: 'assigned', isSubmitted: false, isReviewed: false, isOverdue: false, isLate: false };
  }

  return { status: 'assigned', isSubmitted: false, isReviewed: false, isOverdue: false, isLate: false };
};

const getActiveStudentUserMap = async (studentIds) => {
  const uniqueIds = [...new Set((studentIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .in('id', uniqueIds)
    .eq('role', 'student');

  if (error) throw error;
  return new Map((data || []).map((student) => [student.id, student]));
};

const shouldUseVerifiedStudentMap = (studentIds, studentMap) => (
  (studentIds || []).some(Boolean) && studentMap.size > 0
);

const reviewStudentKey = (classId, studentId) => `${classId || ''}:${studentId || ''}`;

const hydrateReviewStudentIdentities = (submissions = [], enrollments = []) => {
  const enrollmentByClassAndStudent = new Map();
  const enrollmentByStudent = new Map();

  (enrollments || []).forEach((enrollment) => {
    const studentId = enrollment?.student_id;
    const name = String(enrollment?.student_name || '').trim();
    if (!studentId || !name) return;

    enrollmentByClassAndStudent.set(
      reviewStudentKey(enrollment.class_id, studentId),
      enrollment
    );
    if (!enrollmentByStudent.has(studentId)) {
      enrollmentByStudent.set(studentId, enrollment);
    }
  });

  return (submissions || []).map((submission) => {
    if (String(submission?.student?.name || '').trim()) return submission;

    const enrollment = enrollmentByClassAndStudent.get(
      reviewStudentKey(submission?.activity?.class_id, submission?.student_id)
    ) || enrollmentByStudent.get(submission?.student_id);

    if (!enrollment) return submission;

    return {
      ...submission,
      student: {
        ...(submission.student || {}),
        id: submission.student_id,
        name: enrollment.student_name,
        email: enrollment.student_email || submission?.student?.email || '',
      },
    };
  });
};

const getVerifiedOrEnrollmentStudentIds = async (enrollments) => {
  const studentIds = [...new Set((enrollments || []).map((row) => row.student_id).filter(Boolean))];
  if (studentIds.length === 0) return [];

  const studentMap = await getActiveStudentUserMap(studentIds);
  if (!shouldUseVerifiedStudentMap(studentIds, studentMap)) return studentIds;

  return studentIds.filter((studentId) => studentMap.has(studentId));
};

const getActiveEnrollmentCounts = async (classIds) => {
  const safeClassIds = [...new Set((classIds || []).filter(Boolean))];
  if (safeClassIds.length === 0) return new Map();

  const { data: enrollments, error } = await supabase
    .from('class_students')
    .select('class_id, student_id')
    .in('class_id', safeClassIds);

  if (error) throw error;

  const studentIds = (enrollments || []).map((row) => row.student_id);
  const studentMap = await getActiveStudentUserMap(studentIds);
  const canVerifyStudents = shouldUseVerifiedStudentMap(studentIds, studentMap);
  const studentsByClass = new Map();

  (enrollments || []).forEach((enrollment) => {
    if (canVerifyStudents && !studentMap.has(enrollment.student_id)) return;
    if (!studentsByClass.has(enrollment.class_id)) {
      studentsByClass.set(enrollment.class_id, new Set());
    }
    studentsByClass.get(enrollment.class_id).add(enrollment.student_id);
  });

  return new Map([...studentsByClass].map(([classId, studentSet]) => [classId, studentSet.size]));
};

// ==================== TEACHER PROFILE ====================

export const getTeacherProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching teacher profile:', error);
    return { success: false, error: error.message };
  }
};

export const createTeacherProfile = async (userId, profileData) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .insert([{
        user_id: userId,
        name: profileData.name,
        specialization: profileData.specialization
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error creating teacher profile:', error);
    return { success: false, error: error.message };
  }
};

export const updateTeacherProfile = async (teacherId, updates) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .update(updates)
      .eq('id', teacherId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating teacher profile:', error);
    return { success: false, error: error.message };
  }
};

// ==================== CLASSES ====================

export const getTeacherClasses = async (teacherId) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const classes = data || [];
    const activeEnrollmentCounts = await getActiveEnrollmentCounts(classes.map((klass) => klass.id));
    const classesWithLiveCounts = classes.map((klass) => ({
      ...klass,
      student_count: activeEnrollmentCounts.get(klass.id) || 0,
    }));

    return { success: true, data: classesWithLiveCounts };
  } catch (error) {
    console.error('Error fetching classes:', error);
    return { success: false, error: error.message };
  }
};

export const getClassById = async (classId) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('id', classId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching class:', error);
    return { success: false, error: error.message };
  }
};

export const createClass = async (teacherId, classData) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .insert([{
        teacher_id: teacherId,
        name: classData.name,
        grade: classData.grade,
        section: classData.section,
        subject: classData.subject,
        color: classData.color || '#1800AD'
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error creating class:', error);
    return { success: false, error: error.message };
  }
};

export const updateClass = async (classId, updates) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .update(updates)
      .eq('id', classId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating class:', error);
    return { success: false, error: error.message };
  }
};

export const deleteClass = async (classId) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .update({ is_active: false })
      .eq('id', classId)
      .select('id, is_active, disabled_at')
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error disabling class:', error);
    return { success: false, error: error.message };
  }
};

export const getClassStudents = async (classId) => {
  try {
    const { data, error } = await supabase
      .from('class_students')
      .select('id, class_id, student_id, student_name, student_email, enrolled_at')
      .eq('class_id', classId);

    if (error) throw error;
    
    const studentIds = (data || []).map((enrollment) => enrollment.student_id);
    const studentMap = await getActiveStudentUserMap(studentIds);
    const canVerifyStudents = shouldUseVerifiedStudentMap(studentIds, studentMap);

    // Transform to expected format
    const students = (data || [])
      .map(enrollment => {
        const student = studentMap.get(enrollment.student_id);
        if (canVerifyStudents && !student) return null;

        return {
          id: enrollment.student_id,
          name: student?.name || enrollment.student_name || 'Student',
          email: student?.email || enrollment.student_email || '',
          enrolled_at: enrollment.enrolled_at
        };
      })
      .filter(Boolean);
    
    return { success: true, data: students };
  } catch (error) {
    console.error('Error fetching class students:', error);
    return { success: false, error: error.message };
  }
};

export const getClassActivities = async (classId) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('class_id', classId)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching class activities:', error);
    return { success: false, error: error.message };
  }
};

export const addStudentToClass = async (classId, studentId) => {
  try {
    const { data, error } = await supabase
      .from('class_students')
      .insert([{ class_id: classId, student_id: studentId }])
      .select()
      .single();

    if (error) throw error;
    
    // Update student count
    await updateClassStudentCount(classId);
    
    return { success: true, data };
  } catch (error) {
    console.error('Error adding student to class:', error);
    return { success: false, error: error.message };
  }
};

export const enrollStudentToClassByEmail = async (classId, studentEmail) => {
  try {
    const email = String(studentEmail || '').trim().toLowerCase();
    if (!classId || !email) {
      return { success: false, error: 'Class and student email are required.' };
    }

    const { data, error } = await supabase.rpc('enroll_student_to_class', {
      p_class_id: classId,
      p_student_email: email,
    });

    if (error) throw error;

    return { success: true, data: data || null };
  } catch (error) {
    console.error('Error enrolling student to class:', error);
    return { success: false, error: error.message };
  }
};

export const removeStudentFromClass = async (classId, studentId) => {
  try {
    const { error } = await supabase
      .from('class_students')
      .delete()
      .eq('class_id', classId)
      .eq('student_id', studentId);

    if (error) throw error;
    
    // Update student count
    await updateClassStudentCount(classId);
    
    return { success: true };
  } catch (error) {
    console.error('Error removing student from class:', error);
    return { success: false, error: error.message };
  }
};

const updateClassStudentCount = async (classId) => {
  try {
    const activeEnrollmentCounts = await getActiveEnrollmentCounts([classId]);

    await supabase
      .from('classes')
      .update({ student_count: activeEnrollmentCounts.get(classId) || 0 })
      .eq('id', classId);
  } catch (error) {
    console.error('Error updating student count:', error);
  }
};

// ==================== STUDENTS ====================

export const getTeacherStudents = async (teacherId) => {
  try {
    // First get all class IDs for this teacher
    const { data: teacherClasses, error: classError } = await supabase
      .from('classes')
      .select('id, name, grade')
      .eq('teacher_id', teacherId)
      .eq('is_active', true);

    console.log('Teacher classes:', teacherClasses, classError);

    if (classError) throw classError;
    
    if (!teacherClasses || teacherClasses.length === 0) {
      return { success: true, data: [] };
    }

    const classIds = teacherClasses.map(c => c.id);

    // Get enrollments with student_name from class_students
    const { data: enrollments, error: enrollError } = await supabase
      .from('class_students')
      .select('student_id, class_id, student_name, student_email')
      .in('class_id', classIds);

    console.log('Enrollments:', enrollments, enrollError);

    if (enrollError) throw enrollError;
    
    if (!enrollments || enrollments.length === 0) {
      return { success: true, data: [] };
    }

    const enrollmentStudentIds = enrollments.map((enrollment) => enrollment.student_id);
    const activeStudentMap = await getActiveStudentUserMap(enrollmentStudentIds);
    const canVerifyStudents = shouldUseVerifiedStudentMap(enrollmentStudentIds, activeStudentMap);

    // Group by student
    const studentMap = new Map();
    enrollments.forEach(enrollment => {
      const student = activeStudentMap.get(enrollment.student_id);
      if (canVerifyStudents && !student) return;

      if (!studentMap.has(enrollment.student_id)) {
        studentMap.set(enrollment.student_id, {
          id: enrollment.student_id,
          name: student?.name || enrollment.student_name || 'Student',
          email: student?.email || enrollment.student_email || '',
          classes: []
        });
      }
      const classInfo = teacherClasses.find(c => c.id === enrollment.class_id);
      if (classInfo) {
        studentMap.get(enrollment.student_id).classes.push(classInfo);
      }
    });

    const studentIds = Array.from(studentMap.keys());
    if (studentIds.length === 0) {
      return { success: true, data: [] };
    }

    // Get pending assignments count for each student
    const { data: pendingAssignments } = await supabase
      .from('activity_assignments')
      .select('student_id, status')
      .in('student_id', studentIds)
      .in('status', ['assigned', 'pending', 'in_progress']);

    // Get submitted count for each student
    const { data: submissions } = await supabase
      .from('submissions')
      .select('student_id, status, submitted_at, activity:activities(due_date)')
      .in('student_id', studentIds);

    // Count per student
    const pendingCounts = {};
    const submittedCounts = {};
    const lateCounts = countLateSubmissionsByStudent(submissions || []);
    
    (pendingAssignments || []).forEach(a => {
      pendingCounts[a.student_id] = (pendingCounts[a.student_id] || 0) + 1;
    });
    
    (submissions || []).forEach(s => {
      if (['submitted', 'late', 'reviewed', 'graded', 'completed'].includes(String(s.status || '').toLowerCase())) {
        submittedCounts[s.student_id] = (submittedCounts[s.student_id] || 0) + 1;
      }
    });

    const result = Array.from(studentMap.values()).map(student => ({
      ...student,
      pendingCount: pendingCounts[student.id] || 0,
      submittedCount: submittedCounts[student.id] || 0,
      lateCount: lateCounts[student.id] || 0,
    }));

    console.log('Processed students with counts:', result);

    return { success: true, data: result };
  } catch (error) {
    console.error('Error fetching students:', error);
    return { success: false, error: error.message };
  }
};

export const getStudentDetails = async (studentId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', studentId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching student details:', error);
    return { success: false, error: error.message };
  }
};

export const getStudentSubmissions = async (studentId) => {
  try {
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select(`
        *,
        activity:activities(id, title, due_date)
      `)
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false });

    if (subError) throw subError;

    const { data: assignments, error: assignError } = await supabase
      .from('activity_assignments')
      .select(`
        *,
        activity:activities(id, title, due_date, description)
      `)
      .eq('student_id', studentId);

    if (assignError) throw assignError;

    const submittedActivityIds = (submissions || []).map(s => s.activity_id);
    const normalizedSubmissions = (submissions || []).map((s) => {
      const state = resolveStudentSubmissionState({
        submissionStatus: s.status,
        submittedAt: s.submitted_at,
        reviewedAt: s.reviewed_at,
        dueDate: s.activity?.due_date,
      });

      return {
        ...s,
        activity_title: s.activity?.title,
        due_date: s.activity?.due_date,
        status: state.status,
        raw_status: normalizeStatus(s.status),
        is_submitted: state.isSubmitted,
        is_reviewed: state.isReviewed,
        is_late: state.isLate,
        is_overdue: state.isOverdue,
      };
    });

    const normalizedAssignments = (assignments || [])
      .filter((a) => !submittedActivityIds.includes(a.activity_id))
      .map((a) => {
        const state = resolveStudentSubmissionState({
          assignmentStatus: a.status,
          dueDate: a.activity?.due_date,
        });

        return {
          id: a.id,
          activity_id: a.activity_id,
          student_id: a.student_id,
          status: state.status,
          raw_status: normalizeStatus(a.status),
          activity_title: a.activity?.title,
          due_date: a.activity?.due_date,
          is_submitted: state.isSubmitted,
          is_reviewed: state.isReviewed,
          is_late: state.isLate,
          is_overdue: state.isOverdue,
          assigned_at: a.assigned_at,
          submitted_at: null,
          reviewed_at: null,
        };
      });

    const allItems = [
      ...normalizedSubmissions,
      ...normalizedAssignments
    ];

    return { success: true, data: allItems };
  } catch (error) {
    console.error('Error fetching student submissions:', error);
    return { success: false, error: error.message };
  }
};

export const getStudentArtworks = async (studentId) => {
  try {
    const { data, error } = await supabase
      .from('artworks')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching student artworks:', error);
    return { success: false, error: error.message };
  }
};

// ==================== ACTIVITIES ====================

export const getTeacherActivities = async (teacherId) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select(`
        *,
        class:classes(id, name, grade, section)
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const activities = data || [];
    const activityIds = activities.map((activity) => activity.id).filter(Boolean);

    if (activityIds.length === 0) return { success: true, data: [] };

    const [assignmentResult, submissionResult] = await Promise.all([
      supabase
        .from('activity_assignments')
        .select('id, activity_id, student_id, status')
        .in('activity_id', activityIds),
      supabase
        .from('submissions')
        .select('id, activity_id, student_id, status, submitted_at, reviewed_at')
        .in('activity_id', activityIds),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (submissionResult.error) throw submissionResult.error;

    return {
      success: true,
      data: summarizeTeacherActivities(
        activities,
        assignmentResult.data || [],
        submissionResult.data || []
      ),
    };
  } catch (error) {
    console.error('Error fetching activities:', error);
    return { success: false, error: error.message };
  }
};

export const getActivityById = async (activityId) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select(`
        *,
        class:classes(id, name, grade, section)
      `)
      .eq('id', activityId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching activity:', error);
    return { success: false, error: error.message };
  }
};

export const createActivity = async (teacherIdOrPayload, activityDataInput) => {
  try {
    const isLegacySignature = typeof teacherIdOrPayload === 'string';
    const teacherId = isLegacySignature ? teacherIdOrPayload : teacherIdOrPayload?.teacher_id;
    const activityData = isLegacySignature ? (activityDataInput || {}) : (teacherIdOrPayload || {});

    if (!teacherId) {
      return { success: false, error: 'Missing teacher ID' };
    }

    const { data, error } = await supabase.rpc('create_activity_with_assignments', {
      p_teacher_id: teacherId,
      p_title: activityData.title,
      p_description: activityData.description || null,
      p_class_id: activityData.class_id || null,
      p_grade: activityData.grade || null,
      p_subject: activityData.subject || null,
      p_due_date: activityData.due_date || null,
      p_status: activityData.status || 'active',
      p_image_url: activityData.image_url || null,
      p_rubric_id: activityData.rubric_id || null,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error creating activity:', error);
    return { success: false, error: error.message };
  }
};

export const updateActivity = async (activityId, updates) => {
  try {
    const { data, error } = await supabase.rpc('update_activity_with_rubric', {
      p_activity_id: activityId,
      p_title: updates.title,
      p_description: updates.description || null,
      p_due_date: updates.due_date || null,
      p_image_url: updates.image_url || null,
      p_rubric_action: updates.rubric_action || 'keep',
      p_rubric_id: updates.rubric_id || null,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating activity:', error);
    return { success: false, error: error.message };
  }
};

export const deleteActivity = async (activityId) => {
  try {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', activityId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting activity:', error);
    return { success: false, error: error.message };
  }
};

export const assignActivityToStudents = async (activityId, studentIds) => {
  try {
    const assignments = studentIds.map(studentId => ({
      activity_id: activityId,
      student_id: studentId
    }));

    const { data, error } = await supabase
      .from('activity_assignments')
      .insert(assignments)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error assigning activity:', error);
    return { success: false, error: error.message };
  }
};

export const getActivitySubmissions = async (activityId) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        student:users!submissions_student_id_fkey(id, name, email)
      `)
      .eq('activity_id', activityId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching activity submissions:', error);
    return { success: false, error: error.message };
  }
};

export const getTeacherGestureAlerts = async (teacherId) => {
  try {
    if (!teacherId) {
      return { success: true, data: [] };
    }

    const { data, error } = await supabase.rpc('get_teacher_gesture_alerts', {
      p_teacher_id: teacherId,
    });

    if (error) throw error;

    const normalized = (data || []).map((row) => ({
      id: row.id,
      student_id: row.student_id,
      activity_id: row.activity_id,
      gesture_type: row.gesture_type,
      metadata: row.metadata || {},
      created_at: row.created_at,
      student: {
        id: row.student_id,
        name: row.student_name || 'Student',
        email: row.student_email || '',
      },
      activity: {
        id: row.activity_id,
        title: row.activity_title || 'Untitled activity',
        class: {
          name: row.class_name || 'No class',
          grade: row.class_grade || '',
          section: row.class_section || '',
        },
      },
    }));

    return { success: true, data: normalized };
  } catch (error) {
    console.error('Error fetching teacher gesture alerts:', error);
    return { success: false, error: error.message };
  }
};

export const getTeacherActivityLockAlerts = async (teacherId) => {
  try {
    if (!teacherId) return { success: true, data: [] };
    const { data, error } = await supabase
      .from('activity_lock_alerts')
      .select(`
        id, student_id, activity_id, event_type, metadata, created_at,
        student:users!activity_lock_alerts_student_id_fkey(id, name, email),
        activity:activities!activity_lock_alerts_activity_id_fkey(
          id, title, teacher_id, class:classes(id, name, grade, section)
        )
      `)
      .eq('activity.teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching teacher activity lock alerts:', error);
    return { success: false, error: error.message };
  }
};

// ==================== SUBMISSIONS/REVIEWS ====================

export const getAllSubmissions = async (teacherId) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        student:users!submissions_student_id_fkey(id, name, email),
        activity:activities!submissions_activity_id_fkey(
          id,
          title,
          description,
          due_date,
          teacher_id,
          class_id
        )
      `)
      .eq('activity.teacher_id', teacherId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const submissions = data || [];
    const unresolvedSubmissions = submissions.filter(
      (submission) => !String(submission?.student?.name || '').trim() && submission?.student_id
    );

    if (unresolvedSubmissions.length === 0) {
      return { success: true, data: submissions };
    }

    const studentIds = [...new Set(unresolvedSubmissions.map((submission) => submission.student_id))];
    const classIds = [...new Set(
      unresolvedSubmissions.map((submission) => submission.activity?.class_id).filter(Boolean)
    )];

    let enrollmentQuery = supabase
      .from('class_students')
      .select('class_id, student_id, student_name, student_email')
      .in('student_id', studentIds);

    if (classIds.length > 0) {
      enrollmentQuery = enrollmentQuery.in('class_id', classIds);
    }

    const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
    if (enrollmentError) throw enrollmentError;

    return {
      success: true,
      data: hydrateReviewStudentIdentities(submissions, enrollments || []),
    };
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return { success: false, error: error.message };
  }
};

export const getSubmissionById = async (submissionId) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        student:users!submissions_student_id_fkey(id, name, email),
        activity:activities!submissions_activity_id_fkey(id, title, due_date)
      `)
      .eq('id', submissionId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching submission:', error);
    return { success: false, error: error.message };
  }
};

export const gradeSubmission = async (submissionId, teacherId, gradeData, rubricEvidence = null) => {
  try {
    const { data, error } = await supabase.rpc('finalize_submission_review', {
      p_submission_id: submissionId,
      p_teacher_id: teacherId,
      p_score: gradeData.score,
      p_feedback: gradeData.feedback || '',
      p_observation: rubricEvidence?.observation || null,
      p_criteria: rubricEvidence?.criteria || [],
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error grading submission:', error);
    return { success: false, error: error.message };
  }
};

export const updateSubmissionStatus = async (submissionId, status) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .update({ status })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error updating submission status:', error);
    return { success: false, error: error.message };
  }
};

// ==================== DASHBOARD STATS ====================

export const getDashboardStats = async (teacherId) => {
  try {
    // First get all class IDs for this teacher
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('is_active', true);

    if (classError) throw classError;

    const classIds = (classes || []).map(c => c.id);

    // Get total unique students
    let studentCount = 0;
    if (classIds.length > 0) {
      const { data: enrollments, error: enrollError } = await supabase
        .from('class_students')
        .select('student_id')
        .in('class_id', classIds);
      
      if (enrollError) throw enrollError;
      
      const visibleStudentIds = await getVerifiedOrEnrollmentStudentIds(enrollments || []);
      studentCount = visibleStudentIds.length;
    }

    // Get pending reviews
    const { count: pendingReviews } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'late']);

    // Get upcoming deadlines (activities due in next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const { count: upcomingDeadlines } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .gte('due_date', new Date().toISOString())
      .lte('due_date', sevenDaysFromNow.toISOString());

    return {
      success: true,
      data: {
        totalStudents: studentCount || 0,
        pendingReviews: pendingReviews || 0,
        upcomingDeadlines: upcomingDeadlines || 0,
        parentAlerts: 0 // Placeholder for future feature
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return { success: false, error: error.message };
  }
};

export const getRecentSubmissions = async (teacherId, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        student:users!submissions_student_id_fkey(id, name),
        activity:activities!submissions_activity_id_fkey(
          id,
          title,
          teacher_id,
          class:classes(name)
        )
      `)
      .eq('activity.teacher_id', teacherId)
      .order('submitted_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching recent submissions:', error);
    return { success: false, error: error.message };
  }
};
