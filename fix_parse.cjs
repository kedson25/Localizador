const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const newParseCSV = `
  const parseCSV = (text: string): RefugoRow[] => {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    if (result.errors.some(error => error.type === 'Quotes')) throw new Error('O arquivo CSV contém aspas inválidas. Confira o arquivo.');
    
    const headerRow = result.data.find(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      return ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id);
    });

    let valorRealIndex = -1;
    let valorUsdIndex = -1;

    if (headerRow) {
      headerRow.forEach((col, idx) => {
        const c = String(col).trim().toUpperCase();
        if (c.includes('VALOR REAL')) valorRealIndex = idx;
        if (c.includes('VALOR USD')) valorUsdIndex = idx;
      });
    } else {
      valorRealIndex = 5;
      valorUsdIndex = 6;
    }

    return result.data.flatMap(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      if (!id || ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id)) return [];
      
      let isHighPriority = false;
      [valorRealIndex, valorUsdIndex].forEach(idx => {
         if (idx >= 0 && values[idx]) {
           const valStr = values[idx].replace(/\\./g, '').replace(',', '.').trim();
           const val = parseFloat(valStr);
           if (!isNaN(val) && val > 1000) {
             isHighPriority = true;
           }
         }
      });

      return [{ id, rota: String(values[1] || 'Sem Rota').trim(), isHighPriority, rawFields: Object.fromEntries(values.map((value, index) => [String(index), value])) }];
    });
  };
`;

code = code.replace(/const parseCSV = \(text: string\): RefugoRow\[\] => \{[\s\S]*?\}\);\n  \};/, newParseCSV.trim());

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
