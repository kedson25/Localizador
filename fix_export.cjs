const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const replacement = `
  const exportListaCSV = async (lista: ColetaLista) => {
    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens da lista...');
    try {
      const itens = await getAllItemsForExport(lista.id);
      exportarApenasIdsCSV(lista, itens);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar itens da lista');
    } finally {
      setIsLoadingLista(false);
    }
  };
`;

code = code.replace(/const exportListaCSV = \\(lista: ColetaLista\\) => \\{[\\s\\S]*?\\};/, replacement.trim());

fs.writeFileSync('src/components/ListasColeta.tsx', code);
