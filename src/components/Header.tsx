import React from 'react';
import { Search, Filter, MessageSquare, Trash2, LayoutGrid, UploadCloud } from 'lucide-react';
import { ActiveTab } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onClear: () => void;
  totalRows: number;
  totalGroups: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onClear,
  totalRows,
}) => {
  return (
    <header className="bg-[#111827] border-b border-[#374151] text-white sticky top-0 z-30 shadow-sm shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Tab Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto app-scroll-x max-w-full pb-1 md:pb-0 flex-nowrap sm:flex-wrap">
            {/* Hub Button */}
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors border ${
                activeTab === 'tools'
                  ? 'bg-white text-gray-950 font-black border-white shadow-sm'
                  : 'bg-gray-900/90 text-gray-300 hover:text-white hover:bg-gray-800 border-gray-800 font-medium'
              }`}
              title="Ver todas as ferramentas disponíveis"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />
              <span>Ferramentas</span>
            </button>

            {/* Tab Navigation: Lista Backlog Group */}
            <div className="flex items-center gap-1 bg-gray-900/90 p-1 rounded border border-gray-800">
              <div className="px-2 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 border-r border-gray-700 pr-2 mr-1">
                <Filter className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Lista Backlog</span>
              </div>
              
              <button
                onClick={() => setActiveTab('lookup')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors ${
                  activeTab === 'lookup'
                    ? 'bg-amber-500 text-gray-950 font-black shadow-sm'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800 font-medium'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Consultar ID</span>
              </button>

              <button
                onClick={() => setActiveTab('remove')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors ${
                  activeTab === 'remove'
                    ? 'bg-amber-500 text-gray-950 font-black shadow-sm'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800 font-medium'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover IDs</span>
              </button>

              <button
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors ${
                  activeTab === 'report'
                    ? 'bg-emerald-500 text-gray-950 font-black shadow-sm'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800 font-medium'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Reporte WhatsApp</span>
              </button>
            </div>

            {/* CSV Base Tab */}
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors border ${
                activeTab === 'upload'
                  ? 'bg-amber-500 text-gray-950 font-black border-amber-500 shadow-sm'
                  : 'bg-gray-900/90 text-gray-400 hover:text-white hover:bg-gray-800 border-gray-800 font-medium'
              }`}
              title="Carregar ou atualizar arquivo CSV"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV Base</span>
            </button>
          </div>

          {/* System status & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-gray-800/80 px-2.5 py-1 rounded border border-gray-700">
              <span className={`w-2 h-2 rounded-full ${totalRows > 0 ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="text-[11px] font-bold tracking-wider">
                {totalRows > 0 ? `${totalRows.toLocaleString()} IDs CARREGADOS` : 'AGUARDANDO CSV'}
              </span>
            </div>

            {totalRows > 0 && (
              <button
                onClick={onClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-red-950/60 text-red-300 hover:text-white hover:bg-red-900 border border-red-800 transition-all font-bold"
                title="Apagar e zerar todos os dados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Apagar & Zerar</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

