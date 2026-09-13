import fs from 'fs';
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Fix imports
code = code.replace(
  "import { listenToListas, saveLista } from '../lib/coletaSync';",
  "import { listenToListas, saveLista, listenToRefugoScans } from '../lib/firebase';"
);
code = code.replace(
  "import { listenToRefugoScans, type RefugoScan } from '../services/operational.service';",
  `export interface RefugoScan {
  id: string;
  rota: string;
  scannedAt: Date | string;
  status: 'found' | 'not_found';
  foundBy?: string;
}`
);
code = code.replace(
  "import { compareListasNewestFirst } from '../lib/listaOrder';",
  `function compareListasNewestFirst(a: ColetaLista, b: ColetaLista) {
  const dateA = getListDateIso(a) || '';
  const dateB = getListDateIso(b) || '';
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA);
  }
  return b.id.localeCompare(a.id);
}`
);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
