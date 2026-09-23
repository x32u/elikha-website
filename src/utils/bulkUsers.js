import { normalizeWorkbook } from './normalizeWorkbook';
export const BULK_HEADERS = ['email', 'password', 'name', 'role'];
export const BULK_LIMIT = 100;

export function parseUserCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const input = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell) throw new Error('Invalid CSV quoting. Use the template.');
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell); cell = '';
      if (c !== ',') {
        rows.push(row); row = [];
        if (c === '\r' && input[i + 1] === '\n') i++;
      }
    } else cell += c;
    if (rows.length > BULK_LIMIT + 1) throw new Error('Upload at most 100 users at a time.');
  }
  if (quoted) throw new Error('Unclosed quote in CSV.');
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

export function validateUserRows(matrix, existingUsers = []) {
  const headers = (matrix[0] || []).map((v) => String(v).trim().toLowerCase());
  if (headers.length !== 4 || new Set(headers).size !== 4 || !BULK_HEADERS.every((h) => headers.includes(h))) {
    throw new Error('Use exactly these four headers: email, password, name, role.');
  }
  const data = matrix.slice(1).map((values, i) => ({ values, rowNumber: i + 2 })).filter(({ values }) => values.some((v) => String(v ?? '').trim()));
  if (!data.length || data.length > BULK_LIMIT) throw new Error('Include between 1 and 100 users.');
  const existing = new Set(existingUsers.map((u) => String(u.email).trim().toLowerCase()));
  const seen = new Set();
  return data.map(({ values, rowNumber }) => {
    const raw = Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? '')]));
    const row = { rowNumber, email: raw.email.trim().toLowerCase(), password: raw.password, name: raw.name.trim(), role: raw.role.trim().toLowerCase(), classId: '' };
    const problems = [];
    if (values.length > 4) problems.push('Unexpected extra columns');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) || row.email.length > 254) problems.push('Invalid email');
    if (!row.name || row.name.length > 120) problems.push('Name must be 1–120 characters');
    if (row.password.length < 8 || row.password.length > 128) problems.push('Password must be 8–128 characters');
    if (!['student', 'teacher'].includes(row.role)) problems.push('Role must be Student or Teacher');
    if (seen.has(row.email)) problems.push('Duplicate email in file');
    seen.add(row.email);
    if (existing.has(row.email)) problems.push('Account already exists');
    return { ...row, status: problems.length ? 'Excluded' : 'Ready', message: problems.join('; ') };
  });
}

export async function readBulkUserFile(file, users) {
  if (file.size > 1024 * 1024) throw new Error('File must be 1 MB or smaller.');
  if (/\.csv$/i.test(file.name)) return validateUserRows(parseUserCsv(await file.text()), users);
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx) or CSV file.');
  const ExcelJS = await import('exceljs');
  const workbook = new (ExcelJS.default || ExcelJS).Workbook();
  try {
    await workbook.xlsx.load(await normalizeWorkbook(await file.arrayBuffer()));
  } catch {
    throw new Error('Could not read this Excel workbook. Save it as a new .xlsx file or export it as CSV, then try again.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > BULK_LIMIT + 1 || sheet.columnCount > 4) throw new Error('Use the first sheet with four columns and at most 100 users.');
  const matrix = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    matrix.push([1, 2, 3, 4].map((c) => {
      const value = sheet.getRow(r).getCell(c).value;
      if (value !== null && typeof value === 'object') throw new Error(`Row ${r}: use plain text, not formulas, dates, or links.`);
      return value == null ? '' : String(value);
    }));
  }
  return validateUserRows(matrix, users);
}

export function bulkResultsCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
  };
  return [['row', 'email', 'name', 'role', 'class_id', 'status', 'message'], ...rows.map((r) => [r.rowNumber, r.email, r.name, r.role, r.classId, r.status, r.message])].map((r) => r.map(escape).join(',')).join('\r\n');
}
