const fs = require('fs');

let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

code = code.replace(/saveRefugoScans,\n  clearRefugoScans,\n  listenToRefugoScans/g, "addRefugoScan,\n  deleteRefugoScan,\n  clearRefugoScans,\n  listenToRefugoScans");
code = code.replace(/import \{ cleanDigits, cleanTrackingId \} from '\.\.\/utils\/csvParser';/, "import { cleanDigits, cleanTrackingId, normalizeTrackingCode } from '../utils/csvParser';");

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
