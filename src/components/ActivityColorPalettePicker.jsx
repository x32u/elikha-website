import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AR_COLOR_PALETTE,
  MAX_ACTIVITY_COLORS,
  normalizeHexColor,
  sanitizeActivityColorPalette,
} from '../utils/arColorPalette';
import './ActivityColorPalettePicker.css';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const hsvToHex = (h, s, v) => {
  const chroma = v * s;
  const section = (h / 60) % 6;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0]
    : section < 3 ? [0, chroma, x] : section < 4 ? [0, x, chroma]
      : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return `#${[r1, g1, b1].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

const hexToHsv = (hex) => {
  const safe = normalizeHexColor(hex) || '#7F56D9';
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(safe.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  let hue = 0;
  if (delta) hue = max === r ? 60 * (((g - b) / delta) % 6)
    : max === g ? 60 * (((b - r) / delta) + 2) : 60 * (((r - g) / delta) + 4);
  return { h: hue < 0 ? hue + 360 : hue, s: max ? delta / max : 0, v: max };
};

const suggestedName = (hex) => DEFAULT_AR_COLOR_PALETTE.find((color) => color.hex === hex)?.name || '';

const ActivityColorPalettePicker = ({ value = [], onChange }) => {
  const palette = useMemo(() => sanitizeActivityColorPalette(value), [value]);
  const [hsv, setHsv] = useState(() => hexToHsv('#7F56D9'));
  const [opacity, setOpacity] = useState(100);
  const [hexDraft, setHexDraft] = useState('#7F56D9');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const squareRef = useRef(null);
  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  const loadColor = useCallback((color) => {
    setHsv(hexToHsv(color.hex)); setHexDraft(color.hex); setName(color.name || ''); setNotice('');
  }, []);

  const setFromSquare = useCallback((clientX, clientY) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = { ...hsv, s: clamp((clientX - rect.left) / rect.width), v: 1 - clamp((clientY - rect.top) / rect.height) };
    setHsv(next); setHexDraft(hsvToHex(next.h, next.s, next.v));
  }, [hsv]);

  const onSquarePointer = (event) => {
    event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    setFromSquare(event.clientX, event.clientY);
  };
  const onSquareKeyDown = (event) => {
    const directions = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = { ...hsv, s: clamp(hsv.s + direction[0]), v: clamp(hsv.v + direction[1]) };
    setHsv(next); setHexDraft(hsvToHex(next.h, next.s, next.v));
  };
  const onHexChange = (event) => {
    const draft = event.target.value.toUpperCase(); setHexDraft(draft);
    const normalized = normalizeHexColor(draft);
    if (normalized) { setHsv(hexToHsv(normalized)); setNotice(''); }
  };
  const add = () => {
    const hex = normalizeHexColor(hexDraft) || currentHex;
    if (palette.some((color) => color.hex === hex)) { setNotice('That color is already in this palette.'); return; }
    if (palette.length >= MAX_ACTIVITY_COLORS) { setNotice('Maximum reached: an activity can use up to 10 colors.'); return; }
    onChange?.([...palette, { hex, ...(name.trim() || suggestedName(hex) ? { name: name.trim() || suggestedName(hex) } : {}) }]);
    setNotice(palette.length + 1 >= MAX_ACTIVITY_COLORS ? 'Maximum of 10 colors reached.' : 'Color added.');
  };
  const remove = (hex) => {
    onChange?.(palette.filter((color) => color.hex !== hex)); setNotice('Color removed.');
  };

  return (
    <section className="activity-palette" aria-labelledby="activity-palette-title">
      <div className="activity-palette__intro">
        <div><strong id="activity-palette-title">Activity color palette</strong><small>Choose up to 10 colors. This order is used in the learner’s AR toolbar.</small></div>
        <span className="activity-palette__count">{palette.length}/10</span>
      </div>
      <div className="activity-palette__picker">
        <div
          ref={squareRef} className="activity-palette__square" role="slider" tabIndex="0"
          aria-label="Color saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(hsv.s * 100)} aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
          style={{ '--picker-hue': hsvToHex(hsv.h, 1, 1) }}
          onPointerDown={onSquarePointer} onPointerMove={(event) => event.currentTarget.hasPointerCapture?.(event.pointerId) && setFromSquare(event.clientX, event.clientY)}
          onKeyDown={onSquareKeyDown}
        >
          <span className="activity-palette__handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div className="activity-palette__controls">
          <label className="activity-palette__range-label">Hue
            <input className="activity-palette__hue" type="range" min="0" max="359" value={Math.round(hsv.h)} onChange={(event) => {
              const next = { ...hsv, h: Number(event.target.value) }; setHsv(next); setHexDraft(hsvToHex(next.h, next.s, next.v));
            }} />
          </label>
          <label className="activity-palette__range-label">Preview opacity
            <span className="activity-palette__opacity-track"><input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></span>
          </label>
          <div className="activity-palette__fields">
            <span className="activity-palette__format">Hex</span>
            <label className="activity-palette__hex"><span className="activity-palette__preview" style={{ backgroundColor: currentHex, opacity: opacity / 100 }} /><span className="sr-only">Hex color</span><input value={hexDraft} maxLength="7" onChange={onHexChange} aria-invalid={!normalizeHexColor(hexDraft)} /></label>
            <output className="activity-palette__percent">{opacity}%</output>
          </div>
          <label className="activity-palette__name">Color name <span>(optional)</span><input value={name} maxLength="40" placeholder="e.g. Ocean blue" onChange={(event) => setName(event.target.value)} /></label>
        </div>
      </div>
      <div className="activity-palette__saved-head"><strong>Added colors</strong><button type="button" onClick={add} disabled={palette.length >= MAX_ACTIVITY_COLORS || !normalizeHexColor(hexDraft)}>+ Add</button></div>
      <div className="activity-palette__saved" aria-label="Added activity colors">
        {palette.length ? palette.map((color) => (
          <span className="activity-palette__saved-item" key={color.hex}>
            <button type="button" className="activity-palette__swatch" style={{ backgroundColor: color.hex }} onClick={() => loadColor(color)} aria-label={`Edit ${color.name || color.hex}`} title={color.name || color.hex} />
            <button type="button" className="activity-palette__delete" onClick={() => remove(color.hex)} aria-label={`Remove ${color.name || color.hex}`}>×</button>
          </span>
        )) : <span className="activity-palette__empty">No colors added yet.</span>}
      </div>
      {palette.length >= 8 && palette.length < 10 && <p className="activity-palette__warning" role="status">You are close to the 10-color limit.</p>}
      {palette.length >= 10 && <p className="activity-palette__warning" role="status">Maximum reached: remove a color before adding another.</p>}
      {notice && <p className="activity-palette__notice" role="status">{notice}</p>}
    </section>
  );
};

export default ActivityColorPalettePicker;
