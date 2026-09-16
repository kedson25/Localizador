const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

code = code.replace(/const \[lastScanResult[\s\S]*?;/, "const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string } | null>(null);\n  const [highPriorityAlert, setHighPriorityAlert] = useState<RefugoRow | null>(null);");

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
