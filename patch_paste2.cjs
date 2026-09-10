const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

const oldOnPaste = `
                  onPaste={async (e) => {
                    const pastedData = e.clipboardData.getData('text');
                    if (pastedData && (pastedData.includes('\\n') || pastedData.includes(','))) {
                      e.preventDefault();
                      // Pega os codigos
                      const rawCodigos = pastedData.split(/[\\n,;\\t]+/).map(s => s.trim()).filter(Boolean);
                      const cleanCodigos = validateAndCleanIds(rawCodigos);
                      if (cleanCodigos.length > 0) {
                         // Mostra o modal de Verificação em Lote para agilizar!
                         setVerificarLoteText(cleanCodigos.join('\\n'));
                         setShowVerificarLoteModal(true);
                      }
                    }
                  }}
`;

const newOnPaste = `
                  onPaste={async (e) => {
                    const pastedData = e.clipboardData.getData('text');
                    if (pastedData && (pastedData.includes('\\n') || pastedData.includes(',') || pastedData.includes(' '))) {
                      e.preventDefault();
                      const rawCodigos = pastedData.split(/[\\n,;\\t\\s]+/).map(s => s.trim()).filter(Boolean);
                      const cleanCodigos = validateAndCleanIds(rawCodigos);
                      if (cleanCodigos.length > 0) {
                        if (modoIndividual) {
                          // No modo individual, colar significa "bipar" todos. Adiciona e valida!
                          const novos = [...itensModoIndividual];
                          const saidaItemFinal = listaAtiva?.saidaPadrao || selectedSaida || 'Ciclo 2 - Saída PM';
                          
                          cleanCodigos.forEach(cleanInput => {
                             const cleanInputDigits = cleanDigits(cleanInput);
                             const jaExiste = novos.some(
                               i => i.codigo === cleanInput || (cleanDigits(i.codigo) === cleanInputDigits && cleanInputDigits !== '')
                             );
                             if (!jaExiste) {
                               const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
                               const refugoMatch = refugoBaseRows.find(r => {
                                 if (!r.id) return false;
                                 const rId = r.id.trim().toUpperCase();
                                 if (rId === cleanInput) return true;
                                 if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
                                 const rDigits = cleanDigits(rId);
                                 return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
                               });
                               const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
                                 ? refugoMatch.rota.trim() : 'Sem Rota';
                               
                               const itemPrincipal = listaAtiva?.itens.find(
                                 item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
                               );
                               const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

                               novos.unshift({
                                 id: 'ind-' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                 codigo: cleanInput,
                                 rota: rotaParaUsar,
                                 saida: saidaItemFinal,
                                 motivo: selectedMotivo || 'Desconteinerizado',
                                 scannedAt: new Date().toLocaleString('pt-BR'),
                                 responsavel: operanteNome,
                                 validado: true
                               });
                             }
                          });
                          setItensModoIndividual(novos);
                          setLastScanResult({
                            status: 'success',
                            code: 'LOTE',
                            message: \`\${cleanCodigos.length} IDs colados e validados na sessão!\`
                          });
                        } else {
                          // Na lista normal, agilizar usando verificação em lote
                          setVerificarLoteText(cleanCodigos.join('\\n'));
                          setShowVerificarLoteModal(true);
                        }
                      }
                    }
                  }}
`;

code = code.replace(oldOnPaste, newOnPaste);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
