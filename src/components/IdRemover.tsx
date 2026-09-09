import React, { useState, useMemo } from 'react';
import { Trash2, Copy, Check, Download, AlertCircle, X, Filter, FileCode } from 'lucide-react';
import { CsvRow } from '../types';
import { cleanDigits, parseCsvText } from '../utils/csvParser';

interface IdRemoverProps {
  rows: CsvRow[];
  headers: string[];
}

export const IdRemover: React.FC<IdRemoverProps> = ({ rows }) => {
  const [removeText, setRemoveText] = useState<string>('');
  const [pastedCsvText, setPastedCsvText] = useState<string>('');
  const [saidaFilter, setSaidaFilter] = useState<string>('');
  const [copiedIds, setCopiedIds] = useState<boolean>(false);
  const [copiedFullTable, setCopiedFullTable] = useState<boolean>(false);

  const effectiveSourceRows = useMemo(() => {
    if (pastedCsvText.trim()) {
      return parseCsvText(pastedCsvText).rows;
    }
    return rows;
  }, [pastedCsvText, rows]);

  const availableSaidas = useMemo(() => {
    const set = new Set<string>();
    effectiveSourceRows.forEach((r) => {
      if (r.saida && r.saida.trim()) {
        set.add(r.saida.trim());
      }
    });
    return Array.from(set).sort();
  }, [effectiveSourceRows]);

  const { removeTermsSet, totalTermsInput } = useMemo(() => {
    if (!removeText.trim()) {
      return { removeTermsSet: new Set<string>(), totalTermsInput: 0 };
    }

    const rawTerms = removeText
      .split(/[\n\r,;\t\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const set = new Set<string>();
    rawTerms.forEach((t) => {
      set.add(t);
      const cd = cleanDigits(t);
      if (cd) set.add(cd);
    });

    return { removeTermsSet: set, totalTermsInput: rawTerms.length };
  }, [removeText]);

  const { remainingRows, removedCount } = useMemo(() => {
    if (removeTermsSet.size === 0) {
      return { remainingRows: effectiveSourceRows, removedCount: 0 };
    }

    let removed = 0;
    const remaining: CsvRow[] = [];

    effectiveSourceRows.forEach((r) => {
      const isMatch =
        removeTermsSet.has(r.id) ||
        removeTermsSet.has(r.originalId) ||
        (r.cleanId && removeTermsSet.has(r.cleanId)) ||
        (r.concat && (removeTermsSet.has(r.concat) || removeTermsSet.has(cleanDigits(r.concat))));

      if (isMatch) {
        removed++;
      } else {
        remaining.push(r);
      }
    });

    return { remainingRows: remaining, removedCount: removed };
  }, [effectiveSourceRows, removeTermsSet]);

  const displayedRows = useMemo(() => {
    let list = remainingRows;
    if (saidaFilter) {
      list = list.filter((r) =>
        (r.saida || '').toLowerCase().includes(saidaFilter.toLowerCase())
      );
    }

    return [...list].sort((a, b) => {
      const groupComparison = (a.group || '').localeCompare(b.group || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (groupComparison !== 0) return groupComparison;

      const idA = a.id || a.cleanId || '';
      const idB = b.id || b.cleanId || '';
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [remainingRows, saidaFilter]);

  const displayedGroupCounts = useMemo(() => {
    const map = new Map<string, number>();
    displayedRows.forEach((r) => {
      const g = r.group || 'SEM GRUPO';
      map.set(g, (map.get(g) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [displayedRows]);

  const handleCopyIdsOnly = () => {
    if (displayedRows.length === 0) return;
    const text = ['ID', ...displayedRows.map((r) => r.id || r.cleanId)].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedIds(true);
    setTimeout(() => setCopiedIds(false), 2000);
  };

  const handleCopyTable = () => {
    if (displayedRows.length === 0) return;
    const header = ['ID', 'GRUPO', 'Saída', 'MOTIVO', 'Concat'].join('\t');
    const lines = displayedRows.map((r) =>
      [r.id, r.group, r.saida || '', r.motivo || '', r.concat || ''].join('\t')
    );
    navigator.clipboard.writeText([header, ...lines].join('\n'));
    setCopiedFullTable(true);
    setTimeout(() => setCopiedFullTable(false), 2000);
  };

  const handleDownloadCsv = () => {
    if (displayedRows.length === 0) return;
    const exportHeaders = ['GRUPO', 'ID', 'Saída', 'MOTIVO', 'Reversão', 'Concat'];
    const lines: string[] = [exportHeaders.join(';')];

    displayedRows.forEach((r) => {
      lines.push([r.group, r.id, r.saida || '', r.motivo || '', r.reversao || '', r.concat || ''].join(';'));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ids_filtrados_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans text-slate-800">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-slate-600" />
              1. Base CSV ({effectiveSourceRows.length} IDs)
            </label>

            {rows.length === 0 && !pastedCsvText && (
              <span className="text-[11px] font-mono text-slate-500">
                Aguardando CSV
              </span>
            )}
          </div>

          <textarea
            value={pastedCsvText}
            onChange={(e) => setPastedCsvText(e.target.value)}
            placeholder={
              rows.length > 0
                ? `Usando ${rows.length} IDs da base principal.\n(Ou cole um novo CSV para substituir)`
                : `Cole o CSV aqui...`
            }
            rows={5}
            className="w-full bg-slate-50 border border-slate-300 focus:border-[#3483FA] focus:bg-white rounded p-3 text-slate-900 font-mono text-xs outline-none"
          />

          {pastedCsvText && (
            <div className="flex justify-end">
              <button
                onClick={() => setPastedCsvText('')}
                className="text-xs text-slate-600 hover:text-slate-900 font-mono flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Usar Base Principal
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-slate-600" />
              2. IDs para Remover ({totalTermsInput})
            </label>

            {removeText && (
              <button
                onClick={() => setRemoveText('')}
                className="text-xs text-slate-600 hover:text-red-600 font-mono flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>

          <textarea
            value={removeText}
            onChange={(e) => setRemoveText(e.target.value)}
            placeholder="Cole os IDs que deseja dar baixa..."
            rows={5}
            className="w-full bg-slate-50 border border-slate-300 focus:border-[#3483FA] focus:bg-white rounded p-3 text-slate-900 font-mono text-xs outline-none"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs font-mono text-slate-700 flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-900">
            {displayedRows.length} IDs Exibidos
          </span>
          {removedCount > 0 && (
            <span className="text-red-600 font-bold">
              ({removedCount} Removidos)
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Saída:</span>
            {availableSaidas.length > 0 ? (
              <select
                value={saidaFilter}
                onChange={(e) => setSaidaFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono outline-none"
              >
                <option value="">Todas</option>
                {availableSaidas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={saidaFilter}
                onChange={(e) => setSaidaFilter(e.target.value)}
                placeholder="Filtrar saída..."
                className="border border-slate-300 rounded px-2 py-1 text-xs font-mono outline-none w-28"
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyIdsOnly}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300"
          >
            {copiedIds ? 'Copiado' : 'Copiar IDs'}
          </button>

          <button
            onClick={handleCopyTable}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300"
          >
            {copiedFullTable ? 'Copiado' : 'Copiar Tabela'}
          </button>

          <button
            onClick={handleDownloadCsv}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-[#3483FA] hover:bg-blue-600 disabled:opacity-40 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar CSV</span>
          </button>
        </div>
      </div>

      {displayedGroupCounts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded p-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Resumo por Grupo
          </span>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto font-mono text-xs">
            {displayedGroupCounts.map((g) => (
              <span key={g.name} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800">
                <strong>{g.name}:</strong> {g.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {displayedRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-xs text-slate-500 font-mono">
          <AlertCircle className="w-4 h-4 mx-auto text-slate-400 mb-1" />
          Nenhum ID restante para exibir.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3">Grupo</th>
                  <th className="py-2 px-3">Saída</th>
                  <th className="py-2 px-3">Motivo</th>
                  <th className="py-2 px-3">Concat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {displayedRows.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-1.5 px-3 text-slate-400 text-[10px]">{idx + 1}</td>
                    <td className="py-1.5 px-3 font-bold text-slate-900 whitespace-nowrap">{row.id}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap font-bold text-slate-800">{row.group}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-slate-700">{row.saida || '—'}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-slate-700">{row.motivo || '—'}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-slate-800">{row.concat || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
