const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const verificacaoOld = `
    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;

    const itensAtualizados = listToVerify.map(item => {
      if (item.validado) return item;

      const itemDigits = cleanDigits(item.codigo);
      const matched = rawIds.some(rawId => {
        let pId = rawId;
        pId = pId.replace(/d[çc]?⁴/gi, '4');
        pId = pId.replace(/d[çc]?4/gi, '4');
        pId = pId.replace(/^[^0-9a-zA-Z]+/, '');
        const match47 = pId.match(/(47\\d+)/);
        if (match47) pId = match47[1];
        else pId = pId.replace(/m$/i, '');
        
        const cleanPId = pId.toUpperCase();
        const pIdDigits = cleanDigits(cleanPId);
        
        return item.codigo === cleanPId || (itemDigits && pIdDigits && itemDigits === pIdDigits);
      });

      if (matched) {
        processados++;
        return { ...item, validado: true };
      }
      return item;
    });

    if (modoIndividual) {
      setItensModoIndividual(itensAtualizados);
    } else {
      const updatedLista = { ...listaAtiva, itens: itensAtualizados };
      await saveLista(updatedLista);
    }
`;

const verificacaoNew = `
    if (modoIndividual) {
      // No modo individual, precisamos também ADICIONAR os IDs se não existirem
      const novos = [...itensModoIndividual];
      const saidaItemFinal = listaAtiva?.saidaPadrao || selectedSaida || 'Ciclo 2 - Saída PM';
      
      const cleanCodigos = validateAndCleanIds(rawIds);
      
      cleanCodigos.forEach(cleanCod => {
         const cleanCodDigits = cleanDigits(cleanCod);
         const index = novos.findIndex(
            i => i.codigo === cleanCod || (cleanDigits(i.codigo) === cleanCodDigits && cleanCodDigits !== '')
         );
         
         if (index >= 0) {
            if (!novos[index].validado) {
               novos[index] = { ...novos[index], validado: true };
               processados++;
            }
         } else {
            // Adiciona como validado
            const cleanInputWithoutM = cleanCod.replace(/m$/i, '');
            const refugoMatch = refugoBaseRows.find(r => {
              if (!r.id) return false;
              const rId = r.id.trim().toUpperCase();
              if (rId === cleanCod) return true;
              if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
              const rDigits = cleanDigits(rId);
              return Boolean(rDigits && cleanCodDigits && rDigits === cleanCodDigits);
            });
            const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
              ? refugoMatch.rota.trim() : 'Sem Rota';
            
            const itemPrincipal = listaAtiva?.itens.find(
              item => item.codigo === cleanCod || (cleanDigits(item.codigo) === cleanCodDigits && cleanCodDigits !== '')
            );
            const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

            novos.unshift({
              id: 'ind-' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
              codigo: cleanCod,
              rota: rotaParaUsar,
              saida: saidaItemFinal,
              motivo: selectedMotivo || 'Desconteinerizado',
              scannedAt: new Date().toLocaleString('pt-BR'),
              responsavel: operanteNome,
              validado: true
            });
            processados++;
         }
      });
      setItensModoIndividual(novos);
    } else {
      const listToVerify = listaAtiva.itens;

      const itensAtualizados = listToVerify.map(item => {
        if (item.validado) return item;

        const itemDigits = cleanDigits(item.codigo);
        const matched = rawIds.some(rawId => {
          let pId = rawId;
          pId = pId.replace(/d[çc]?⁴/gi, '4');
          pId = pId.replace(/d[çc]?4/gi, '4');
          pId = pId.replace(/^[^0-9a-zA-Z]+/, '');
          const match47 = pId.match(/(47\\d+)/);
          if (match47) pId = match47[1];
          else pId = pId.replace(/m$/i, '');
          
          const cleanPId = pId.toUpperCase();
          const pIdDigits = cleanDigits(cleanPId);
          
          return item.codigo === cleanPId || (itemDigits && pIdDigits && itemDigits === pIdDigits);
        });

        if (matched) {
          processados++;
          return { ...item, validado: true };
        }
        return item;
      });
      const updatedLista = { ...listaAtiva, itens: itensAtualizados };
      await saveLista(updatedLista);
    }
`;

code = code.replace(verificacaoOld, verificacaoNew);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
