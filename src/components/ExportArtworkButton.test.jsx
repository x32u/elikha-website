import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ExportArtworkButton from './ExportArtworkButton';
import { exportArtworkPng } from '../utils/exportArtworkPng';
jest.mock('../utils/exportArtworkPng', () => ({ exportArtworkPng: jest.fn() }));

test('disables missing images and reports failures without navigating away', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<ExportArtworkButton />));
  expect(container.querySelector('button').disabled).toBe(true);
  exportArtworkPng.mockRejectedValue(new Error('Connection failed. Try again.'));
  await act(async () => root.render(<ExportArtworkButton artworkUrl="https://example.test/art.jpg" filename="Cup" />));
  await act(async () => container.querySelector('button').click());
  expect(exportArtworkPng).toHaveBeenCalledWith('https://example.test/art.jpg', 'Cup');
  expect(container.querySelector('[role="status"]').textContent).toContain('Connection failed');
  expect(container.querySelector('button').disabled).toBe(false);
  await act(async () => root.unmount());
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
