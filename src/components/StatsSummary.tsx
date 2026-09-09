import React from 'react';
import { GroupSummary } from '../types';

interface StatsSummaryProps {
  totalRows: number;
  groups: GroupSummary[];
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ totalRows, groups }) => {
  if (totalRows === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between text-xs font-sans">
      <div className="flex items-center gap-6">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total de IDs</span>
          <span className="text-base font-bold text-slate-900 font-mono">{totalRows.toLocaleString('pt-BR')}</span>
        </div>
        <div className="h-6 w-px bg-slate-200"></div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Grupos Mapeados</span>
          <span className="text-base font-bold text-slate-900 font-mono">{groups.length.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </div>
  );
};
