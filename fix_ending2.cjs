const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const missingEnding = `
                </div>
              )}
            </div>
            
            {scannedItems.length > 50 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
              </div>
            )}
            
          </div>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 uppercase">Exportar Lista Branca</h2>
                <p className="text-sm text-gray-500 mt-1 font-medium">Transferir pacotes sem rota para o sistema de coleta</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold text-sm text-amber-950">
                    {exportTargetCodes.length} pacote(s) sem rota selecionado(s)
                  </p>
                  <p className="mt-1 text-amber-800 line-clamp-2 font-mono">
                    {exportTargetCodes.slice(0, 6).join(', ')}{exportTargetCodes.length > 6 ? '...' : ''}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Destino da Exportação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('new')}
                    className={\`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all \${
                      exportDestinationType === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }\`}
                  >
                    <FolderPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Criar Nova Lista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('existing')}
                    className={\`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all \${
                      exportDestinationType === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }\`}
                  >
                    <ListPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Lista Existente</span>
                  </button>
                </div>
              </div>

              {exportDestinationType === 'new' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nome da Nova Lista</label>
                  <input
                    type="text"
                    value={exportListName}
                    onChange={(e) => setExportListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                    placeholder="Ex: Lista Branca - Refugo"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Selecione a Lista</label>
                  {existingListas.length > 0 ? (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      {existingListas.map(lista => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} ({lista.rota || 'Geral'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      Nenhuma lista de coleta encontrada no sistema. Crie uma nova lista.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Saída Padrão</label>
                  <input
                    type="text"
                    value={exportSaida}
                    onChange={(e) => setExportSaida(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Motivo</label>
                  <input
                    type="text"
                    value={exportMotivo}
                    onChange={(e) => setExportMotivo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors uppercase"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmExport}
                disabled={busy || (exportDestinationType === 'existing' && existingListas.length === 0)}
                className="flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 uppercase cursor-pointer"
              >
                {busy ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Exportação
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
`;

// Remove the previously badly appended ending
code = code.replace(/<\/div>\n              \)}\n            <\/div>\n            \n            \{scannedItems\.length > 50[\s\S]*/, '');
code = code + missingEnding.trim();

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
