const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const replacement = `import { RefugoScan } from "../lib/firebase";`;

const regex = /import { RefugoScan } from "..\/lib\/firebase";\n\n\/\/ Removed RefugoScan in favor of RefugoScan\n  id: string;\n  rota: string;\n  scannedAt: Date;\n  status: 'found' \| 'not_found';\n  foundBy\?: string;\n\}/m;
code = code.replace(regex, replacement);

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
