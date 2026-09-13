import fs from 'fs';
let code = fs.readFileSync('src/components/ResultPagination.tsx', 'utf8');
code = code.replace(
  'if (total === 0) return null;',
  'if (total === 0 || totalPages <= 1) return null;'
);
fs.writeFileSync('src/components/ResultPagination.tsx', code);
