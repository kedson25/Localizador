const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

// 1. Update the type
code = code.replace(
  /const \[lastScanResult, setLastScanResult\] = useState<\{ status: 'success' \| 'error' \| 'high_priority', message: string, rota\?: string \} \| null>\(null\);/,
  "const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error' | 'high_priority' | 'high_priority_no_route', message: string, rota?: string } | null>(null);"
);

// 2. Update logic in handleBip
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

// 3. Update the UI rendering
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
                    <CheckCircle className="w-20 h-20 text-emerald-500 mb-4" />
`;
// Note: actually it uses CheckCircle2, I'll regex it better.

