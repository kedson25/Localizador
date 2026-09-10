const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("import { User } from '../lib/auth';")) {
  code = code.replace(
    "import { ActiveTab, GroupSummary } from '../types';", 
    "import { ActiveTab, GroupSummary } from '../types';\nimport { User } from '../lib/auth';"
  );
}

code = code.replace(
  "  onClear: () => void;\n}",
  "  onClear: () => void;\n  currentUser?: User | null;\n}"
);

code = code.replace(
  "  onClear,\n}) => {",
  "  onClear,\n  currentUser,\n}) => {"
);

// We need to filter backlogTools based on currentUser
const filterLogic = `
  const allBacklogTools = [
    {
      id: 'listas',
      path: '/listas',
      name: 'Listas de Coleta',
      description: 'Filtrar remessas prontas, separar por tipo (Envios/Coletas) e gerar relatórios simplificados.',
      icon: ListTodo,
      iconColor: 'text-[#FACC15]',
      badgeBg: 'bg-[#FFF9C4] border-[#FBC02D] text-[#F57F17]',
      tag: 'NOVO'
    },
    {
      id: 'consulta',
      path: '/consulta',
      name: 'Buscar grupos e IDs',
      description: 'Consulte informações detalhadas sobre pacotes, agrupamentos e o status atualizado de cada ID na base.',
      icon: Search,
      iconColor: 'text-[#3483FA]',
      badgeBg: 'bg-blue-50 border-blue-200 text-blue-700',
      tag: 'CONSULTA'
    },
    {
      id: 'remover',
      path: '/remover',
      name: 'Remover IDs em lote',
      description: 'Escaneie pacotes fisicamente e dê baixa imediata no sistema. As quantidades são atualizadas na hora.',
      icon: Trash2,
      iconColor: 'text-red-500',
      badgeBg: 'bg-red-50 border-red-200 text-red-700',
      tag: 'AÇÃO'
    },
    {
      id: 'reporte',
      path: '/reporte',
      name: 'Gerar Reporte WhatsApp',
      description: 'Gere um resumo formatado com as quantidades e pendências de cada grupo para enviar direto pelo WhatsApp.',
      icon: MessageSquare,
      iconColor: 'text-emerald-500',
      badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      tag: 'RELATÓRIO'
    }
  ];

  const backlogTools = allBacklogTools.filter(tool => 
    currentUser?.isAdmin || currentUser?.allowedGroups?.includes(tool.id)
  );

  // Allow uploading if the user has permission to upload
  const canUpload = currentUser?.isAdmin || currentUser?.allowedGroups?.includes('upload');
`;

// In the code, `backlogTools = [` exists. We need to replace it.
const startIdx = code.indexOf("const backlogTools = [");
const endIdx = code.indexOf("const refugoTools = [");
if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + filterLogic + "\n  " + code.substring(endIdx);
}

// Update "3 ferramentas" text
code = code.replace("3 ferramentas", "{backlogTools.length} ferramentas");

// Replace buttons block
const buttonsStart = code.indexOf('<div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-end items-center gap-3">');
if (buttonsStart !== -1) {
  code = code.replace(
    `<button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/upload');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3483FA] hover:bg-blue-600 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <UploadCloud className="w-4 h-4" />
                {totalRows > 0 ? 'Atualizar Base CSV' : 'Carregar Base CSV'}
              </button>`,
    `{canUpload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/upload');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3483FA] hover:bg-blue-600 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <UploadCloud className="w-4 h-4" />
                {totalRows > 0 ? 'Atualizar Base CSV' : 'Carregar Base CSV'}
              </button>
            )}`
  );
  
  code = code.replace(
    `{totalRows > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Tem certeza que deseja zerar os dados da base principal?')) {
                      onClear();
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Zerar Base
                </button>
              )}`,
    `{canUpload && totalRows > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Tem certeza que deseja zerar os dados da base principal?')) {
                      onClear();
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Zerar Base
                </button>
              )}`
  );
}

// Ensure the header shows Admin button if admin
const headerPatch = `
      <div className="flex items-center justify-between mb-4 mt-2">
        <div>
          <h1 className="text-xl font-bold text-[#333333]">Hub de Ferramentas</h1>
          <p className="text-sm text-gray-500 mt-1">Selecione o módulo que deseja acessar</p>
        </div>
        <div className="flex items-center gap-3">
          {currentUser?.isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors"
            >
              Painel Admin
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">
            <span>{currentUser?.username || 'Usuário'}</span>
            <button 
              onClick={() => { localStorage.removeItem('currentUser'); window.location.reload(); }}
              className="ml-2 text-xs text-red-500 hover:underline"
            >
              Sair
            </button>
          </div>
        </div>
      </div>`;

// Wait, let's just use string replacement for the title section
const oldTitleSection = `<h1 className="text-xl font-bold text-[#333333]">Hub de Ferramentas</h1>
        <p className="text-sm text-gray-500 mt-1">Selecione o módulo que deseja acessar</p>`;

if (code.includes(oldTitleSection)) {
  code = code.replace(
    oldTitleSection,
    `
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#333333]">Hub de Ferramentas</h1>
            <p className="text-sm text-gray-500 mt-1">Selecione o módulo que deseja acessar</p>
          </div>
          <div className="flex items-center gap-3">
            {currentUser?.isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-md text-sm font-bold transition-colors"
              >
                Admin
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
        </div>
    `
  );
}

fs.writeFileSync(file, code);
console.log('ToolsHub patched');
