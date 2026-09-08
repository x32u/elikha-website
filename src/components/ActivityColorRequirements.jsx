import React, { useEffect, useMemo, useState } from 'react';
import { sanitizeActivityColorPalette } from '../utils/arColorPalette';
import { AR_OBJECT_LIBRARY } from '../utils/activityArConfig';
import { detectActivityColorRequirements } from '../services/activityInstructionAiApi';
import { sanitizeColorRequirements } from '../utils/activityColorRequirements';
import './ActivityColorRequirements.css';

const ActivityColorRequirements = ({
  instructions = '', allowedObjectIds = [], modelIds = [], modelOptions = [], allowedColors = [], value = [], onChange,
}) => {
  const [detecting, setDetecting] = useState(false);
  const [notice, setNotice] = useState('');
  const targets = useMemo(() => {
    const objects = AR_OBJECT_LIBRARY
      .filter((item) => allowedObjectIds.includes(item.id))
      .map((item) => ({ type: 'object', id: item.id, label: item.label }));
    const modelsById = new Map(modelOptions.map((item) => [item.id, item]));
    const models = [...new Set(modelIds)].map((id) => ({
      type: 'model', id, label: modelsById.get(id)?.label || id,
    }));
    return [...objects, ...models];
  }, [allowedObjectIds, modelIds, modelOptions]);
  const palette = useMemo(() => sanitizeActivityColorPalette(allowedColors), [allowedColors]);

  const update = (requirements) => onChange?.(sanitizeColorRequirements(requirements, palette));
  useEffect(() => {
    const cleaned = sanitizeColorRequirements(value, palette);
    if (JSON.stringify(cleaned) !== JSON.stringify(value)) onChange?.(cleaned);
  }, [palette, value, onChange]);
  const add = () => {
    const target = targets[0];
    const color = palette[0];
    if (!target || !color) return;
    update([...value, {
      targetType: target.type, targetId: target.id, targetLabel: target.label,
      colorHex: color.hex, colorName: color.name,
    }]);
  };
  const change = (index, field, raw) => {
    const next = [...value];
    if (field === 'target') {
      const target = targets.find((item) => `${item.type}:${item.id}` === raw);
      if (target) next[index] = { ...next[index], targetType: target.type, targetId: target.id, targetLabel: target.label };
    } else {
      const color = palette.find((item) => item.hex === raw);
      if (color) next[index] = { ...next[index], colorHex: color.hex, colorName: color.name };
    }
    update(next);
  };
  const detect = async () => {
    setDetecting(true); setNotice('');
    const result = await detectActivityColorRequirements({ instructions, targets, allowedColors: palette });
    setDetecting(false);
    if (result.data?.length) {
      update(result.data);
      setNotice(`${result.data.length} target${result.data.length === 1 ? '' : 's'} found. Review them before saving.`);
    } else setNotice(result.error || 'No clear target and color pair was found. Add one manually.');
  };

  return (
    <section className="activity-color-requirements" aria-label="Expected colors">
      <div className="activity-color-requirements__heading">
        <div><strong>Expected colors</strong><small>Optional. Used for objective color accuracy in Insights.</small></div>
        <button type="button" onClick={detect} disabled={detecting || !instructions.trim() || !targets.length || !palette.length}>
          {detecting ? 'Checking…' : 'Detect from instructions'}
        </button>
      </div>
      {value.map((requirement, index) => (
        <div className="activity-color-requirements__row" key={`${index}-${requirement.targetId}-${requirement.colorHex}`}>
          <select value={`${requirement.targetType}:${requirement.targetId}`} onChange={(e) => change(index, 'target', e.target.value)}>
            {targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}
          </select>
          <fieldset className="activity-color-requirements__swatches">
            <legend className="sr-only">Expected color for {requirement.targetLabel}</legend>
            {palette.map((color) => <label key={color.hex} title={color.name || color.hex}>
              <input type="radio" name={`expected-color-${index}`} value={color.hex} checked={requirement.colorHex === color.hex} onChange={(e) => change(index, 'color', e.target.value)} />
              <span style={{ backgroundColor: color.hex }} /><em>{color.name || color.hex}</em>
            </label>)}
          </fieldset>
          <button type="button" className="activity-color-requirements__remove" onClick={() => update(value.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>
      ))}
      {!palette.length && <p className="activity-color-requirements__empty">Add colors to the palette first.</p>}
      <button type="button" className="activity-color-requirements__add" onClick={add} disabled={!targets.length || !palette.length}>+ Add color target</button>
      {notice && <p className="activity-color-requirements__notice" role="status">{notice}</p>}
    </section>
  );
};

export default ActivityColorRequirements;
