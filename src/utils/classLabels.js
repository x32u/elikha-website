export const formatGradeLabel = (grade) => {
  const value = String(grade || '').trim();
  if (!value) return '';
  return /^grade\b/i.test(value) ? value : `Grade ${value}`;
};

export const formatClassLabel = (classInfo) => {
  if (!classInfo) return 'No class assigned';

  const grade = formatGradeLabel(classInfo.grade);
  const section = String(classInfo.section || '').trim();
  const name = String(classInfo.name || '').trim();

  if (grade && section) return `${grade} - ${section}`;
  if (grade && name && name.toLowerCase() !== grade.toLowerCase()) return name;
  if (grade) return grade;
  if (section) return section;
  return name || 'No class assigned';
};

export const formatStudentClassLabel = (classes = []) => {
  const classList = Array.isArray(classes) ? classes.filter(Boolean) : [];
  if (classList.length === 0) return 'No class assigned';

  return formatClassLabel(classList[0]);
};

export const formatClassOptionLabel = (classInfo) => {
  if (!classInfo) return 'Unknown class';

  const classLabel = formatClassLabel(classInfo);
  const subject = String(classInfo.subject || '').trim();
  const name = String(classInfo.name || '').trim();
  const teacher = String(classInfo.teacher_name || '').trim();
  const pieces = [classLabel];

  if (name && name !== classLabel) pieces.push(name);
  if (subject && subject !== name) pieces.push(subject);
  if (teacher && teacher !== 'Unassigned Teacher') pieces.push(`Teacher: ${teacher}`);

  return pieces.join(' - ');
};
