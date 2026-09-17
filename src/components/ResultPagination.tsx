import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const RESULTS_PAGE_SIZE = 100;

export function ResultPagination({ total, page, onPageChange }: { total: number, page: number, onPageChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / RESULTS_PAGE_SIZE));
  const currentPage = page + 1;
  const startIndex = page * RESULTS_PAGE_SIZE;
  const endIndex = Math.min(total, startIndex + RESULTS_PAGE_SIZE);

  if (total === 0 || totalPages <= 1) return null;

  return (
    <div className="px-3 sm:px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0 text-xs text-gray-600 mb-4 w-full">
      <span className="text-center sm:text-left">
        Mostrando <strong className="text-gray-900 font-mono">{startIndex + 1}</strong>–<strong className="text-gray-900 font-mono">{endIndex}</strong> de <strong className="text-[#3483FA] font-mono">{total}</strong>
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          aria-label="Primeira página"
          className="p-1.5 sm:p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center cursor-pointer"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Página anterior"
          className="p-1.5 sm:p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2.5 py-1 bg-white border border-gray-200 rounded text-xs font-mono font-bold text-gray-800 shadow-2xs">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages - 1}
          aria-label="Próxima página"
          className="p-1.5 sm:p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page === totalPages - 1}
          aria-label="Última página"
          className="p-1.5 sm:p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center cursor-pointer"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
