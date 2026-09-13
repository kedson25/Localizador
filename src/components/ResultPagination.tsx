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
    <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-xs text-gray-600 mb-4">
      <span>
        Mostrando <strong className="text-gray-900 font-mono">{startIndex + 1}</strong>–<strong className="text-gray-900 font-mono">{endIndex}</strong> de <strong className="text-[#3483FA] font-mono">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 font-bold">{currentPage} / {totalPages}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages - 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page === totalPages - 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
