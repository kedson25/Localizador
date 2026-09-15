const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

code = code.replace(/setListaParaFinalizar\\(listaAtiva\\);/g, \`handleAbrirFinalizar(listaAtiva);\`);
code = code.replace(/setListaParaFinalizar\\(lista\\);/g, \`handleAbrirFinalizar(lista);\`);


const handleAbrirFinalizarString = \`
  const handleAbrirFinalizar = async (lista: ColetaLista) => {
    setIsLoadingLista(true);
    setLoadingMessage('Carregando itens da lista...');
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

  const handleReabrirLista\`;

code = code.replace(/const handleReabrirLista/, handleAbrirFinalizarString);


fs.writeFileSync('src/components/ListasColeta.tsx', code);
