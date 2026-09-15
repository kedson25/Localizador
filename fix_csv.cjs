const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const replacement = `
  const exportarApenasIdsCSV = (lista: ColetaLista, itensCustom?: ColetaItem[], sufixoNome?: string) => {
    const itens = itensCustom || lista.itens;
    if (itens.length === 0) {
      alert('Não há itens para exportar.');
      return;
    }

    const cleanIdOnly = (code: string) => {
      if (!code) return '';
      // Remove all non-numeric characters to ensure only the 11-digit number remains
      const numericOnly = code.toString().replace(/\\D/g, '');
      return numericOnly;
    };

    const rows = itens
      .map(i => cleanIdOnly(i.codigo))
      .filter(code => code && code.length >= 10); // Ensure it's a valid looking ID

    const blob = new Blob([rows.join('\\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", \`\${lista.nome.toLowerCase().replace(/\\s+/g, '_')}_\${sufixoNome || 'IDs'}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
`;

code = code.replace(/const exportarApenasIdsCSV = \(lista: ColetaLista, itensCustom\?: ColetaItem\[\], sufixoNome\?: string\) => \{[\s\S]*?\};\s*const exportListaCSV = async/m, replacement.trim() + '\n\n  const exportListaCSV = async');

fs.writeFileSync('src/components/ListasColeta.tsx', code);
