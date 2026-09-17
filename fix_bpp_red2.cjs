const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

// 1. Add Star import
code = code.replace(
  /import \{ UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, Search, XCircle, Lock, Unlock, Download, FilePlus, X, FolderPlus, ListPlus, Check \} from 'lucide-react';/,
  "import { UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, Search, XCircle, Lock, Unlock, Download, FilePlus, X, FolderPlus, ListPlus, Check, Star } from 'lucide-react';"
);

// 2. Update the type
code = code.replace(
  /const \[lastScanResult, setLastScanResult\] = useState<\{ status: 'success' \| 'error' \| 'high_priority', message: string, rota\?: string \} \| null>\(null\);/,
  "const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error' | 'high_priority' | 'high_priority_no_route', message: string, rota?: string } | null>(null);"
);

// 3. Update logic in handleBip
const oldLogic = `
        if (foundRow.isHighPriority) {
           setLastScanResult({ status: 'high_priority', message: 'PACOTE DE ALTA PRIORIDADE BPP (> R$ 1.000)', rota: foundRow.rota });
           // We might still want to keep an alert state if needed for lock, but user said "nao mostre na tela toda mostre amarela one mostrs sem rota ou rota", implying they just want the result block to be yellow.
           // For now, we removed highPriorityAlert state completely.
        } else {
`;

const newLogic = `
        if (foundRow.isHighPriority) {
           const isSemRota = !foundRow.rota || foundRow.rota.toUpperCase() === 'SEM ROTA' || foundRow.rota.toUpperCase() === 'SEM ROTA ';
           setLastScanResult({ 
             status: isSemRota ? 'high_priority_no_route' : 'high_priority', 
             message: 'PACOTE DE ALTA PRIORIDADE BPP (> R$ 1.000)', 
             rota: foundRow.rota 
           });
        } else {
`;

code = code.replace(oldLogic.trim(), newLogic.trim());

// 4. Update UI block
const oldUI = `
              {lastScanResult && (
                <div className={\`mt-8 p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center animate-in zoom-in duration-200 \${
                  lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
                  lastScanResult.status === 'high_priority' ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-[0_0_30px_rgba(250,204,21,0.5)]' :
                  'bg-red-50 border-red-200 text-red-800'
                }\`}>
                  {lastScanResult.status === 'high_priority' ? (
                    <AlertCircle className="w-20 h-20 text-yellow-800 mb-4 animate-bounce" />
                  ) : lastScanResult.status === 'success' ? (
                    <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-4" />
                  ) : (
                    <XCircle className="w-20 h-20 text-red-500 mb-4" />
                  )}
                  <p className="font-black text-3xl uppercase tracking-wide">
                    {lastScanResult.status === 'high_priority' ? 'BPP - ALTA PRIORIDADE' : lastScanResult.status === 'success' ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}
                  </p>
                  <p className="text-xl font-bold mt-2">{lastScanResult.message}</p>
                  {lastScanResult.rota && (
                    <div className={\`mt-4 px-6 py-2 rounded-lg text-2xl font-black shadow-sm uppercase \${
                       lastScanResult.status === 'high_priority' ? 'bg-yellow-100 text-yellow-900' : 'bg-white text-emerald-900'
                    }\`}>
                      Rota: {lastScanResult.rota}
                    </div>
                  )}
                </div>
              )}
`;

const newUI = `
              {lastScanResult && (
                <div className={\`mt-8 p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center animate-in zoom-in duration-200 \${
                  lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
                  lastScanResult.status === 'high_priority' ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-[0_0_30px_rgba(250,204,21,0.5)]' :
                  lastScanResult.status === 'high_priority_no_route' ? 'bg-red-600 border-red-700 text-white shadow-[0_0_30px_rgba(220,38,38,0.6)]' :
                  'bg-red-50 border-red-200 text-red-800'
                }\`}>
                  {lastScanResult.status === 'high_priority' ? (
                    <AlertCircle className="w-20 h-20 text-yellow-800 mb-4 animate-bounce" />
                  ) : lastScanResult.status === 'high_priority_no_route' ? (
                    <Star className="w-20 h-20 text-white mb-4 animate-pulse fill-yellow-400" />
                  ) : lastScanResult.status === 'success' ? (
                    <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-4" />
                  ) : (
                    <XCircle className="w-20 h-20 text-red-500 mb-4" />
                  )}
                  <p className="font-black text-3xl uppercase tracking-wide">
                    {lastScanResult.status === 'high_priority' || lastScanResult.status === 'high_priority_no_route' ? 'BPP - ALTA PRIORIDADE' : lastScanResult.status === 'success' ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}
                  </p>
                  <p className={\`text-xl font-bold mt-2 \${lastScanResult.status === 'high_priority_no_route' ? 'text-red-100' : ''}\`}>{lastScanResult.message}</p>
                  {lastScanResult.rota && (
                    <div className={\`mt-4 px-6 py-2 rounded-lg text-2xl font-black shadow-sm uppercase \${
                       lastScanResult.status === 'high_priority' ? 'bg-yellow-100 text-yellow-900' : 
                       lastScanResult.status === 'high_priority_no_route' ? 'bg-red-800 text-white' : 
                       'bg-white text-emerald-900'
                    }\`}>
                      Rota: {lastScanResult.rota}
                    </div>
                  )}
                </div>
              )}
`;

code = code.replace(oldUI.trim(), newUI.trim());

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
