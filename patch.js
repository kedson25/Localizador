import fs from 'fs';
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const removeFn = `
  const removeScan = async (idToRemove: string) => {
    if (!window.confirm(\`Deseja remover o pacote \${idToRemove} do histórico?\`)) return;
    await runOperation(async () => {
      const newScans = scannedItems.filter(s => s.id !== idToRemove);
      setScannedItems(newScans);
      await saveRefugoScans(newScans);
    });
  };
`;

code = code.replace(
  '  const exportScannedCSV = () => {',
  removeFn + '\n  const exportScannedCSV = () => {'
);

const oldItemUi = `                      </div>\n                    ) : (\n                      <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-xs font-bold border border-red-200">\n                        SEM ROTA\n                      </span>\n                    )}\n                  </div>`;

const newItemUi = `                      </div>\n                    ) : (\n                      <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-xs font-bold border border-red-200">\n                        SEM ROTA\n                      </span>\n                    )}\n                    <button\n                      onClick={() => removeScan(item.id)}\n                      className="ml-3 text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"\n                      title="Remover pacote"\n                    >\n                      <Trash2 className="w-4 h-4" />\n                    </button>\n                  </div>`;

code = code.replace(oldItemUi, newItemUi);
fs.writeFileSync('src/components/ControleRefugo.tsx', code);
