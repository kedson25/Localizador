const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const overlayCode = `
  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
      {highPriorityAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-yellow-400 p-4">
          <div className="bg-yellow-100 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl border-4 border-yellow-500 animate-in zoom-in-95">
            <AlertCircle className="w-24 h-24 text-yellow-600 mx-auto mb-4" />
            <h2 className="text-3xl font-black text-yellow-800 uppercase tracking-tight mb-2">PACOTE DE ALTA PRIORIDADE BPP</h2>
            <p className="text-yellow-700 font-medium mb-6 text-lg">Este pacote tem um valor registrado superior a R$ 1.000,00 e requer tratamento imediato e especial.</p>
            <div className="bg-yellow-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-yellow-800 font-bold mb-1">CÓDIGO:</p>
              <p className="font-mono text-xl text-yellow-900 break-all bg-yellow-300 p-2 rounded">{highPriorityAlert.id}</p>
            </div>
            <button 
              onClick={() => setHighPriorityAlert(null)}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors text-lg cursor-pointer"
            >
              Confirmar Recebimento (BPP)
            </button>
          </div>
        </div>
      )}
`;

code = code.replace(/return \(\n    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">/, overlayCode.trim());

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
