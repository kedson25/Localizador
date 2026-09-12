import { ChevronLeft, ChevronRight } from 'lucide-react';

export const RESULTS_PAGE_SIZE = 200;

export function ResultPagination({ page, total, pageSize = RESULTS_PAGE_SIZE, onPageChange }: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const current = Math.min(Math.max(page, 0), pages - 1);
  return (
    <nav className="flex items-center justify-between gap-3 py-3" aria-label="Paginação dos resultados">
      <span className="text-xs font-medium text-gray-500">
        {current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={current === 0} onClick={() => onPageChange(current - 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40" aria-label="Página anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-gray-600">{current + 1} / {pages}</span>
        <button type="button" disabled={current >= pages - 1} onClick={() => onPageChange(current + 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40" aria-label="Próxima página">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
