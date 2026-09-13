import fs from 'fs';
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const helper = `
function parseDateRobust(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return null;
}
`;

code = code.replace(
  '// Gera string de data em fuso',
  helper + '\n// Gera string de data em fuso'
);

code = code.replace(
  'const scanDate = new Date(scan.scannedAt);',
  'const scanDate = parseDateRobust(scan.scannedAt);'
);
// replace again because it appears twice
code = code.replace(
  'const scanDate = new Date(scan.scannedAt);',
  'const scanDate = parseDateRobust(scan.scannedAt);'
);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
