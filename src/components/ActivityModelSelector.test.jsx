import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ActivityModelSelector from './ActivityModelSelector';

const MODELS = [
  { id: 'cactus', label: 'Cactus' },
  { id: 'elephant', label: 'Elephant' },
  { id: 'tree', label: 'Maple Tree' },
];

const SelectorHarness = () => {
  const [modelIds, setModelIds] = useState(['cactus']);
  return (
    <>
      <ActivityModelSelector modelOptions={MODELS} modelIds={modelIds} onChange={setModelIds} />
      <output data-testid="selected-model-ids">{modelIds.join(',')}</output>
    </>
  );
};

describe('ActivityModelSelector', () => {
  let container;
  let root;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => root.render(<SelectorHarness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelector('.model-library-modal__overlay')?.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps the activity form compact and adds searched models through the library', async () => {
    expect(container.textContent).toContain('Cactus');
    expect(container.textContent).not.toContain('Elephant');

    const openButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Add 3D Models');
    await act(async () => openButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const dialog = document.querySelector('.model-library-modal');
    expect(dialog).not.toBeNull();
    const search = dialog.querySelector('input[type="search"]');
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      valueSetter.call(search, 'elephant');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(dialog.textContent).toContain('Elephant');
    expect(dialog.textContent).not.toContain('Maple Tree');

    await act(async () => {
      dialog.querySelector('input[type="checkbox"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const applyButton = Array.from(dialog.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Save Model Selection');
    await act(async () => applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.querySelector('[data-testid="selected-model-ids"]').textContent).toBe('cactus,elephant');
    expect(container.textContent).toContain('Elephant');
  });

  it('removes a quantity-one model while preserving at least one selected model', async () => {
    const openButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Add 3D Models');
    await act(async () => openButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const dialog = document.querySelector('.model-library-modal');
    const elephantCheckbox = Array.from(dialog.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Elephant'))
      .querySelector('input');
    await act(async () => elephantCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const applyButton = Array.from(dialog.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Save Model Selection');
    await act(async () => applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const decreaseCactus = container.querySelector('button[aria-label="Decrease Cactus quantity"]');
    await act(async () => decreaseCactus.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.querySelector('[data-testid="selected-model-ids"]').textContent).toBe('elephant');
    expect(container.textContent).not.toContain('Cactus');
  });
});
