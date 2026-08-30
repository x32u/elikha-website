import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { assignRubricToActivity, createRubric, deleteRubric, getTeacherRubrics } from '../../services/rubricApi';
import { getTeacherActivities } from '../../services/teacherApi';
import {
  AR_EXCLUDED_COMPETENCIES,
  SF9_DOMAINS,
  SF9_RATINGS,
  competenciesForActivityType,
  findArCompetency,
  makeSf9Levels,
} from '../../utils/sf9Competencies';
import './Rubrics.css';

const makeCriterion = (name = '', competencyCode = '') => {
  const competency = findArCompetency(competencyCode);
  return {
    name,
    domain: competency?.domain || '',
    competencyCode: competency?.code || '',
    competencyText: competency?.text || '',
    levels: makeSf9Levels(),
  };
};

const fromCompetency = (code) => {
  const competency = findArCompetency(code);
  return makeCriterion(competency?.suggestedCriterion || '', code);
};

// Starter sets are per activity type, limited to competencies the AR can
// actually evidence for that type: a colouring activity and a puzzle show
// different things, so one shared rubric cannot judge both.
const STARTERS = {
  paint: ['IV.G.24', 'III.1', 'III.10'],
  scene: ['III.7', 'III.10', 'III.5'],
  puzzle: ['III.2', 'III.10', 'III.7'],
  blank: [],
};

const ACTIVITY_TYPE_LABELS = {
  paint: 'AR painting / colouring',
  scene: 'AR scene building / loose parts',
  puzzle: 'AR puzzle assembly',
  blank: 'Start blank',
};

const copy = (value) => JSON.parse(JSON.stringify(value));

const buildStarter = (type) => {
  const codes = STARTERS[type] || [];
  return codes.length ? codes.map(fromCompetency) : [makeCriterion()];
};

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
  const [activityType, setActivityType] = useState('paint');
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState(() => buildStarter('paint'));
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

  const chooseStarter = (value) => { setActivityType(value); setCriteria(buildStarter(value)); };
  const updateCriterion = (index, patch) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const chooseCompetency = (index, code) => {
    const competency = findArCompetency(code);
    updateCriterion(index, {
      domain: competency?.domain || '',
      competencyCode: competency?.code || '',
      competencyText: competency?.text || '',
      name: criteria[index]?.name?.trim() ? criteria[index].name : (competency?.suggestedCriterion || ''),
    });
  };
  const updateLevel = (criterionIndex, levelIndex, description) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, levels: item.levels.map((level, index) => index === levelIndex ? { ...level, description } : level) } : item));
  const addCriterion = () => setCriteria((items) => [...items, makeCriterion()]);
  const duplicate = (rubric) => { setTitle(`${rubric.title} (copy)`); setActivityType('blank'); setCriteria(copy(rubric.criteria || [makeCriterion()])); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const attachmentWarning = useMemo(() => {
    const rubric = rubrics.find((item) => item.id === attachmentRubricId);
    const activity = activities.find((item) => item.id === attachmentActivityId);
    return rubric && activity ? findSubjectMismatch(rubric, activity, activities) : '';
  }, [rubrics, activities, attachmentRubricId, attachmentActivityId]);

  const save = async (event) => {
    event.preventDefault();
    const validCriteria = criteria.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim() }));
    if (!title.trim() || !validCriteria.length || validCriteria.some((item) => item.levels.some((level) => !level.description.trim()))) return alert('Enter a rubric name, at least one skill, and all Beginning, Developing, and Consistent descriptions.');
    setSaving(true);
    const result = await createRubric({
      teacherId: user.id,
      title: title.trim(),
      description: 'DepEd SF9 developmental observation checklist.',
      criteria: validCriteria,
      metadata: { isTemplate: true, assessmentStyle: 'SF9-kindergarten', ratingScale: 'BG-DV-CO', activityType },
    });
    setSaving(false);
    if (!result.success) return alert(`Could not save rubric: ${result.error}`);
    if (selectedActivityId) {
      const attachment = await assignRubricToActivity(selectedActivityId, result.data.id);
      if (!attachment.success) alert(`Rubric saved, but attachment failed: ${attachment.error}`);
    }
    setTitle(''); chooseStarter(activityType); setSelectedActivityId(''); await load();
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
    <header><h1>Kindergarten Rubrics</h1><p>Create a DepEd SF9 progress rubric for one E-Likha activity. The saved rubric is the guide AI uses for its draft review.</p></header>
    <section className="rubric-form-card simple-rubric-form"><h2>Create rubric</h2>
      <form onSubmit={save}>
        <div className="rubric-top-fields"><label>Activity type<select value={activityType} onChange={(event) => chooseStarter(event.target.value)}>{Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Rubric name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cactus Colouring" /></label></div>
        <h3>Rubric table</h3><p className="rubric-tip">Enter the skills you will observe in <b>this</b> activity. These rows—and the SF9 rating indicators—become the AI’s basis for checking submitted work. Only competencies the AR can actually show are offered.</p>
        <details className="excluded-details"><summary>Competencies to observe in class instead</summary><ul>{AR_EXCLUDED_COMPETENCIES.map((competency) => <li key={competency.code}><b>{competency.code}</b> {competency.text}<br /><small>{competency.reason}</small></li>)}</ul></details>
        <div className="rubric-table-wrap"><table className="sf9-rubric-table"><thead><tr>
          <th scope="col">Observable skill</th>
          {SF9_RATINGS.map((rating) => <th scope="col" key={rating.code}><abbr title={rating.label}>{rating.code}</abbr><span>{rating.label}</span></th>)}
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead><tbody>{criteria.map((item, index) => <tr key={index}>
          <td>
            <input value={item.name} onChange={(event) => updateCriterion(index, { name: event.target.value })} placeholder="e.g. Uses small hand movements to colour" aria-label={`Skill ${index + 1}`} />
            <select className="competency-select" value={item.competencyCode || ''} onChange={(event) => chooseCompetency(index, event.target.value)} aria-label={`DepEd competency for skill ${index + 1}`}>
              <option value="">No competency tagged</option>
              {competenciesForActivityType(activityType === 'blank' ? '' : activityType).map((competency) => <option value={competency.code} key={competency.code}>{competency.code} — {competency.text}</option>)}
            </select>
            {item.competencyCode && <small className="competency-note">{SF9_DOMAINS[item.domain]}{findArCompetency(item.competencyCode)?.arEvidence ? ` · ${findArCompetency(item.competencyCode).arEvidence}` : ''}</small>}
          </td>
          {item.levels.map((level, levelIndex) => <td key={level.code}><textarea value={level.description} onChange={(event) => updateLevel(index, levelIndex, event.target.value)} aria-label={`${level.label} description for skill ${index + 1}`} rows="4" /></td>)}
          <td>{criteria.length > 1 && <button type="button" className="text-danger" onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</td>
        </tr>)}</tbody></table></div>
        <button type="button" className="secondary rubric-add" onClick={addCriterion}>+ Add skill row</button>
        <details className="attach-details"><summary>Attach this checklist to an activity now (optional)</summary><label>Activity<select value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)}><option value="">Attach later</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label></details>
        <button className="primary rubric-save" disabled={saving}>{saving ? 'Saving...' : selectedActivityId ? 'Save and attach rubric' : 'Save rubric'}</button>
      </form>
    </section>
    <section className="rubric-list"><h2>Saved rubrics</h2>{rubrics.length === 0 ? <p className="empty-state">No saved rubrics yet.</p> : rubrics.map((rubric) => <article className="rubric-card" key={rubric.id}><div><h3>{rubric.title}</h3><p>{(rubric.criteria || []).map((item) => item.competencyCode ? `${item.competencyCode} ${item.name}` : item.name).join(' · ')}</p></div><div><button className="secondary" onClick={() => duplicate(rubric)}>Use as copy</button><button className="text-danger" onClick={() => remove(rubric.id)}>Delete</button></div></article>)}</section>
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
