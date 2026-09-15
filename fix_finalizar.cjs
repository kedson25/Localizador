const fs = require('fs');

let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

code = code.replace(/const handleFinalizarLista[\s\S]*?const handleRemoverItem/, `const handleFinalizarLista = async (listaId: string, unificarBrancas: boolean = false) => {
    // Pegar metadados da lista
    const listaMeta = listas.find(l => l.id === listaId) || (listaAtiva?.id === listaId ? listaAtiva : null);
    if (!listaMeta) return;

    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens e finalizando lista...');

    try {
      // Buscar todos os itens reias da subcoleção para exportação/finalização
      const itensReais = await getAllItemsForExport(listaId);
      
      const cleanIdOnly = (code: string) => {
        if (!code) return '';
        return code.toString().trim().replace(/["\\r\\n\\t]/g, '').replace(/\\s+/g, '');
      };

      // 1. Obter os itens validados da lista (se existirem itens validados, filtra eles; senão considera todos)
      const itensValidados = itensReais.some(i => i.validado)
        ? itensReais.filter(i => i.validado)
        : itensReais;

      const idsValidados = itensValidados.map(item => cleanIdOnly(item.codigo)).filter(Boolean);

      // 2. Se optou por juntar com as brancas do refugo
      let rowsCsv: string[] = [];
      if (unificarBrancas && idsBrancasRefugo.length > 0) {
        const validadosSet = new Set(idsValidados.map(id => id.toUpperCase()));
        const brancasAdicionais = idsBrancasRefugo.filter(id => !validadosSet.has(id.toUpperCase()));
        
        // CSV unificado: validados primeiro, depois as brancas
        rowsCsv = [...idsValidados, ...brancasAdicionais];

        // Adicionar itens na lista finalizada para registro no histórico
        const itensBrancasNovos: ColetaItem[] = brancasAdicionais.map((code, idx) => ({
          id: \`branca-\${Date.now()}-\${idx}-\${Math.random().toString(36).substring(2, 5)}\`,
          codigo: code,
          rota: 'Brancas',
          saida: listaMeta.saidaPadrao || 'Ciclo 2 - Saída PM',
          motivo: 'Brancas',
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome,
          validado: true
        }));

        if (itensBrancasNovos.length > 0) {
          await addItemsBatchToLista(listaId, itensBrancasNovos);
        }
      } else {
        rowsCsv = idsValidados;
      }

      // 3. Atualizar status da lista no banco
      setListas(prev => prev.map(l => l.id === listaId ? { ...l, status: 'finalizada' } : l));
      await saveLista({ id: listaId, status: 'finalizada' });

      // 4. Download do CSV
      if (rowsCsv.length > 0) {
        const csvContent = rowsCsv.join('\\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sufixoNome = unificarBrancas ? '_Validados_Com_Brancas.csv' : '_Validados.csv';
        link.setAttribute('download', \`\${listaMeta.nome.replace(/\\s+/g, '_')}\${sufixoNome}\`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert('Nenhum item válido para baixar.');
      }

      setListaParaFinalizar(null);
    } catch (error) {
      console.error("Erro ao finalizar lista", error);
      alert('Erro ao finalizar a lista. Tente novamente.');
    } finally {
      setIsLoadingLista(false);
    }
  };

  const handleRemoverItem`);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
