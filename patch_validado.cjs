const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

code = code.replace(
  /responsavel: operanteNome,\n\s*validado: false\n\s*}\);/g,
  "responsavel: operanteNome,\n            validado: true\n          });"
);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
