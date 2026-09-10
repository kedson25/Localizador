const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const unificarOld = `
      if (idx >= 0) {
        novaListaItens[idx] = {
          ...novaListaItens[idx],
          validado: true,
          scannedAt: itemInd.scannedAt,
          responsavel: itemInd.responsavel,
          saida: itemInd.saida || novaListaItens[idx].saida
        };
        countAtualizados++;
      } else {
        novaListaItens.push(itemInd);
        countNovos++;
      }
`;

const unificarNew = `
      if (idx >= 0) {
        novaListaItens[idx] = {
          ...novaListaItens[idx],
          validado: novaListaItens[idx].validado || itemInd.validado,
          scannedAt: itemInd.scannedAt,
          responsavel: itemInd.responsavel,
          saida: itemInd.saida || novaListaItens[idx].saida
        };
        countAtualizados++;
      } else {
        novaListaItens.push(itemInd);
        countNovos++;
      }
`;

code = code.replace(unificarOld, unificarNew);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
