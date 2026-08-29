import React, { useState } from 'react';
import {
  Search,
  Trash2,
  MessageSquare,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Folder,
  ArrowRight,
  Barcode
} from 'lucide-react';
import { ActiveTab, GroupSummary } from '../types';

interface ToolsHubProps {
  onSelectTab: (tab: ActiveTab) => void;
  totalRows: number;
  groups: GroupSummary[];
  onClear: () => void;
}

export const ToolsHub: React.FC<ToolsHubProps> = ({
  onSelectTab,
  totalRows,
  groups,
  onClear,
}) => {
  const [isBacklogOpen, setIsBacklogOpen] = useState(false);
  const [isRefugoOpen, setIsRefugoOpen] = useState(false);

  const backlogTools = [
    {
      id: 'lookup' as ActiveTab,
      name: 'Consultar IDs',
      tag: 'Busca em Massa',
      description: 'Cruze uma lista de pacotes com a base CSV para identificar motivos, saídas, ciclos e agrupar ocorrências automaticamente.',
      icon: Search,
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      id: 'remove' as ActiveTab,
      name: 'Remover IDs',
      tag: 'Expurgo & Filtro',
      description: 'Subtraia pacotes já resolvidos ou divergências da base ativa. Exporte a nova lista filtrada ou copie apenas os IDs restantes.',
      icon: Trash2,
      iconColor: 'text-red-600',
      badgeBg: 'bg-red-50 text-red-700 border-red-200',
    },
    {
      id: 'report' as ActiveTab,
      name: 'Reporte WhatsApp',
      tag: 'Formatador',
      description: 'Gere o texto padrão com saudação automática pelo horário, totais de pacotes por motivo e identificação do ciclo para envio rápido.',
      icon: MessageSquare,
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  ];

  const refugoTools = [
    {
      id: 'refugo' as ActiveTab,
      name: 'Bipar Faltantes',
      tag: 'Leitura de Código',
      description: 'Carregue um CSV de IDs faltantes e bipe pacotes fisicamente. Identifique se são rotas válidas e separe os dados.',
      icon: Barcode,
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    }
  ];

  return (
    <div className="max-w-2xl w-full mx-auto flex flex-col justify-center min-h-[calc(100vh-8rem)] font-sans animate-in fade-in duration-200 space-y-6">
      
      {/* Grupo: Lista Backlog */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        
        {/* Header do Grupo */}
        <div 
          onClick={() => setIsBacklogOpen(!isBacklogOpen)}
          className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isBacklogOpen ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="w-8 h-8 rounded bg-[#FFE600] text-[#333333] flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Lista Backlog
                </h2>
                <span className="text-[10px] font-mono text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full font-medium">
                  3 ferramentas
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ferramentas essenciais para o fluxo de inventário, conciliação e comunicação
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-gray-600 bg-white border border-gray-300 px-2.5 py-1 rounded-md">
            <span className={`w-2 h-2 rounded-full ${totalRows > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{totalRows > 0 ? `${totalRows.toLocaleString()} IDs na memória` : 'Aguardando CSV'}</span>
          </div>
        </div>

        {/* Lista de Ferramentas Minimalista */}
        {isBacklogOpen && (
          <div className="divide-y divide-gray-100">
            {backlogTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTab(tool.id)}
                  className="w-full px-5 py-4 hover:bg-[#FFFDE7] flex flex-col sm:flex-row sm:items-center justify-between text-left transition-colors cursor-pointer group gap-4"
                >
                  <div className="flex items-start sm:items-center gap-4 min-w-0 pr-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-white flex items-center justify-center border border-gray-200 shrink-0 transition-colors shadow-sm">
                      <Icon className={`w-5 h-5 ${tool.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#333333] group-hover:text-[#2D3277] transition-colors">
                          {tool.name}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${tool.badgeBg}`}>
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed mt-1">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-[#3483FA] shrink-0 mt-2 sm:mt-0">
                    <span>Acessar {tool.name.split(' ')[0]}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              );
            })}

            <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-end items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTab('upload');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3483FA] hover:bg-blue-600 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <UploadCloud className="w-4 h-4" />
                {totalRows > 0 ? 'Atualizar Base CSV' : 'Carregar Base CSV'}
              </button>

              {totalRows > 0 && (
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grupo: Controle Refugo */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        
        {/* Header do Grupo */}
        <div 
          onClick={() => setIsRefugoOpen(!isRefugoOpen)}
          className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isRefugoOpen ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="w-8 h-8 rounded bg-[#3483FA] text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Controle Refugo
                </h2>
                <span className="text-[10px] font-mono text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full font-medium">
                  {refugoTools.length} ferramenta
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Conferência de pacotes faltantes via leitura de código de barras
              </p>
            </div>
          </div>
        </div>

        {/* Lista de Ferramentas Minimalista */}
        {isRefugoOpen && (
          <div className="divide-y divide-gray-100">
            {refugoTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTab(tool.id)}
                  className="w-full px-5 py-4 hover:bg-[#E3F2FD]/50 flex flex-col sm:flex-row sm:items-center justify-between text-left transition-colors cursor-pointer group gap-4"
                >
                  <div className="flex items-start sm:items-center gap-4 min-w-0 pr-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-white flex items-center justify-center border border-gray-200 shrink-0 transition-colors shadow-sm">
                      <Icon className={`w-5 h-5 ${tool.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#333333] group-hover:text-[#2D3277] transition-colors">
                          {tool.name}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${tool.badgeBg}`}>
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed mt-1">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-[#3483FA] shrink-0 mt-2 sm:mt-0">
                    <span>Acessar {tool.name.split(' ')[0]}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
    </div>
  );
};
