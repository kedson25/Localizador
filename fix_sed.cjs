const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

code = code.replace(/reconcileListaCounts,\n  getAllItemsForExport\(activeListaId\)/, 'reconcileListaCounts(activeListaId)');
code = code.replace(/reconcileListaCounts,\n  getAllItemsForExport\(listaAtiva.id\)/, 'reconcileListaCounts(listaAtiva.id)');

fs.writeFileSync('src/components/ListasColeta.tsx', code);
