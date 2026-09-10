const fs = require('fs');

// Fix ListasColeta.tsx
let listas = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');
const lines = listas.split('\n');
if (lines[1372].includes('cleanInput')) {
  lines[1372] = lines[1372].replace('cleanInput', 'cleanCod');
  fs.writeFileSync('src/components/ListasColeta.tsx', lines.join('\n'));
}

// Fix IdRemover.tsx
let idremover = fs.readFileSync('src/components/IdRemover.tsx', 'utf8');
if (!idremover.includes('useEffect')) {
  idremover = idremover.replace("import React, { useState }", "import React, { useState, useEffect }");
  fs.writeFileSync('src/components/IdRemover.tsx', idremover);
}

