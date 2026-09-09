import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Trash2,
  MessageSquare,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Folder,
  ArrowRight,
  Barcode,
  ListTodo
} from 'lucide-react';
import { GroupSummary } from '../types';
import { User } from '../lib/auth';

interface ToolsHubProps {
  totalRows: number;
  groups: GroupSummary[];
  onClear: () => void;
  currentUser?: User | null;
}

export const ToolsHub: React.FC<ToolsHubProps> = ({
  totalRows,
  onClear,
  currentUser,
}) => {
  const navigate = useNavigate();
  const [isBacklogOpen, setIsBacklogOpen] = useState(true);
  const [isRefugoOpen, setIsRefugoOpen] = useState(true);

  const allBacklogTools = [
    {
      id: 'listas',
      path: '/listas',
      name: 'Listas de Coleta',
      description: 'Filtragem e relatórios de remessas e expedição.',
      icon: ListTodo,
      tag: 'LISTAS'
    },
    {
      id: 'consulta',
      path: '/consulta',
      name: 'Buscar Grupos e IDs',
      description: 'Consulta em lote de pacotes e status na base.',
      icon: Search,
      tag: 'CONSULTA'
    },
    {
      id: 'remover',
      path: '/remover',
      name: 'Remover IDs em Lote',
      description: 'Baixa operacional de pacotes com leitor.',
      icon: Trash2,
      tag: 'BAIXA'
    },
    {
      id: 'reporte',
      path: '/reporte',
      name: 'Reporte WhatsApp',
      description: 'Formatação de resumo para envio de status.',
      icon: MessageSquare,
      tag: 'REPORTE'
    }
  ];

  const backlogTools = allBacklogTools.filter(tool => 
    currentUser?.isAdmin || currentUser?.allowedGroups?.includes(tool.id)
  );

  const canUpload = currentUser?.isAdmin || currentUser?.allowedGroups?.includes('upload');

  const refugoTools = [
    {
      id: 'refugo',
      path: '/refugo',
      name: 'Controle Refugo',
      description: 'Conferência de pacotes faltantes via leitor de código de barras.',
      icon: Barcode,
      tag: 'LEITURA'
    }
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto font-sans">
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded p-4">
        <div>
          <h1 className="text-base font-bold text-slate-900 tracking-tight">Módulos do Sistema</h1>
          <p className="text-xs text-slate-500">Selecione a operação desejada</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">{currentUser?.username || 'Usuário'}</span>
          <button 
            onClick={() => { localStorage.removeItem('currentUser'); window.location.reload(); }}
            className="text-xs text-red-600 hover:underline font-bold cursor-pointer"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Módulo: Lista Backlog */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div 
          onClick={() => setIsBacklogOpen(!isBacklogOpen)}
          className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5">
            {isBacklogOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
            <Folder className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Lista Backlog
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              ({backlogTools.length})
            </span>
          </div>

          <div className="text-xs font-mono text-slate-600">
            {totalRows > 0 ? `${totalRows.toLocaleString('pt-BR')} IDs` : 'Base Vazia'}
          </div>
        </div>

        {isBacklogOpen && (
          <div className="divide-y divide-slate-100">
            {backlogTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => navigate(tool.path)}
                  className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-700 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-[#3483FA]">
                          {tool.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#3483FA] transition-colors" />
                </button>
              );
            })}

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              {canUpload && (
                <button
                  onClick={() => navigate('/upload')}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-[#3483FA] hover:bg-blue-600 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{totalRows > 0 ? 'Atualizar CSV' : 'Carregar CSV'}</span>
                </button>
              )}

              {canUpload && totalRows > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Confirma zerar a base principal?')) {
                      onClear();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Zerar Base</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Módulo: Controle Refugo */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div 
          onClick={() => setIsRefugoOpen(!isRefugoOpen)}
          className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5">
            {isRefugoOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
            <Folder className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Controle Refugo
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              ({refugoTools.length})
            </span>
          </div>
        </div>

        {isRefugoOpen && (
          <div className="divide-y divide-slate-100">
            {refugoTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => navigate(tool.path)}
                  className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-700 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-[#3483FA]">
                          {tool.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#3483FA] transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
