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
import { ActiveTab, GroupSummary } from '../types';
import { User } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';

interface ToolsHubProps {
  totalRows: number;
  groups: GroupSummary[];
  onClear: () => void;
  currentUser?: User | null;
}

export const ToolsHub: React.FC<ToolsHubProps> = ({
  totalRows,
  groups,
  onClear,
  currentUser,
}) => {
  const navigate = useNavigate();
  const [isBacklogOpen, setIsBacklogOpen] = useState(false);
  const [isRefugoOpen, setIsRefugoOpen] = useState(false);

  
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

  const refugoTools = [
    {
      id: 'refugo',
      path: '/refugo',
      name: 'Controle Refugo',
      tag: 'Auditoria & Leitura',
      description: 'Carregue a planilha de faltantes. Utilize o leitor de código de barras físico para bipar os pacotes localizados.',
      icon: Barcode,
      iconColor: 'text-[#3483FA]',
      badgeBg: 'bg-blue-50 text-[#3483FA] border-blue-200',
    }
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ferramentas de Base</h1>
          <p className="text-gray-500 text-sm mt-1">Selecione o módulo que deseja utilizar</p>
        </div>
        
        <div className="flex items-center gap-3">
          
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

      {/* Grupo: Gestão de Backlog */}
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
                  {backlogTools.length} ferramentas
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
        <AnimatePresence initial={false}>
          {isBacklogOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-gray-100">
            {backlogTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => navigate(tool.path)}
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
              {canUpload && (
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
            )}

              {canUpload && totalRows > 0 && (
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
            </motion.div>
          )}
        </AnimatePresence>
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
        <AnimatePresence initial={false}>
          {isRefugoOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-gray-100">
            {refugoTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => navigate(tool.path)}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    
    </div>
  );
};
