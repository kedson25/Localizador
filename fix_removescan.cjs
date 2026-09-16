const fs = require('fs');

let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

code = code.replace(/removeScan\(item.id\)/g, 'removeScan(item)');

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
