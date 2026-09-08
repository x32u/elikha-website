import { DEFAULT_AR_COLOR_PALETTE, sanitizeActivityColorPalette } from './arColorPalette';

const clean = (value, max = 120) => String(value || '').trim().slice(0, max);

const getPalette = (allowedColors) => allowedColors === undefined
  ? DEFAULT_AR_COLOR_PALETTE
  : sanitizeActivityColorPalette(allowedColors);

export const sanitizeColorRequirements = (requirements, allowedColors) => {
  const palette = getPalette(allowedColors);
  const paletteByHex = new Map(palette.map((color) => [color.hex, color]));
  const paletteByName = new Map(palette.map((color) => [String(color.name || '').toLowerCase(), color]));
  const seen = new Set();
  return (Array.isArray(requirements) ? requirements : [])
    .map((requirement) => {
      if (!requirement || typeof requirement !== 'object') return null;
      const targetType = requirement.targetType === 'object' ? 'object' : 'model';
      const targetId = clean(requirement.targetId, 160);
      if (!targetId) return null;
      const requestedHex = clean(requirement.colorHex, 7).toUpperCase();
      const requestedName = clean(requirement.colorName, 40).toLowerCase();
      const color = paletteByHex.get(requestedHex) || (requestedName ? paletteByName.get(requestedName) : null);
      if (!color) return null;
      const key = `${targetType}:${targetId}:${color.hex}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        targetType,
        targetId,
        targetLabel: clean(requirement.targetLabel || targetId),
        colorHex: color.hex,
        colorName: color.name || color.hex,
      };
    })
    .filter(Boolean)
    .slice(0, 24);
};

const colorsForSceneObject = (object) => {
  const colors = [];
  if (typeof object?.color === 'string') colors.push(object.color.toUpperCase());
  (Array.isArray(object?.paint) ? object.paint : []).forEach((mark) => {
    if (typeof mark?.color === 'string') colors.push(mark.color.toUpperCase());
  });
  return colors;
};

export const evaluateColorRequirements = ({ requirements, sceneState, paintState, allowedColors } = {}) => {
  const safeRequirements = sanitizeColorRequirements(requirements, allowedColors);
  const scene = Array.isArray(sceneState) ? sceneState : [];
  const paint = Array.isArray(paintState) ? paintState : [];
  const details = safeRequirements.map((requirement) => {
    const availableColors = requirement.targetType === 'object'
      ? scene
        .filter((object) => String(object?.objectId || '') === requirement.targetId)
        .flatMap(colorsForSceneObject)
      : paint
        .filter((mark) => !mark?.targetId || String(mark.targetId) === requirement.targetId)
        .map((mark) => String(mark?.color || '').toUpperCase());
    return {
      ...requirement,
      matched: availableColors.includes(requirement.colorHex),
    };
  });
  const matched = details.filter((item) => item.matched).length;
  const total = details.length;
  return {
    matched,
    total,
    accuracyPercent: total ? Number(((matched / total) * 100).toFixed(1)) : null,
    complete: total > 0 && matched === total,
    details,
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const detectColorRequirementsLocally = ({ instructions, targets, allowedColors } = {}) => {
  const text = String(instructions || '').toLowerCase();
  const safeTargets = Array.isArray(targets) ? targets : [];
  const results = [];
  safeTargets.forEach((target) => {
    const label = clean(target?.label || target?.id).toLowerCase();
    if (!label || !new RegExp(`\\b${escapeRegex(label)}s?\\b`, 'i').test(text)) return;
    getPalette(allowedColors).forEach((color) => {
      const aliases = [color.name, color.hex].filter(Boolean);
      if (aliases.some((alias) => text.includes(String(alias).toLowerCase()))) {
        results.push({
          targetType: target.type === 'object' ? 'object' : 'model',
          targetId: target.id,
          targetLabel: target.label || target.id,
          colorHex: color.hex,
          colorName: color.name || color.hex,
        });
      }
    });
  });
  return sanitizeColorRequirements(results, allowedColors);
};
