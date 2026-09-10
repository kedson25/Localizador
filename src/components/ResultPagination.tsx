import React from 'react';

export const RESULTS_PAGE_SIZE = 200;

interface ResultPaginationProps {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

export function ResultPagination({ total, page, onPageChange }: ResultPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / RESULTS_PAGE_SIZE));
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
      <span>
        Exibindo {page * RESULTS_PAGE_SIZE + 1}–{Math.min((page + 1) * RESULTS_PAGE_SIZE, total)} de {total} IDs.
        {' '}Copiar e baixar incluem todos os resultados filtrados.
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-gray-300 bg-white px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <span aria-live="polite">Página {page + 1} de {pageCount}</span>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-gray-300 bg-white px-3 py-1 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
