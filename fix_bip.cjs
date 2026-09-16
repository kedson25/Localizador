const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const targetStr = `
      if (foundRow) {
        setLastScanResult({ status: 'success', message: 'Pacote localizado!' });
        
        if (foundRow.isHighPriority) {
           setHighPriorityAlert(foundRow);
        }

        // Voice alert
`;

code = code.replace(/if \(foundRow\) \{\n\s*setLastScanResult\(\{ status: 'success', message: 'Pacote localizado!' \}\);\n\s*\/\/ Voice alert/, targetStr.trim());

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
