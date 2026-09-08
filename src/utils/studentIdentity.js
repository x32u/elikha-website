const clean = (value) => String(value || '').trim();

export const isGenericStudentName = (value) => {
  const normalized = clean(value).toLowerCase();
  return !normalized || normalized === 'student' || normalized === 'student user' || normalized === 'learner';
};

export const studentNameFromEmail = (email) => {
  const localPart = clean(email).split('@')[0]?.trim();
  return localPart || '';
};

export const resolveStudentDisplayName = ({
  profileName,
  enrollmentName,
  email,
} = {}) => {
  const currentName = clean(profileName);
  if (!isGenericStudentName(currentName)) return currentName;

  const snapshotName = clean(enrollmentName);
  if (!isGenericStudentName(snapshotName)) return snapshotName;

  return studentNameFromEmail(email) || 'Student';
};
