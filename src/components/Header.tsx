import React from 'react';
import { Search, Filter, Upload, Trash2 } from 'lucide-react';
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
          <div className="flex items-center gap-1 bg-gray-900/90 p-1 rounded border border-gray-800">
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
              <Filter className="w-3.5 h-3.5" />
              <span>Remover IDs</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide uppercase transition-colors ${
                activeTab === 'upload'
                  ? 'bg-amber-500 text-gray-950 font-black shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-gray-800 font-medium'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Carregar CSV</span>
            </button>
          </div>

          {/* System status & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-gray-800/80 px-2.5 py-1 rounded border border-gray-700">
              <span className={`w-2 h-2 rounded-full ${totalRows > 0 ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="text-[11px] font-bold tracking-wider">
                {totalRows > 0 ? `${totalRows} IDs CARREGADOS` : 'AGUARDANDO CSV'}
              </span>
            </div>

            {totalRows > 0 && (
              <button
                onClick={onClear}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono text-gray-300 hover:text-red-400 hover:bg-red-950/40 border border-gray-700 hover:border-red-800 transition-colors"
                title="Limpar dados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
