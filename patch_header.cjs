const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldHeader = `<div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ferramentas de Base</h1>
        <p className="text-gray-500 text-sm mt-1">Selecione o módulo que deseja utilizar</p>
      </div>`;

const newHeader = `<div className="mb-8 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ferramentas de Base</h1>
          <p className="text-gray-500 text-sm mt-1">Selecione o módulo que deseja utilizar</p>
        </div>
        
        <div className="flex items-center gap-3">
          {currentUser?.isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-md text-sm font-bold transition-colors"
            >
              Painel Admin
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 text-gray-800 rounded-md text-sm font-bold">
            <span>{currentUser?.username || 'Usuário'}</span>
            <button 
              onClick={() => { localStorage.removeItem('currentUser'); window.location.reload(); }}
              className="ml-2 text-[10px] text-red-600 hover:underline uppercase"
            >
              Sair
            </button>
          </div>
        </div>
      </div>`;

if (code.includes('Ferramentas de Base')) {
  code = code.replace(oldHeader, newHeader);
  fs.writeFileSync(file, code);
  console.log('Fixed header');
} else {
  console.log('Header not found!');
}
