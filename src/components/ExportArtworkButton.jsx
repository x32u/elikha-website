import React, { useRef, useState } from 'react';
import { exportArtworkPng } from '../utils/exportArtworkPng';
import './ExportArtworkButton.css';

export default function ExportArtworkButton({ artworkUrl, filename }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const exportImage = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await exportArtworkPng(artworkUrl, filename);
      setMessage('PNG download started.');
    } catch (error) {
      setMessage(error.message || 'PNG export failed. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <span className="artwork-export">
    <button type="button" className="artwork-export-button" onClick={exportImage}
      disabled={busy || !artworkUrl} aria-busy={busy}
      title={!artworkUrl ? 'No saved artwork image is available' : 'Download the submitted artwork as PNG'}>
      {busy ? 'Exporting…' : 'Export PNG'}
    </button>
    <span className="artwork-export-message" role="status">{message || (!artworkUrl ? 'No saved artwork image available.' : '')}</span>
  </span>;
}
