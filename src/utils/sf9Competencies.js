/**
 * DepEd SF9 Kindergarten Progress Report competencies.
 *
 * Transcribed from the school's own three-term SF9 form (Kindergarten
 * Curriculum Guide). Ratings are the form's three developmental levels; the
 * indicator bullets are copied verbatim from its "IMPORTANT NOTE TO
 * PARENTS/GUARDIANS" rating scale so a rubric a teacher builds here uses the
 * same words she has to defend to a parent.
 *
 * `AR_OBSERVABLE_COMPETENCIES` is the subset an e-Likha AR submission can
 * honestly evidence, and each entry records WHICH AR capability provides the
 * evidence. What the AR actually offers:
 *   - paint, paint bucket, and eraser on a model surface, 16 fixed colors,
 *     brush size 1-10
 *   - place and move primitives (cube, sphere, cone, cylinder) and 3D models
 *     (mask, cactus, tree, paper cup, button, flower, lion, popsicle stick,
 *     torii shrine, sarcophagus, sakura tree, sphinx, bottle)
 *   - assemble a 3 or 4 piece puzzle onto matching guides
 *   - hand-tracked pointing, open palm, and thumbs-up gestures
 *
 * Deliberately EXCLUDED, with reasons:
 *   - I.4 "Moves body parts as directed". This is about the child moving their
 *     own body on instruction. Dragging a 3D object across the screen is a
 *     different skill, and claiming it would misreport what happened.
 *   - I.5 fine motor "(tearing, cutting, rolling, molding with playdough)".
 *     Every example in the form is physical manipulation of real materials.
 *     The AR has no tearing, cutting, rolling, or molding, so a rubric row
 *     claiming this competency would be reporting something that did not
 *     happen. AR hand control is a different skill from scissor control.
 *   - III.3 describing objects and all of domain IV except writing/tracing.
 *     These need the child to speak or write; the app captures neither.
 *   - III.8 patterns. There is no pattern task in the AR and no pattern to
 *     extend. The saved state records object positions, not whether a sequence
 *     repeats, so any pattern rating would be inferred rather than observed.
 *   - Domain II socio-emotional entirely. Participation, following rules, and
 *     respecting others' feelings are live classroom observations and cannot be
 *     inferred from an image of an artwork.
 */

export const SF9_RATINGS = Object.freeze([
  Object.freeze({
    code: 'CO',
    label: 'Consistent',
    indicators: Object.freeze([
      'Always demonstrates the expected competency',
      'Always participates in the different activities, works independently',
      'Always performs tasks, advanced in some aspects',
    ]),
  }),
  Object.freeze({
    code: 'DV',
    label: 'Developing',
    indicators: Object.freeze([
      'Sometimes demonstrates the competency',
      'Sometimes participates, minimal supervision',
      'Progresses continuously in doing assigned tasks',
    ]),
  }),
  Object.freeze({
    code: 'BG',
    label: 'Beginning',
    indicators: Object.freeze([
      'Rarely demonstrates the expected competency',
      'Rarely participates in class activities and/or initiates independent works',
      'Shows interest in doing tasks but needs close supervision',
    ]),
  }),
]);

/** Ratings a teacher may record, including the two non-judgement outcomes. */
export const SF9_RATING_CODES = Object.freeze(['CO', 'DV', 'BG', 'NO', 'NA']);

export const SF9_RATING_LABELS = Object.freeze({
  CO: 'Consistent',
  DV: 'Developing',
  BG: 'Beginning',
  NO: 'Not observed',
  NA: 'Not applicable',
});

/** Legacy single-letter codes written before the SF9 alignment. */
export const LEGACY_RATING_ALIASES = Object.freeze({
  C: 'CO',
  D: 'DV',
  B: 'BG',
});

export const SF9_DOMAINS = Object.freeze({
  I: 'Sensory Perceptual and Motor Development',
  II: 'Socio-emotional Development',
  III: 'Cognitive Development',
  IV: 'Language, Literacy, and Communication Development',
});

/**
 * Competencies an AR art submission can evidence.
 *
 * `arEvidence` names the capability that supplies the evidence, so a teacher
 * can see why the competency is offered and an activity without that capability
 * can be excluded.
 */
export const AR_OBSERVABLE_COMPETENCIES = Object.freeze([
  Object.freeze({
    code: 'III.1',
    domain: 'III',
    text: 'Identifies attributes of objects (color, shape, size)',
    suggestedCriterion: 'Chooses colours and shapes that suit the activity',
    arEvidence: '16-colour palette, brush sizes 1-10, and cube/sphere/cone/cylinder shapes.',
    activityTypes: ['paint', 'scene', 'puzzle'],
  }),
  Object.freeze({
    code: 'III.2',
    domain: 'III',
    text: 'Matches objects based on attributes',
    suggestedCriterion: 'Matches each puzzle piece to its guide',
    arEvidence: 'Puzzle pieces snap onto matching guides (3 or 4 pieces).',
    activityTypes: ['puzzle', 'scene'],
  }),
  Object.freeze({
    code: 'III.5',
    domain: 'III',
    text: 'Classifies objects by a single attribute (color, shape, size)',
    suggestedCriterion: 'Groups the placed objects by one shared feature',
    arEvidence: 'Multiple primitives and models can be placed and grouped in a scene.',
    activityTypes: ['scene'],
  }),
  Object.freeze({
    code: 'III.7',
    domain: 'III',
    text: 'Arranges objects according to specific attributes',
    suggestedCriterion: 'Arranges the objects in the layout the activity asks for',
    arEvidence: 'Move and grab tools reposition placed objects in the scene.',
    activityTypes: ['scene', 'puzzle'],
  }),
  Object.freeze({
    code: 'III.10',
    domain: 'III',
    text: 'Identifies position of objects (in, on, over, under, top, bottom)',
    suggestedCriterion: 'Places each part in the correct position on the model',
    arEvidence: 'Saved AR state records the position of every placed object and piece.',
    activityTypes: ['scene', 'puzzle', 'paint'],
  }),
  Object.freeze({
    code: 'IV.G.24',
    domain: 'IV',
    text: 'Traces/draws/copies shapes, designs, pictures',
    suggestedCriterion: 'Fills the shapes and designs of the model with colour',
    arEvidence: 'Paint and paint-bucket tools colour the model surface; eraser corrects it.',
    activityTypes: ['paint'],
  }),
]);

/**
 * Competencies from the form that the AR cannot evidence, kept so the builder
 * can explain the omission instead of silently offering a shorter list.
 */
export const AR_EXCLUDED_COMPETENCIES = Object.freeze([
  Object.freeze({
    code: 'I.4',
    domain: 'I',
    text: 'Moves body parts as directed',
    reason: 'This is about the child moving their own body. Moving a 3D object on screen is not the same skill. Observe this in class.',
  }),
  Object.freeze({
    code: 'I.5',
    domain: 'I',
    text: 'Demonstrates fine motor skills (tearing, cutting, rolling, molding with playdough)',
    reason: 'The AR has no tearing, cutting, rolling, or molding. Observe this with real materials in class.',
  }),
  Object.freeze({
    code: 'III.8',
    domain: 'III',
    text: 'Recognizes, extends and create patterns using concrete objects',
    reason: 'The AR has no pattern task and no pattern to extend. It records object positions, not whether a sequence repeats, so a pattern rating would be guesswork.',
  }),
  Object.freeze({
    code: 'III.3',
    domain: 'III',
    text: 'Describes objects based on attributes (shape, color, taste, texture)',
    reason: 'Describing is spoken. The app does not record the child speaking.',
  }),
  Object.freeze({
    code: 'II.*',
    domain: 'II',
    text: 'Socio-emotional competencies',
    reason: 'Participation, routines, and respecting others need live classroom observation.',
  }),
]);

export const findArCompetency = (code) =>
  AR_OBSERVABLE_COMPETENCIES.find((competency) => competency.code === code) || null;

/** Competencies worth offering for one activity type. */
export const competenciesForActivityType = (activityType) =>
  AR_OBSERVABLE_COMPETENCIES.filter((competency) =>
    !activityType || competency.activityTypes.includes(activityType));

/** Normalizes any stored rating (legacy 'B' or SF9 'BG') to its SF9 code. */
export const toSf9RatingCode = (value) => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return '';
  const mapped = LEGACY_RATING_ALIASES[code] || code;
  return SF9_RATING_CODES.includes(mapped) ? mapped : '';
};

export const sf9RatingLabel = (value) => SF9_RATING_LABELS[toSf9RatingCode(value)] || '';

/** Builds the default three-level rating set for a new rubric row. */
export const makeSf9Levels = () => SF9_RATINGS.map((rating) => ({
  code: rating.code,
  label: rating.label,
  indicators: [...rating.indicators],
  description: rating.indicators.join(' '),
}));
