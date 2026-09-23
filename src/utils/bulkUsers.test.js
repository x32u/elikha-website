import { parseUserCsv, validateUserRows, bulkResultsCsv, readBulkUserFile } from './bulkUsers';
import fs from 'fs';
import path from 'path';
const header = ['email','password','name','role'];
test('reads the downloadable namespace-prefixed Excel template', async () => {
  const buffer = fs.readFileSync(path.join(process.cwd(), 'public/templates/elikha-users.xlsx'));
  const rows = await readBulkUserFile({name:'users.xlsx',size:buffer.length,arrayBuffer:async()=>buffer}, []);
  expect(rows).toHaveLength(2);
  expect(rows[0].email).toBe('student@example.com');
  expect(rows[0].message).toContain('Password');
});
test('corrupt workbook gives actionable error, not parser internals', async () => {
  await expect(readBulkUserFile({name:'bad.xlsx',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3])}, [])).rejects.toThrow('Save it as a new .xlsx');
});
test('CSV preserves passwords, quoted names, BOM and line endings', () => {
  const matrix = parseUserCsv('\uFEFFemail,password,name,role\r\ns@example.com,"  abc,12345  ","Doe, Jane",Student\r\n');
  const [row] = validateUserRows(matrix);
  expect(row.password).toBe('  abc,12345  ');
  expect(row.name).toBe('Doe, Jane');
  expect(row.status).toBe('Ready');
});
test('invalid roles, existing accounts and case-insensitive duplicates are excluded', () => {
  const rows = validateUserRows([header,['a@example.com','password123','A','Admin'],['b@example.com','password123','B','Teacher'],['B@EXAMPLE.COM','password123','B','Student']], [{email:'a@example.com'}]);
  expect(rows.map((r) => r.status)).toEqual(['Excluded','Ready','Excluded']);
  expect(rows[0].message).toContain('Account already exists');
  expect(rows[2].message).toContain('Duplicate');
});
test('rejects invalid headers and oversized uploads, reports never export passwords or formulas', () => {
  expect(() => validateUserRows([['email','password','name','class']])).toThrow();
  expect(() => validateUserRows([header,...Array.from({length:101}, () => ['x','','',''])])).toThrow();
  const report = bulkResultsCsv([{rowNumber:2,email:'e@example.com',password:'secret12345',name:'=1+2',role:'student',status:'Failed',message:'Check'}]);
  expect(report).not.toContain('secret12345');
  expect(report).not.toContain('password');
  expect(report).toContain("'=1+2");
});
