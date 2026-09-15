const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const replacement = `
      const cleanIdOnly = (code: string) => {
        if (!code) return '';
        // Remove all non-numeric characters to ensure only the 11-digit number remains
        return code.toString().replace(/\\D/g, '');
      };

      // 1. Obter os itens validados da lista (se existirem itens validados, filtra eles; senão considera todos)
      const itensValidados = itensReais.some(i => i.validado)
        ? itensReais.filter(i => i.validado)
        : itensReais;

      const idsValidados = itensValidados
        .map(item => cleanIdOnly(item.codigo))
        .filter(code => code && code.length >= 10);
`;

code = code.replace(/const cleanIdOnly = \(code: string\) => \{[\s\S]*?const idsValidados = itensValidados\.map\(item => cleanIdOnly\(item\.codigo\)\)\.filter\(Boolean\);/, replacement.trim());

fs.writeFileSync('src/components/ListasColeta.tsx', code);
