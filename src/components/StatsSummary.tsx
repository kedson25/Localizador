import React, { useMemo } from 'react';
import { Layers, Hash } from 'lucide-react';
import { GroupSummary } from '../types';

interface StatsSummaryProps {
  totalRows: number;
  groups: GroupSummary[];
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ totalRows, groups }) => {
  if (totalRows === 0) return null;

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [groups]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Total IDs Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3.5 shadow-sm">
        <div className="w-10 h-10 rounded bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 font-bold">
          <Hash className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Total de IDs</span>
          <span className="text-xl font-black text-gray-900 font-mono">{totalRows}</span>
        </div>
      </div>

      {/* Total Groups Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3.5 shadow-sm">
        <div className="w-10 h-10 rounded bg-amber-500/10 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 font-bold">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Grupos Mapeados</span>
          <span className="text-xl font-black text-amber-600 font-mono">{groups.length}</span>
        </div>
      </div>
    </div>
  );
};
