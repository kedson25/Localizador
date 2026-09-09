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
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase transition-colors ${
                activeTab === 'tools'
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Ferramentas</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded">
              <button
                onClick={() => setActiveTab('lookup')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase transition-colors ${
                  activeTab === 'lookup'
                    ? 'bg-[#3483FA] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Consultar</span>
              </button>

              <button
                onClick={() => setActiveTab('remove')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase transition-colors ${
                  activeTab === 'remove'
                    ? 'bg-[#3483FA] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover</span>
              </button>

              <button
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase transition-colors ${
                  activeTab === 'report'
                    ? 'bg-[#3483FA] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Reporte</span>
              </button>
            </div>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase transition-colors ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Base CSV</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-slate-300">
              <span className="font-bold">
                {totalRows > 0 ? `${totalRows.toLocaleString('pt-BR')} IDs` : 'Base Vazia'}
              </span>
            </div>

            {totalRows > 0 && (
              <button
                onClick={onClear}
                className="px-2 py-1 rounded text-xs font-bold bg-red-900/80 text-red-100 hover:bg-red-800 transition-colors"
              >
                Zerar
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
