import {
  AR_EXCLUDED_COMPETENCIES,
  AR_OBSERVABLE_COMPETENCIES,
  LEGACY_RATING_ALIASES,
  SF9_DOMAINS,
  SF9_RATINGS,
  SF9_RATING_CODES,
  competenciesForActivityType,
  findArCompetency,
  makeSf9Levels,
  sf9RatingLabel,
  toSf9RatingCode,
} from './sf9Competencies';

describe('SF9 rating scale', () => {
  test('carries the three developmental levels from the DepEd form', () => {
    expect(SF9_RATINGS.map((rating) => rating.code)).toEqual(['CO', 'DV', 'BG']);
    expect(SF9_RATINGS.map((rating) => rating.label))
      .toEqual(['Consistent', 'Developing', 'Beginning']);
  });

  test('carries the three verbatim indicators for every level', () => {
    SF9_RATINGS.forEach((rating) => {
      expect(rating.indicators).toHaveLength(3);
      rating.indicators.forEach((indicator) => expect(indicator.trim()).not.toBe(''));
    });
  });

  test('quotes the form wording for Beginning', () => {
    const beginning = SF9_RATINGS.find((rating) => rating.code === 'BG');
    expect(beginning.indicators[0]).toBe('Rarely demonstrates the expected competency');
  });

  test('allows the two non-judgement outcomes alongside the three levels', () => {
    expect(SF9_RATING_CODES).toEqual(['CO', 'DV', 'BG', 'NO', 'NA']);
  });
});

describe('toSf9RatingCode', () => {
  test('maps legacy single letters to SF9 codes', () => {
    expect(toSf9RatingCode('B')).toBe('BG');
    expect(toSf9RatingCode('D')).toBe('DV');
    expect(toSf9RatingCode('C')).toBe('CO');
  });

  test('passes SF9 codes through, case-insensitively', () => {
    expect(toSf9RatingCode('bg')).toBe('BG');
    expect(toSf9RatingCode('CO')).toBe('CO');
    expect(toSf9RatingCode('NO')).toBe('NO');
    expect(toSf9RatingCode('NA')).toBe('NA');
  });

  test('rejects anything that is not a rating', () => {
    expect(toSf9RatingCode('X')).toBe('');
    expect(toSf9RatingCode('')).toBe('');
    expect(toSf9RatingCode(null)).toBe('');
    expect(toSf9RatingCode(3)).toBe('');
  });

  test('covers every legacy alias', () => {
    Object.entries(LEGACY_RATING_ALIASES).forEach(([legacy, sf9]) => {
      expect(toSf9RatingCode(legacy)).toBe(sf9);
    });
  });
});

describe('sf9RatingLabel', () => {
  test('labels both legacy and SF9 codes', () => {
    expect(sf9RatingLabel('B')).toBe('Beginning');
    expect(sf9RatingLabel('BG')).toBe('Beginning');
    expect(sf9RatingLabel('NO')).toBe('Not observed');
    expect(sf9RatingLabel('NA')).toBe('Not applicable');
  });

  test('returns an empty label for unknown input', () => {
    expect(sf9RatingLabel('Z')).toBe('');
  });
});

describe('AR observable competencies', () => {
  test('every entry names a real SF9 domain', () => {
    AR_OBSERVABLE_COMPETENCIES.forEach((competency) => {
      expect(Object.keys(SF9_DOMAINS)).toContain(competency.domain);
    });
  });

  test('every entry states which AR capability provides the evidence', () => {
    AR_OBSERVABLE_COMPETENCIES.forEach((competency) => {
      expect(competency.text.trim()).not.toBe('');
      expect(competency.suggestedCriterion.trim()).not.toBe('');
      expect(competency.arEvidence.trim()).not.toBe('');
      expect(competency.activityTypes.length).toBeGreaterThan(0);
    });
  });

  test('excludes socio-emotional competencies that an image cannot evidence', () => {
    expect(AR_OBSERVABLE_COMPETENCIES.some((competency) => competency.domain === 'II')).toBe(false);
  });

  test('offers no competency the AR cannot actually evidence', () => {
    ['I.4', 'I.5', 'III.3', 'III.8'].forEach((code) => {
      expect(AR_OBSERVABLE_COMPETENCIES.some((competency) => competency.code === code)).toBe(false);
      expect(AR_EXCLUDED_COMPETENCIES.some((competency) => competency.code === code)).toBe(true);
    });
  });

  test('offers nothing that depends on patterns, speech, or the child\u2019s own body', () => {
    const offered = AR_OBSERVABLE_COMPETENCIES
      .map((competency) => `${competency.text} ${competency.suggestedCriterion}`)
      .join(' ')
      .toLowerCase();

    ['pattern', 'describe', 'body part', 'tear', 'cut', 'roll', 'mold', 'playdough'].forEach((word) => {
      expect(offered).not.toContain(word);
    });
  });

  test('offers no Domain I competency at all, since the AR moves objects not bodies', () => {
    expect(AR_OBSERVABLE_COMPETENCIES.some((competency) => competency.domain === 'I')).toBe(false);
  });

  test('records I.4, I.5, and III.8 as excluded with reasons', () => {
    const reasonFor = (code) => AR_EXCLUDED_COMPETENCIES.find((item) => item.code === code);
    expect(reasonFor('I.4').reason).toContain('own body');
    expect(reasonFor('I.5').reason).toContain('real materials');
    expect(reasonFor('III.8').reason).toContain('no pattern task');
  });

  test('codes are unique and findable', () => {
    const codes = AR_OBSERVABLE_COMPETENCIES.map((competency) => competency.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(findArCompetency('IV.G.24').text).toBe('Traces/draws/copies shapes, designs, pictures');
    expect(findArCompetency('I.5')).toBeNull();
    expect(findArCompetency('II.1')).toBeNull();
  });
});

describe('competenciesForActivityType', () => {
  test('offers puzzle matching only where a puzzle exists', () => {
    const paintCodes = competenciesForActivityType('paint').map((item) => item.code);
    const puzzleCodes = competenciesForActivityType('puzzle').map((item) => item.code);
    expect(puzzleCodes).toContain('III.2');
    expect(paintCodes).not.toContain('III.2');
  });

  test('offers tracing only for painting activities', () => {
    expect(competenciesForActivityType('paint').map((item) => item.code)).toContain('IV.G.24');
    expect(competenciesForActivityType('puzzle').map((item) => item.code)).not.toContain('IV.G.24');
  });

  test('returns everything when no type is given', () => {
    expect(competenciesForActivityType()).toHaveLength(AR_OBSERVABLE_COMPETENCIES.length);
  });
});

describe('makeSf9Levels', () => {
  test('builds an editable copy of the three levels', () => {
    const levels = makeSf9Levels();
    expect(levels.map((level) => level.code)).toEqual(['CO', 'DV', 'BG']);
    levels[0].indicators.push('mutated');
    expect(SF9_RATINGS[0].indicators).toHaveLength(3);
  });

  test('gives each level a prefilled description built from its indicators', () => {
    makeSf9Levels().forEach((level) => {
      expect(level.description.trim()).not.toBe('');
    });
  });
});
