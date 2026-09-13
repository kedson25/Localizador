import fs from 'fs';
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

code = code.replace(
  /if \(Number\.isNaN\(scanDate\.getTime\(\)\)\) return false;/g,
  'if (!scanDate || Number.isNaN(scanDate.getTime())) return false;'
);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
