import {
  isGenericStudentName,
  resolveStudentDisplayName,
  studentNameFromEmail,
} from './studentIdentity';

describe('student identity display', () => {
  it('prefers the current admin-managed profile name', () => {
    expect(resolveStudentDisplayName({
      profileName: 'jcxxme',
      enrollmentName: 'Student',
      email: 'jcxxme@gmail.com',
    })).toBe('jcxxme');
  });

  it('falls back to the email username when stored names are generic', () => {
    expect(resolveStudentDisplayName({
      enrollmentName: 'Student',
      email: 'jcxxme@gmail.com',
    })).toBe('jcxxme');
    expect(studentNameFromEmail(' learner@example.com ')).toBe('learner');
    expect(isGenericStudentName('Student')).toBe(true);
  });
});
