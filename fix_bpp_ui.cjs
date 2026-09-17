const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

// 1. Remove the fullscreen modal
const fullscreenModalRegex = /\{\s*highPriorityAlert\s*&&\s*\([\s\S]*?\)\s*\}/;
code = code.replace(fullscreenModalRegex, '');

// 2. Change the type of lastScanResult
code = code.replace(
  /const \[lastScanResult, setLastScanResult\] = useState<\{ status: 'success' \| 'error', message: string \} \| null>\(null\);/,
  "const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error' | 'high_priority', message: string, rota?: string } | null>(null);"
);

// 3. Update handleBip logic
const oldHandleBipSuccess = `
      if (foundRow) {
        setLastScanResult({ status: 'success', message: 'Pacote localizado!' });
        
        if (foundRow.isHighPriority) {
           setHighPriorityAlert(foundRow);
        }

        // Voice alert
`;

const newHandleBipSuccess = `
      if (foundRow) {
        if (foundRow.isHighPriority) {
           setLastScanResult({ status: 'high_priority', message: 'PACOTE DE ALTA PRIORIDADE BPP (> R$ 1.000)', rota: foundRow.rota });
           // We might still want to keep an alert state if needed for lock, but user said "nao mostre na tela toda mostre amarela one mostrs sem rota ou rota", implying they just want the result block to be yellow.
           // For now, we removed highPriorityAlert state completely.
        } else {
           setLastScanResult({ status: 'success', message: 'Pacote localizado!', rota: foundRow.rota });
        }

        // Voice alert
`;

code = code.replace(oldHandleBipSuccess.trim(), newHandleBipSuccess.trim());

// 4. Update the UI for lastScanResult
const oldResultUI = `
              {lastScanResult && (
                <div className={\`mt-8 p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center animate-in zoom-in duration-200 \${
                  lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                }\`}>
                  {lastScanResult.status === 'success' ? (
                    <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-4" />
                  ) : (
                    <XCircle className="w-20 h-20 text-red-500 mb-4" />
                  )}
                  <p className="font-black text-3xl uppercase tracking-wide">
                    {lastScanResult.status === 'success' ? 'ENCONTRADO' : 'ERRO'}
                  </p>
                  <p className="text-xl font-bold mt-2">{lastScanResult.message}</p>
                </div>
              )}
`;

const newResultUI = `
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

// It's possible the regex for replacing doesn't exactly match the whitespace.
// I will use replace with string functions manually.
let beforeResult = code.split('{lastScanResult && (')[0];
let afterResult = code.split('</div>\n              )}')[1];
if (afterResult) {
  code = beforeResult + newResultUI.trim() + afterResult;
} else {
  console.log('Failed to match the UI part.');
}

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
