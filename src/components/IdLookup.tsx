import React, { useState, useMemo } from 'react';
import { Search, Copy, Check, AlertCircle, Layers, X, ChevronDown, ChevronUp, Upload, Filter } from 'lucide-react';
import { CsvRow, LookupMatch } from '../types';
import { searchIdsInRows } from '../utils/csvParser';

interface IdLookupProps {
  rows: CsvRow[];
  onNavigateToUpload: () => void;
}

export const IdLookup: React.FC<IdLookupProps> = ({ rows, onNavigateToUpload }) => {
  const [inputText, setInputText] = useState<string>('');
  const [saidaFilter, setSaidaFilter] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedDetailIdx, setCopiedDetailIdx] = useState<number | null>(null);
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null);

  const matches: LookupMatch[] = useMemo(() => {
    return searchIdsInRows(inputText, rows);
  }, [inputText, rows]);

  // Extract unique Saída values from found search matches (or loaded rows if no search)
  const availableSaidas = useMemo(() => {
    const set = new Set<string>();
    const foundRows = matches.length > 0
      ? matches.filter((m) => m.found && m.row).map((m) => m.row!)
      : rows;

    foundRows.forEach((r) => {
      if (r.saida && r.saida.trim()) {
        set.add(r.saida.trim());
      }
    });
    return Array.from(set).sort();
  }, [rows, matches]);

  // Apply Saída filter to matches & sort by Group (1, 2, 3...) then ID
  const filteredMatches = useMemo(() => {
    let list = matches;
    if (saidaFilter) {
      list = list.filter((m) => {
        if (!m.found || !m.row) return false;
        return (m.row.saida || '').toLowerCase().includes(saidaFilter.toLowerCase());
      });
    }

    return [...list].sort((a, b) => {
      // Put found items before unfound items
      if (a.found && !b.found) return -1;
      if (!a.found && b.found) return 1;

      // Both found: sort by Group numerically (1, 2, 3...), then ID
      if (a.found && b.found && a.row && b.row) {
        const groupComparison = (a.row.group || '').localeCompare(b.row.group || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (groupComparison !== 0) return groupComparison;

        const idA = a.row.id || a.row.cleanId || a.searchTerm;
        const idB = b.row.id || b.row.cleanId || b.searchTerm;
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      }

      // Both not found: sort by search term
      return a.searchTerm.localeCompare(b.searchTerm, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [matches, saidaFilter]);

  // Group breakdown for matched IDs in numeric order (1, 2, 3...)
  const foundGroupCounts = useMemo(() => {
    const map = new Map<string, number>();
    filteredMatches.forEach((m) => {
      if (m.found && m.row) {
        const g = m.row.group || 'SEM GRUPO';
        map.set(g, (map.get(g) || 0) + 1);
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [filteredMatches]);

  const handleCopyResultsText = () => {
    if (filteredMatches.length === 0) return;
    const header = ['ID', 'GRUPO', 'SAÍDA', 'MOTIVO'].join('\t');
    const rows = filteredMatches.map((m) => {
      if (m.found && m.row) {
        return [m.searchTerm, m.row.group, m.row.saida || '', m.row.motivo || ''].join('\t');
      }
      return [m.searchTerm, 'NÃO ENCONTRADO', '', ''].join('\t');
    });

    navigator.clipboard.writeText([header, ...rows].join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySingleRowDetail = (match: LookupMatch, idx: number) => {
    const groupText = match.found && match.row ? match.row.group : 'NÃO ENCONTRADO';
    const saidaText = match.found && match.row ? (match.row.saida || '') : '';
    const motivoText = match.found && match.row ? (match.row.motivo || '') : '';
    const header = ['ID', 'GRUPO', 'SAÍDA', 'MOTIVO'].join('\t');
    const row = [match.searchTerm, groupText, saidaText, motivoText].join('\t');

    navigator.clipboard.writeText(`${header}\n${row}`);
    setCopiedDetailIdx(idx);
    setTimeout(() => setCopiedDetailIdx(null), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Top Search Input Box */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative overflow-hidden">
        <div className="max-w-3xl space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Consultar Lista de IDs
            </label>

            {rows.length > 0 && (
              <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded border border-gray-200">
                {rows.length} IDs indexados
              </span>
            )}
          </div>

          <p className="text-xs text-gray-600">
            Cole múltiplos IDs (ex: <code className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono font-bold">47691021163, 47691021163</code> ou separados por linha).
          </p>

          {/* Textarea Box */}
          <div className="relative group">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Cole aqui os IDs para consultar (separados por linha, vírgula, tabulação ou espaço)...&#10;Ex:&#10;47691021163&#10;47707799806"
              rows={4}
              className="w-full bg-gray-50/80 border border-gray-300 focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/15 rounded-lg p-3 text-gray-900 font-mono text-xs leading-relaxed placeholder:text-gray-400 transition-all shadow-inner resize-y min-h-[100px]"
            />
            
            {/* Status & Action Floating Bar */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-none">
              {inputText.trim() !== '' && (
                <span className="pointer-events-auto bg-amber-100/90 text-amber-900 border border-amber-300/80 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold shadow-2xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  {matches.length} {matches.length === 1 ? 'ID detectado' : 'IDs detectados'}
                </span>
              )}

              {inputText && (
                <button
                  onClick={() => setInputText('')}
                  className="pointer-events-auto text-gray-400 hover:text-red-600 hover:bg-red-50 bg-white border border-gray-200 p-1 rounded-md shadow-2xs transition-colors flex items-center gap-1 text-[11px] font-bold px-2"
                  title="Limpar campo de busca"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          </div>

          {rows.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Nenhum CSV carregado. Por favor, carregue o seu arquivo CSV para liberar as consultas.</span>
              </div>
              <button
                onClick={onNavigateToUpload}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold rounded text-xs transition-colors flex items-center gap-1.5 flex-shrink-0 shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                Carregar CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results Header / Export Controls */}
      {matches.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white px-3.5 py-2 rounded border border-gray-200 shadow-sm gap-2">
          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex flex-wrap items-center gap-3">
            <span>Resultados ({filteredMatches.length}{saidaFilter ? ` de ${matches.length}` : ''})</span>
            <span className="text-[11px] text-gray-500 font-mono normal-case">
              ({filteredMatches.filter((m) => m.found).length} Encontrados, {filteredMatches.filter((m) => !m.found).length} Ausentes)
            </span>

            {/* Saída Filter selector */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 normal-case font-mono">
              <Filter className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-bold text-gray-500 uppercase">Saída:</span>
              {availableSaidas.length > 0 ? (
                <select
                  value={saidaFilter}
                  onChange={(e) => setSaidaFilter(e.target.value)}
                  className="bg-transparent text-gray-800 text-xs font-mono focus:outline-none cursor-pointer"
                >
                  <option value="">Todas as Saídas</option>
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
                  placeholder="Filtrar por Saída..."
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

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyResultsText}
              disabled={filteredMatches.length === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-gray-950 font-black rounded text-xs font-mono transition-colors shadow-sm uppercase tracking-wider"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar ID + Grupo + Saída + Motivo</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Group breakdown for searched IDs */}
      {foundGroupCounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">
            Quantidade de IDs Encontrados por Grupo (Ordem 1, 2, 3...):
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {foundGroupCounts.map((g) => (
              <div
                key={g.name}
                className="bg-amber-50/70 border border-amber-200 px-2 py-0.5 rounded text-xs flex items-center gap-1 font-mono"
              >
                <span className="text-amber-900 font-bold">{g.name}:</span>
                <span className="text-gray-900 font-black bg-white px-1.5 py-0.2 rounded border border-amber-200">
                  {g.count} {g.count === 1 ? 'ID' : 'IDs'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fine Compact List Table ("Lista Fina") */}
      {inputText.trim() !== '' && matches.length === 0 ? (
        <div className="text-center py-8 bg-white border border-gray-200 rounded text-xs text-gray-500 font-mono">
          Nenhum resultado encontrado para os IDs informados.
        </div>
      ) : filteredMatches.length === 0 && matches.length > 0 ? (
        <div className="text-center py-8 bg-white border border-gray-200 rounded text-xs text-gray-500 font-mono">
          Nenhum resultado corresponde ao filtro de Saída: "{saidaFilter}".
        </div>
      ) : matches.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2 px-3 text-gray-400 w-10">#</th>
                  <th className="py-2 px-3">ID Pesquisado</th>
                  <th className="py-2 px-3 text-amber-700">GRUPO ENCONTRADO</th>
                  <th className="py-2 px-3">Saída</th>
                  <th className="py-2 px-3">MOTIVO</th>
                  <th className="py-2 px-3">Concat</th>
                  <th className="py-2 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800 text-[11px]">
                {filteredMatches.map((match, idx) => {
                  const isExpanded = expandedRowIdx === idx;
                  return (
                    <React.Fragment key={`${match.searchTerm}-${idx}`}>
                      <tr
                        className={`hover:bg-amber-50/50 transition-colors ${
                          !match.found ? 'bg-red-50/30' : idx % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'
                        }`}
                      >
                        <td className="py-2 px-3 text-gray-400 text-[10px]">{idx + 1}</td>

                        <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">
                          {match.searchTerm}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          {match.found && match.row ? (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[11px] border border-amber-200">
                              <Layers className="w-3 h-3 text-amber-700" />
                              {match.row.group}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded text-[10px] border border-red-200">
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              NÃO ENCONTRADO
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-gray-700">
                          {match.found && match.row?.saida ? match.row.saida : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-gray-700">
                          {match.found && match.row?.motivo ? match.row.motivo : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap font-bold text-amber-900">
                          {match.found && match.row?.concat ? match.row.concat : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopySingleRowDetail(match, idx)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 text-[10px] font-mono font-medium transition-colors"
                              title="Copiar ID, Grupo e Saída"
                            >
                              {copiedDetailIdx === idx ? (
                                <span className="text-green-600 font-bold">Copiado</span>
                              ) : (
                                <span>Copiar</span>
                              )}
                            </button>

                            {match.found && match.row && (
                              <button
                                onClick={() => setExpandedRowIdx(isExpanded ? null : idx)}
                                className="p-1 text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200"
                                title="Detalhes completos"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && match.found && match.row && (
                        <tr className="bg-amber-50/20 border-b border-gray-200">
                          <td colSpan={7} className="p-3">
                            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5">
                              Layout Completo para o ID: <span className="text-gray-900">{match.searchTerm}</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px]">
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Reversão</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.reversao || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Substatus GP</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.substatusGp || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Cluster</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.cluster || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Tipo Endereço</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.tipoEndereco || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Promessa</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.promessa || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Dias Delay</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.diasDelay || '—'}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
