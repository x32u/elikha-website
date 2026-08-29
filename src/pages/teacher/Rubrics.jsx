import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { assignRubricToActivity, createRubric, deleteRubric, getTeacherRubrics } from '../../services/rubricApi';
import { getTeacherActivities } from '../../services/teacherApi';
import './Rubrics.css';

// Fixed developmental descriptors mirror the SF9 Kindergarten Progress Report's B/D/C approach.
const LEVELS = [
  { code: 'B', score: 1, label: 'Beginning', description: 'Rarely shows the skill and needs close guidance.' },
  { code: 'D', score: 2, label: 'Developing', description: 'Sometimes shows the skill with occasional prompts.' },
  { code: 'C', score: 3, label: 'Consistent', description: 'Regularly shows the skill and works independently.' },
];
const makeCriterion = (name = '') => ({ name, levels: LEVELS.map((level) => ({ ...level })) });
const STARTERS = {
  paint: ['Follows the activity sequence', 'Places colours or details in the intended area', 'Completes the required activity parts'],
  scene: ['Places the required objects', 'Arranges objects for the activity goal', 'Uses the AR controls needed for the task'],
  puzzle: ['Places puzzle pieces on the matching guide', 'Completes the puzzle', 'Uses the AR controls needed for the task'],
  blank: [''],
};
const copy = (value) => JSON.parse(JSON.stringify(value));

export default function Rubrics() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(sessionStorage.getItem('userInfo') || '{}'), []);
  const [rubrics, setRubrics] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityType, setActivityType] = useState('paint');
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState(() => STARTERS.paint.map(makeCriterion));
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

  const chooseStarter = (value) => { setActivityType(value); setCriteria(STARTERS[value].map(makeCriterion)); };
  const updateCriterion = (index, name) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item));
  const updateLevel = (criterionIndex, levelIndex, description) => setCriteria((items) => items.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, levels: item.levels.map((level, index) => index === levelIndex ? { ...level, description } : level) } : item));
  const addCriterion = () => setCriteria((items) => [...items, makeCriterion()]);
  const duplicate = (rubric) => { setTitle(`${rubric.title} (copy)`); setActivityType('blank'); setCriteria(copy(rubric.criteria || [makeCriterion()])); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save = async (event) => {
    event.preventDefault();
    const validCriteria = criteria.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim() }));
    if (!title.trim() || !validCriteria.length || validCriteria.some((item) => item.levels.some((level) => !level.description.trim()))) return alert('Enter a rubric name, at least one skill, and all B, D, and C descriptions.');
    setSaving(true);
    const result = await createRubric({ teacherId: user.id, title: title.trim(), description: 'SF9-style developmental observation checklist.', criteria: validCriteria, metadata: { isTemplate: true, assessmentStyle: 'SF9-kindergarten' } });
    setSaving(false);
    if (!result.success) return alert(`Could not save rubric: ${result.error}`);
    if (selectedActivityId) {
      const attachment = await assignRubricToActivity(selectedActivityId, result.data.id);
      if (!attachment.success) alert(`Rubric saved, but attachment failed: ${attachment.error}`);
    }
    setTitle(''); chooseStarter('paint'); setSelectedActivityId(''); await load();
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
    <header><h1>Kindergarten Rubrics</h1><p>Create an SF9-style progress rubric for an E-Likha activity. The saved rubric is the guide AI uses for its draft review.</p></header>
    <section className="rubric-form-card simple-rubric-form"><h2>Create rubric</h2>
      <div className="sf9-guide"><strong>DepEd SF9 – Kindergarten Progress Report basis.</strong><br />Use one observable skill per row. B, D, and C are developmental ratings: <b>Beginning</b> needs close guidance; <b>Developing</b> shows progress with minimal supervision; <b>Consistent</b> shows the skill regularly and independently.</div>
      <form onSubmit={save}>
        <div className="rubric-top-fields"><label>Activity type<select value={activityType} onChange={(event) => chooseStarter(event.target.value)}><option value="paint">AR painting / colouring</option><option value="scene">AR scene building</option><option value="puzzle">AR puzzle assembly</option><option value="blank">Start blank</option></select></label><label>Rubric name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Animal Model Colouring" /></label></div>
        <h3>Rubric table</h3><p className="rubric-tip">Enter the skills you will observe. These rows—and the fixed SF9 rating descriptions—become the AI’s basis for checking submitted work.</p>
        <div className="rubric-table-wrap"><table className="sf9-rubric-table"><thead><tr><th scope="col">Observable skill</th><th scope="col"><abbr title="Beginning">B</abbr><span>Beginning</span></th><th scope="col"><abbr title="Developing">D</abbr><span>Developing</span></th><th scope="col"><abbr title="Consistent">C</abbr><span>Consistent</span></th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{criteria.map((item, index) => <tr key={index}><td><input value={item.name} onChange={(event) => updateCriterion(index, event.target.value)} placeholder="e.g. Uses small hand movements to colour" aria-label={`Skill ${index + 1}`} /></td>{item.levels.map((level, levelIndex) => <td key={level.code}><textarea value={level.description} onChange={(event) => updateLevel(index, levelIndex, event.target.value)} aria-label={`${level.label} description for skill ${index + 1}`} rows="4" /></td>)}<td>{criteria.length > 1 && <button type="button" className="text-danger" onClick={() => setCriteria((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</td></tr>)}</tbody></table></div>
        <button type="button" className="secondary rubric-add" onClick={addCriterion}>+ Add skill row</button>
        <details className="attach-details"><summary>Attach this checklist to an activity now (optional)</summary><label>Activity<select value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)}><option value="">Attach later</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label></details>
        <button className="primary rubric-save" disabled={saving}>{saving ? 'Saving...' : selectedActivityId ? 'Save and attach rubric' : 'Save rubric'}</button>
      </form>
    </section>
    <section className="rubric-list"><h2>Saved rubrics</h2>{rubrics.length === 0 ? <p className="empty-state">No saved rubrics yet.</p> : rubrics.map((rubric) => <article className="rubric-card" key={rubric.id}><div><h3>{rubric.title}</h3><p>{(rubric.criteria || []).map((item) => item.name).join(' · ')}</p></div><div><button className="secondary" onClick={() => duplicate(rubric)}>Use as copy</button><button className="text-danger" onClick={() => remove(rubric.id)}>Delete</button></div></article>)}</section>
    <section className="rubric-form-card rubric-attachment-card">
      <h2>Attach a saved rubric</h2>
      <p>Choose the exact activity that should use this rubric for AI checking.</p>
      <form onSubmit={attachExisting}>
        <div className="rubric-top-fields">
          <label>Activity<select aria-label="Attachment activity" value={attachmentActivityId} onChange={(event) => { setAttachmentActivityId(event.target.value); setAttachmentMessage(''); }}><option value="">Choose activity</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title} — {activity.id.slice(0, 8)}</option>)}</select></label>
          <label>Saved rubric<select aria-label="Attachment rubric" value={attachmentRubricId} onChange={(event) => { setAttachmentRubricId(event.target.value); setAttachmentMessage(''); }}><option value="">Choose rubric</option>{rubrics.map((rubric) => <option value={rubric.id} key={rubric.id}>{rubric.title}</option>)}</select></label>
        </div>
        <button className="primary rubric-save" disabled={attaching}>{attaching ? 'Attaching...' : 'Attach rubric'}</button>
        {attachmentMessage && <p className="rubric-attachment-message" role="status">{attachmentMessage}</p>}
      </form>
    </section>
    <button className="secondary" onClick={() => navigate('/activities')}>View all activities</button>
  </main></div>;
}
