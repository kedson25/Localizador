const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const replacement = `
  const handleAbrirFinalizar = async (lista: ColetaLista) => {
    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens da lista...');
    try {
      const itens = await getAllItemsForExport(lista.id);
      setListaParaFinalizar({ ...lista, itens });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar itens da lista');
    } finally {
      setIsLoadingLista(false);
    }
  };

  const handleReabrirLista
`;

code = code.replace(/const handleReabrirLista/, replacement.trim());

code = code.replace(/setListaParaFinalizar\\(listaAtiva\\)/g, 'handleAbrirFinalizar(listaAtiva)');

fs.writeFileSync('src/components/ListasColeta.tsx', code);
