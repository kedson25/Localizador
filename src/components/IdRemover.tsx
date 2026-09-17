import React, { useState, useMemo } from 'react';
import { Trash2, Copy, Check, Download, AlertCircle, X, Layers, FileCode, Filter } from 'lucide-react';
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

  // Derive source rows: if user pasted custom CSV text in this view, use it; otherwise use system loaded rows
  const effectiveSourceRows = useMemo(() => {
    if (pastedCsvText.trim()) {
      return parseCsvText(pastedCsvText).rows;
    }
    return rows;
  }, [pastedCsvText, rows]);

  // Extract unique Saída values for filter dropdown
  const availableSaidas = useMemo(() => {
    const set = new Set<string>();
    effectiveSourceRows.forEach((r) => {
      if (r.saida && r.saida.trim()) {
        set.add(r.saida.trim());
      }
    });
    return Array.from(set).sort();
  }, [effectiveSourceRows]);

  // Set of terms to remove (cleaning non-digits as fallback)
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

  // Filter out matching rows
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

  // Apply Saída filter on remaining rows & sort by Group (1, 2, 3...) then ID
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

  // Group breakdown for displayed remaining rows in numeric order (1, 2, 3...)
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

  // Quick Copy IDs
  const handleCopyIdsOnly = () => {
    if (displayedRows.length === 0) return;
    const text = ['ID', ...displayedRows.map((r) => r.id || r.cleanId)].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedIds(true);
    setTimeout(() => setCopiedIds(false), 2000);
  };

  // Quick Copy Table (ID + Grupo + Saída)
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

  // Download filtered CSV file
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
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Input Section - Clean & Direct */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Step 1: Base CSV Data */}
        <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-blue-600" />
              Base CSV ({effectiveSourceRows.length} IDs)
            </label>

            {rows.length === 0 && !pastedCsvText && (
              <span className="text-[11px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Aguardando CSV
              </span>
            )}
          </div>

          <textarea
            value={pastedCsvText}
            onChange={(e) => setPastedCsvText(e.target.value)}
            placeholder={
              rows.length > 0
                ? `Usando os ${rows.length} IDs do CSV principal.\n(Ou cole um novo CSV aqui)`
                : `Cole o CSV aqui...\nExemplo:\nID\tSaída\tMOTIVO\nGRUPO 1\t\t\n47691021163\tSaída PM\tEtiqueta Branca`
            }
            rows={5}
            className="w-full bg-gray-50/80 border border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15 rounded-lg p-3 text-gray-900 font-mono text-xs leading-relaxed placeholder:text-gray-400 transition-all shadow-inner resize-y"
          />

          {pastedCsvText && (
            <div className="flex justify-end">
              <button
                onClick={() => setPastedCsvText('')}
                className="text-[10px] text-gray-500 hover:text-gray-800 font-mono flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Usar CSV Principal
              </button>
            </div>
          )}
        </div>

        {/* Step 2: IDs to Remove */}
        <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-red-500" />
              Remover ({totalTermsInput})
            </label>

            {removeText && (
              <button
                onClick={() => setRemoveText('')}
                className="text-[10px] text-gray-500 hover:text-red-600 font-mono flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>

          <textarea
            value={removeText}
            onChange={(e) => setRemoveText(e.target.value)}
            placeholder="Cole os IDs para remover..."
            rows={5}
            className="w-full bg-gray-50/80 border border-gray-300 focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/15 rounded-lg p-3 text-gray-900 font-mono text-xs leading-relaxed placeholder:text-gray-400 transition-all shadow-inner resize-y"
          />
        </div>
      </div>

      {/* Summary Action Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs font-mono text-gray-700 flex flex-wrap items-center gap-3">
          <span className="font-bold text-amber-900 bg-amber-100 px-2 py-1 rounded border border-amber-200">
            {displayedRows.length} IDs {saidaFilter ? `(de ${remainingRows.length})` : ''}
          </span>
          {removedCount > 0 && (
            <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">
              {removedCount} Removidos
            </span>
          )}

          {/* Saída Filter selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-1">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[11px] font-bold text-gray-500 uppercase">Saída:</span>
            {availableSaidas.length > 0 ? (
              <select
                value={saidaFilter}
                onChange={(e) => setSaidaFilter(e.target.value)}
                className="bg-transparent text-gray-800 text-xs font-mono focus:outline-none cursor-pointer"
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
                placeholder="Filtrar..."
                className="bg-transparent text-gray-800 text-xs font-mono focus:outline-none w-28 placeholder:text-gray-400"
              />
            )}
            {saidaFilter && (
              <button
                onClick={() => setSaidaFilter('')}
                className="text-gray-400 hover:text-red-600 ml-1"
                title="Limpar filtro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyIdsOnly}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-gray-950 font-black rounded text-xs font-mono uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5"
          >
            {copiedIds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copiar IDs</span>
          </button>

          <button
            onClick={handleCopyTable}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-800 border border-gray-300 rounded text-xs font-mono font-semibold transition-colors flex items-center gap-1.5"
          >
            {copiedFullTable ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Tabela</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            disabled={displayedRows.length === 0}
            className="px-3 py-1.5 bg-[#111827] hover:bg-black disabled:opacity-40 text-white rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* Group distribution in numeric order */}
      {displayedGroupCounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">
            IDs por Grupo:
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {displayedGroupCounts.map((g) => (
              <div
                key={g.name}
                className="bg-amber-50/70 border border-amber-200 px-2 py-0.5 rounded text-xs flex items-center gap-1 font-mono"
              >
                <span className="text-amber-900 font-bold">{g.name}:</span>
                <span className="text-gray-900 font-black bg-white px-1.5 py-0.2 rounded border border-amber-200">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fine Compact List Output */}
      {displayedRows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-xs text-gray-500 font-mono">
          <AlertCircle className="w-5 h-5 mx-auto text-gray-400 mb-1" />
          {remainingRows.length > 0 && saidaFilter
            ? `Nenhum ID encontrado para: "${saidaFilter}".`
            : 'Nenhum ID restante.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto app-scroll-x">
            <table className="w-full min-w-[500px] text-left text-xs font-mono">
              <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2 px-3 text-gray-400 w-10">#</th>
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3 text-blue-700">GRUPO</th>
                  <th className="py-2 px-3">Saída</th>
                  <th className="py-2 px-3">MOTIVO</th>
                  <th className="py-2 px-3">Concat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800 text-[11px]">
                {displayedRows.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="hover:bg-blue-50/50 transition-colors">
                    <td className="py-1.5 px-3 text-gray-400 text-[10px]">{idx + 1}</td>
                    <td className="py-1.5 px-3 font-bold text-gray-900 whitespace-nowrap">{row.id}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[11px] border border-blue-200">
                        <Layers className="w-3 h-3 text-blue-600" />
                        {row.group}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-gray-700">{row.saida || '—'}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-gray-700">{row.motivo || '—'}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap font-bold text-blue-900">{row.concat || '—'}</td>
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
