const fs = require('fs');

let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

code = code.replace(/import \{ saveRefugo, clearRefugo, saveRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo, saveLista, listenToListas, addItemsBatchToLista, getAllItemsForExport \} from '\.\.\/lib\/firebase';/, "import { saveRefugo, clearRefugo, saveRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo, saveLista, listenToListas, addItemsBatchToLista, getAllItemsForExport, addRefugoScan, deleteRefugoScan } from '../lib/firebase';");

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
