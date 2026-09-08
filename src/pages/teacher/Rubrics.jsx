import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { assignRubricToActivity, createRubric, deleteRubric, getTeacherRubrics } from '../../services/rubricApi';
import { getTeacherActivities } from '../../services/teacherApi';
import {
  RUBRIC_RATINGS,
  makeRubricLevels,
  toRubricRatingCode,
} from '../../utils/rubricRatings';
import './Rubrics.css';

const makeCriterion = (name = '') => ({ name, levels: makeRubricLevels() });

const ACTIVITY_TYPE_LABELS = {
  general: 'General / not specified',
  paint: 'Painting / coloring',
  scene: 'Creative scene building',
  puzzle: 'Puzzle assembly',
};

const STARTER_CRITERIA = Object.freeze({
  general: Object.freeze([]),
  paint: Object.freeze([
    'Follows the activity’s color instructions',
    'Applies color carefully to the intended areas',
    'Completes the requested coloring details',
  ]),
  scene: Object.freeze([
    'Selects objects that fit the activity instructions',
    'Arranges objects in the requested positions',
    'Creates a complete and recognizable scene',
  ]),
  puzzle: Object.freeze([
    'Matches each puzzle piece to its correct location',
    'Positions and connects the puzzle pieces accurately',
    'Completes the puzzle with growing independence',
  ]),
});

const buildStarterCriteria = (activityType) => {
  const names = STARTER_CRITERIA[activityType] || [];
  return names.length ? names.map((name) => makeCriterion(name)) : [makeCriterion()];
};

const copyForPrivateRubric = (criterion = {}) => ({
  name: String(criterion.name || ''),
  levels: makeRubricLevels().map((defaultLevel) => {
    const savedLevel = (Array.isArray(criterion.levels) ? criterion.levels : [])
      .find((level) => toRubricRatingCode(level?.code) === defaultLevel.code);
    return {
      ...defaultLevel,
      description: String(savedLevel?.description || '').trim() || defaultLevel.description,
    };
  }),
});

const titleWords = (value) => new Set(String(value || '').toLowerCase().match(/[a-z]{4,}/g) || []);

/**
 * Flags a rubric that looks like it was written for a different activity.
 *
 * A robot rubric was attached to the Cactus, puzzle, and mask activities in
 * production, and the AI graded a cactus on whether it was a recognizable
 * robot. Rather than guessing which words in a criterion are the subject, this
 * scores every one of the teacher's activities by how much of its title the
 * criteria echo. If another activity scores higher than the one being attached,
 * the rubric is named after that activity instead — which is the sentence a
 * teacher can act on. Craft words like "colour" or "layout" appear in no
 * activity title, so subject-neutral criteria raise no false alarm.
 */
export const findSubjectMismatch = (rubric, activity, allActivities = []) => {
  if (!activity?.title) return '';

  const criteriaWords = titleWords(
    (rubric?.criteria || []).map((criterion) => criterion?.name || '').join(' '),
  );
  if (criteriaWords.size === 0) return '';

  const overlap = (candidate) =>
    [...titleWords(candidate?.title)].filter((word) => criteriaWords.has(word)).length;

  const ownOverlap = overlap(activity);
  const bestOther = allActivities
    .filter((item) => item?.id !== activity?.id && item?.title !== activity?.title)
    .map((item) => ({ item, score: overlap(item) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!bestOther || bestOther.score === 0 || bestOther.score <= ownOverlap) return '';

  return `These criteria look like they were written for “${bestOther.item.title}”, not “${activity.title}”. Check that this rubric matches the activity before attaching it.`;
};

export default function Rubrics() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(sessionStorage.getItem('userInfo') || '{}'), []);
  const [rubrics, setRubrics] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityType, setActivityType] = useState('general');
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState(() => [makeCriterion()]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachmentActivityId, setAttachmentActivityId] = useState('');
  const [attachmentRubricId, setAttachmentRubricId] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState('');

  const load = useCallback(async () => {
    const [rubricResult, activityResult] = await Promise.all([getTeacherRubrics(user.id), getTeacherActivities(user.id)]);
    if (rubricResult.success) setRubrics(rubricResult.data);
    if (activityResult.success) setActivities(activityResult.data);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const updateCriterion = (index, patch) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateLevel = (criterionIndex, levelIndex, description) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, levels: item.levels.map((level, index) => index === levelIndex ? { ...level, description } : level) } : item));
  const addCriterion = () => setCriteria((items) => [...items, makeCriterion()]);
  const chooseActivityType = (nextType) => {
    setActivityType(nextType);
    setCriteria(buildStarterCriteria(nextType));
  };
  const duplicate = (rubric) => {
    setTitle(`${rubric.title} (copy)`);
    const savedType = rubric?.metadata?.activityType;
    setActivityType(ACTIVITY_TYPE_LABELS[savedType] ? savedType : 'general');
    const savedCriteria = Array.isArray(rubric.criteria) && rubric.criteria.length
      ? rubric.criteria
      : [makeCriterion()];
    setCriteria(savedCriteria.map(copyForPrivateRubric));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const attachmentWarning = useMemo(() => {
    const rubric = rubrics.find((item) => item.id === attachmentRubricId);
    const activity = activities.find((item) => item.id === attachmentActivityId);
    return rubric && activity ? findSubjectMismatch(rubric, activity, activities) : '';
  }, [rubrics, activities, attachmentRubricId, attachmentActivityId]);

  const save = async (event) => {
    event.preventDefault();
    const validCriteria = criteria.filter((item) => item.name.trim()).map((item) => ({
      name: item.name.trim(),
      levels: item.levels.map((level) => ({
        code: toRubricRatingCode(level.code),
        label: level.label,
        description: level.description.trim(),
      })),
    }));
    if (!title.trim() || !validCriteria.length || validCriteria.some((item) => item.levels.some((level) => !level.description.trim()))) return alert('Enter a rubric name, at least one skill, and all Beginning, Developing, and Consistent descriptions.');
    setSaving(true);
    const result = await createRubric({
      teacherId: user.id,
      title: title.trim(),
      description: 'Teacher-created private-school activity rubric.',
      criteria: validCriteria,
      metadata: { version: 2, isTemplate: true, assessmentStyle: 'private-school', ratingScale: 'BG-DV-CO', activityType },
    });
    setSaving(false);
    if (!result.success) return alert(`Could not save rubric: ${result.error}`);
    if (selectedActivityId) {
      const attachment = await assignRubricToActivity(selectedActivityId, result.data.id);
      if (!attachment.success) alert(`Rubric saved, but attachment failed: ${attachment.error}`);
    }
    setTitle(''); setCriteria(buildStarterCriteria(activityType)); setSelectedActivityId(''); await load();
  };
  const remove = async (id) => { if (window.confirm('Delete this unused rubric? Rubrics already attached to activities are protected to preserve grading history.')) { const result = await deleteRubric(id); if (!result.success) alert(result.error); else load(); } };
  const attachExisting = async (event) => {
    event.preventDefault();
    setAttachmentMessage('');
    if (!attachmentActivityId || !attachmentRubricId) {
      setAttachmentMessage('Choose both an activity and a saved rubric.');
      return;
    }
    setAttaching(true);
    const result = await assignRubricToActivity(attachmentActivityId, attachmentRubricId);
    setAttaching(false);
    if (!result.success) {
      setAttachmentMessage(`Could not attach rubric: ${result.error}`);
      return;
    }
    setAttachmentMessage('Rubric attached. The saved snapshot will now be used for AI checking.');
  };

  return <div className="rubrics-page"><Navbar /><main className="rubrics-content">
    <header><span className="rubric-mode-badge">Private-school rubric</span><h1>Flexible Rubrics</h1><p>Write the skills that matter for each activity. The saved criteria and level descriptions guide the AI draft and the teacher’s final review.</p></header>
    <section className="rubric-form-card simple-rubric-form"><h2>Create rubric</h2>
      <form onSubmit={save}>
        <div className="rubric-top-fields"><label>Activity type <small>(loads an editable starter)</small><select value={activityType} onChange={(event) => chooseActivityType(event.target.value)}>{Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Rubric name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cactus Coloring" /></label></div>
        <h3>Rubric criteria</h3><p className="rubric-tip">Choose an activity type to preload suggested criteria, then edit, remove, or add anything you need. The suggestions never use fixed curriculum codes.</p>
        <div className="rubric-table-wrap"><table className="rubric-level-table"><thead><tr>
          <th scope="col">Observable skill / criterion</th>
          {RUBRIC_RATINGS.map((rating) => <th scope="col" key={rating.code}><span>{rating.label}</span><small>{rating.defaultDescription}</small></th>)}
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead><tbody>{criteria.map((item, index) => <tr key={index}>
          <td>
            <textarea className="criterion-input" value={item.name} onChange={(event) => updateCriterion(index, { name: event.target.value })} placeholder="e.g. Colors the flower petals using the colors named in the instructions" aria-label={`Observable criterion ${index + 1}`} rows="4" />
          </td>
          {item.levels.map((level, levelIndex) => <td key={level.code}><textarea value={level.description} onChange={(event) => updateLevel(index, levelIndex, event.target.value)} aria-label={`${level.label} description for skill ${index + 1}`} rows="4" /></td>)}
          <td>{criteria.length > 1 && <button type="button" className="text-danger" onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</td>
        </tr>)}</tbody></table></div>
        <button type="button" className="secondary rubric-add" onClick={addCriterion}>+ Add criterion</button>
        <details className="attach-details"><summary>Attach this rubric to an activity now (optional)</summary><label>Activity<select value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)}><option value="">Attach later</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label></details>
        <button className="primary rubric-save" disabled={saving}>{saving ? 'Saving...' : selectedActivityId ? 'Save and attach rubric' : 'Save rubric'}</button>
      </form>
    </section>
    <section className="rubric-list"><h2>Saved rubrics</h2>{rubrics.length === 0 ? <p className="empty-state">No saved rubrics yet.</p> : rubrics.map((rubric) => <article className="rubric-card" key={rubric.id}><div><h3>{rubric.title}</h3><p>{(rubric.criteria || []).map((item) => item.name).filter(Boolean).join(' · ')}</p></div><div><button className="secondary" onClick={() => duplicate(rubric)}>Use as copy</button><button className="text-danger" onClick={() => remove(rubric.id)}>Delete</button></div></article>)}</section>
    <section className="rubric-form-card rubric-attachment-card">
      <h2>Attach a saved rubric</h2>
      <p>Choose the exact activity that should use this rubric for AI checking.</p>
      <form onSubmit={attachExisting}>
        <div className="rubric-top-fields">
          <label>Activity<select aria-label="Attachment activity" value={attachmentActivityId} onChange={(event) => { setAttachmentActivityId(event.target.value); setAttachmentMessage(''); }}><option value="">Choose activity</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title} — {activity.id.slice(0, 8)}</option>)}</select></label>
          <label>Saved rubric<select aria-label="Attachment rubric" value={attachmentRubricId} onChange={(event) => { setAttachmentRubricId(event.target.value); setAttachmentMessage(''); }}><option value="">Choose rubric</option>{rubrics.map((rubric) => <option value={rubric.id} key={rubric.id}>{rubric.title}</option>)}</select></label>
        </div>
        {attachmentWarning && <p className="rubric-mismatch-warning" role="alert">{attachmentWarning}</p>}
        <button className="primary rubric-save" disabled={attaching}>{attaching ? 'Attaching...' : 'Attach rubric'}</button>
        {attachmentMessage && <p className="rubric-attachment-message" role="status">{attachmentMessage}</p>}
      </form>
    </section>
    <button className="secondary" onClick={() => navigate('/activities')}>View all activities</button>
  </main></div>;
}
