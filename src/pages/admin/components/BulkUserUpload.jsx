import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createPlatformUsersBatch } from '../../../services/adminApi';
import { readBulkUserFile, bulkResultsCsv } from '../../../utils/bulkUsers';
import { formatClassOptionLabel } from '../../../utils/classLabels';
import '../styles/BulkUserUpload.css';

export default function BulkUserUpload({ users, classes, classesLoading, classesError, onClose, onComplete }) {
  const dialog = useRef(null);
  const fileInput = useRef(null);
  const busyRef = useRef(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    const warn = (event) => { if (busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); previous?.focus?.(); };
  }, []);
  const ready = rows.filter((r) => r.status === 'Ready');
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true); setError(''); setRows([]); setDone(false);
    try { setRows(await readBulkUserFile(file, users)); }
    catch (e) { setError(e.message || 'Could not read this file.'); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const confirm = async () => {
    if (busyRef.current || !ready.length) return;
    busyRef.current = true; setBusy(true); setError(''); setProgress(0); setTotal(ready.length);
    let next = [...rows];
    // Small server batches avoid timeouts. Never automatically retry uncertain writes.
    for (let start = 0; start < ready.length; start += 10) {
      const batch = ready.slice(start, start + 10);
      try {
        const results = await createPlatformUsersBatch(batch);
        next = next.map((row) => {
          const index = batch.findIndex((b) => b.rowNumber === row.rowNumber);
          if (index < 0) return row;
          const result = results.find((r) => r.index === index);
          return { ...row, password: '', status: result?.status || 'Unconfirmed', message: result?.message || 'Check User Management before retrying.' };
        });
      } catch {
        next = next.map((row) => batch.some((b) => b.rowNumber === row.rowNumber)
          ? { ...row, password: '', status: 'Unconfirmed', message: 'Connection or server error. Check User Management before retrying this email.' }
          : row.status === 'Ready' ? { ...row, password: '', status: 'Not attempted', message: 'Upload stopped after an error. Re-upload to try this row.' } : row);
        setError('Upload stopped. Some results are unconfirmed; check User Management before retrying.');
        break;
      }
      setRows(next); setProgress(Math.min(start + 10, ready.length));
    }
    setRows(next.map((r) => ({ ...r, password: '' })));
    busyRef.current = false; setBusy(false); setDone(true); onComplete();
  };
  const downloadResults = () => {
    const url = URL.createObjectURL(new Blob([bulkResultsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'elikha-user-upload-results.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return createPortal(<dialog ref={dialog} className="bulk-users" aria-labelledby="bulk-title" onCancel={(e) => { e.preventDefault(); if (!busy && !reading) onClose(); }}>
    <header><div><h2 id="bulk-title">{done ? 'Upload results' : 'Bulk add users'}</h2><p>Review each user and choose student classes before confirming.</p></div>
      <button type="button" onClick={onClose} disabled={busy || reading} aria-label="Close bulk upload">×</button></header>
    <div className="bulk-body">
      <div className="bulk-instructions"><strong>Four columns: email, password, name, role</strong>
        <p>Up to 100 students or teachers per file. Fill in a unique password (8–128 characters) for each user.</p>
        <details><summary>File requirements and password safety</summary><p>Use plain-text cells on the first Excel sheet. Replace template examples with your users. Share files securely and delete them after use. Passwords are hidden from the preview and results.</p></details>
        <nav aria-label="Upload templates"><a className="bulk-template-button" href="/templates/elikha-users.xlsx" download>Download Excel template</a><a className="bulk-template-button" href="/templates/elikha-users.csv" download>Download CSV template</a></nav>
      </div>
      <label className="bulk-file">Choose Excel or CSV<input ref={fileInput} type="file" accept=".csv,.xlsx" onChange={upload} disabled={busy || reading} /></label>
      {reading && <p role="status">Reading file…</p>}
      {error && <p role="alert" className="bulk-error">{error}</p>}
      {classesError && <p role="alert">Classes could not be loaded. You may create accounts without a class and enroll them later.</p>}
      {rows.length > 0 && <>
        <p role="status">{done ? `${rows.filter((r) => r.status === 'Created').length} created · ${rows.filter((r) => r.status !== 'Created').length} not created or unconfirmed`
          : busy ? `Processed ${progress} of ${total} users. Keep this window open.` : `${ready.length} users ready to add · ${rows.length - ready.length} excluded`}</p>
        <div className="bulk-table-wrap" tabIndex="0" role="region" aria-label="User upload preview"><table><thead><tr><th>No.</th><th>Name</th><th>Email</th><th>Role</th><th>Class / Section</th><th>Status</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.rowNumber}><td>{index + 1}</td><td>{row.name || '—'}</td><td>{row.email || '—'}</td><td>{row.role || '—'}</td><td>{row.role === 'student' ?
            <select aria-label={`Class for ${row.name || row.email || `row ${row.rowNumber}`}`} value={row.classId} disabled={busy || done || classesLoading || row.status !== 'Ready'} onChange={(e) => setRows((current) => current.map((r) => r.rowNumber === row.rowNumber ? { ...r, classId: e.target.value } : r))}>
              <option value="">{classesLoading ? 'Loading classes…' : 'No class yet'}</option>{classes.map((c) => <option key={c.id} value={c.id}>{formatClassOptionLabel(c)}</option>)}</select> : 'Not applicable'}</td>
            <td><strong>{row.status}</strong>{row.message && <small>{row.message}</small>}</td></tr>)}</tbody></table></div>
        {!done && <p>Only ready rows will be added. Existing accounts are not changed. Class enrollment is optional.</p>}
      </>}
    </div>
    <footer><button type="button" onClick={onClose} disabled={busy || reading}>{done ? 'Close' : 'Cancel'}</button>
      {done ? <button type="button" onClick={downloadResults}>Download results (no passwords)</button> : <button className="bulk-confirm" type="button" disabled={busy || reading || !ready.length} onClick={confirm}>{busy ? 'Adding users…' : `Confirm & Add ${ready.length} Users`}</button>}</footer>
  </dialog>, document.body);
}
