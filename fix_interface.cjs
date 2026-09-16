const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const regex = /import { RefugoScan } from "..\\/lib\\/firebase";[\s\S]*?foundBy\?: string;\s*\}/m;
code = code.replace(regex, "import { RefugoScan } from '../lib/firebase';");

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
