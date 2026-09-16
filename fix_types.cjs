const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace(/rawFields: Record<string, string>;/, 'rawFields: Record<string, string>;\n  isHighPriority?: boolean;');
fs.writeFileSync('src/types.ts', code);
