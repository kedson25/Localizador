import React, { useState, useMemo, useEffect } from 'react';
import { Search, Copy, Check, AlertCircle, Layers, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Upload, Filter, ListPlus } from 'lucide-react';
import { CsvRow, LookupMatch, ColetaLista, ColetaItem } from '../types';
import { searchIdsInRows, cleanDigits } from '../utils/csvParser';
import { listenToListas } from '../lib/firebase';

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
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [showGruposModal, setShowGruposModal] = useState(false);

  useEffect(() => {
    const unsubscribe = listenToListas((data) => setListas(data));
    return () => unsubscribe();
  }, []);

  const matches: LookupMatch[] = useMemo(() => {
    if (!inputText || !inputText.trim()) return [];

    const rawTerms = inputText
      .split(/[\n\r,;\t\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const processedTerms = new Set<string>();
    const results: LookupMatch[] = [];

    for (const term of rawTerms) {
      if (processedTerms.has(term)) continue;
      processedTerms.add(term);

      const cleanTerm = cleanDigits(term);

      // 1. Procurar nas linhas da base carregada via CSV (se houver)
      const matchedRow = rows && rows.length > 0 ? rows.find((r) => {
        if (r.id === term || r.originalId === term) return true;
        if (cleanTerm.length > 0 && r.cleanId === cleanTerm) return true;
        if (r.id.includes(term)) return true;
        if (r.concat && (r.concat === term || cleanDigits(r.concat) === cleanTerm)) return true;
        return false;
      }) : undefined;

      // 2. Procurar em todas as listas de coleta (listas do Firestore)
      let foundInLista: { item: ColetaItem; lista: ColetaLista; grupoNome?: string } | null = null;

      for (const lista of listas) {
        if (!lista.itens || lista.itens.length === 0) continue;

        const item = lista.itens.find((i) => {
          if (!i.codigo) return false;
          const cleanCod = cleanDigits(i.codigo);
          return (
            i.codigo === term ||
            (cleanTerm.length > 0 && cleanCod === cleanTerm) ||
            i.codigo === cleanTerm ||
            i.codigo.includes(term)
          );
        });

        if (item) {
          let grupoNome = '';
          if (item.grupoId && lista.grupos) {
            const g = lista.grupos.find((grp) => grp.id === item.grupoId);
            if (g) grupoNome = g.nome;
          }
          foundInLista = { item, lista, grupoNome };
          // Se o item já tem motivo e saída preenchidos, priorizar este
          if (item.motivo && item.saida) break;
        }
      }

      // Extrair dados da lista de coleta encontrada
      const motivoLista = foundInLista?.item.motivo || foundInLista?.lista.motivoPadrao || '';
      const saidaLista = foundInLista?.item.saida || foundInLista?.lista.saidaPadrao || '';
      const grupoLista = foundInLista?.grupoNome || '';
      const nomeLista = foundInLista?.lista.nome || '';
      const bipadoPor = foundInLista?.item.responsavel || foundInLista?.lista.responsavel || '';
      const horarioBip = foundInLista?.item.scannedAt || '';
      const rotaLista = foundInLista?.item.rota || foundInLista?.lista.rota || '';

      if (matchedRow) {
        // Encontrado no CSV: priorizar motivo e saída da lista se houver
        const enrichedRow: CsvRow = {
          ...matchedRow,
          motivo: motivoLista || matchedRow.motivo || '',
          saida: saidaLista || matchedRow.saida || '',
          group: grupoLista || matchedRow.group,
          rawFields: {
            ...matchedRow.rawFields,
            ...(nomeLista ? { 'Lista de Coleta': nomeLista } : {}),
            ...(motivoLista ? { 'Motivo da Lista': motivoLista } : {}),
            ...(saidaLista ? { 'Saída da Lista': saidaLista } : {}),
            ...(bipadoPor ? { 'Bipado por': bipadoPor } : {}),
            ...(horarioBip ? { 'Horário do Bip': horarioBip } : {}),
            ...(rotaLista ? { 'Rota': rotaLista } : {})
          }
        };

        results.push({
          searchTerm: term,
          cleanSearchTerm: cleanTerm,
          found: true,
          row: enrichedRow,
          matchedGroup: enrichedRow.group
        });
      } else if (foundInLista) {
        // Não está no CSV base, mas foi bipado/está em uma lista de coleta
        const listaRow: CsvRow = {
          id: cleanTerm || term,
          originalId: term,
          cleanId: cleanTerm,
          group: grupoLista || (foundInLista.lista.tipo === 'grupos' ? 'Multirotas' : foundInLista.lista.nome),
          saida: saidaLista,
          motivo: motivoLista,
          concat: rotaLista,
          rawFields: {
            'Origem': 'Lista de Coleta',
            'Lista de Coleta': nomeLista,
            'Rota': rotaLista,
            'Saída': saidaLista,
            'Motivo': motivoLista,
            'Bipado por': bipadoPor,
            'Data / Hora': horarioBip,
            'Tipo de Lista': foundInLista.lista.tipo === 'grupos' ? 'Com Grupos' : 'Lista Comum'
          },
          rowIndex: -1
        };

        results.push({
          searchTerm: term,
          cleanSearchTerm: cleanTerm,
          found: true,
          row: listaRow,
          matchedGroup: listaRow.group
        });
      } else {
        // Não encontrado nem no CSV nem em listas
        results.push({
          searchTerm: term,
          cleanSearchTerm: cleanTerm,
          found: false
        });
      }
    }

    return results;
  }, [inputText, rows, listas]);

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

  // Paginação da Consulta de IDs para suportar 9.000+ IDs sem travar
  const [lookupPage, setLookupPage] = useState<number>(1);
  const [lookupPageSize, setLookupPageSize] = useState<number>(100);
  const [jumpLookupPageInput, setJumpLookupPageInput] = useState<string>('1');

  useEffect(() => {
    setLookupPage(1);
    setJumpLookupPageInput('1');
  }, [inputText, saidaFilter]);

  const totalLookupPages = Math.max(1, Math.ceil(filteredMatches.length / lookupPageSize));

  useEffect(() => {
    if (lookupPage > totalLookupPages) {
      setLookupPage(totalLookupPages);
      setJumpLookupPageInput(String(totalLookupPages));
    }
  }, [totalLookupPages, lookupPage]);

  const startLookupIndex = (lookupPage - 1) * lookupPageSize;
  const endLookupIndex = Math.min(filteredMatches.length, startLookupIndex + lookupPageSize);

  const displayedMatches = useMemo(() => {
    return filteredMatches.slice(startLookupIndex, endLookupIndex);
  }, [filteredMatches, startLookupIndex, endLookupIndex]);

  const renderLookupPagination = (position: 'top' | 'bottom') => {
    if (filteredMatches.length === 0) return null;

    const delta = 2;
    const range: number[] = [];
    for (let i = 1; i <= totalLookupPages; i++) {
      if (i === 1 || i === totalLookupPages || (i >= lookupPage - delta && i <= lookupPage + delta)) {
        range.push(i);
      }
    }

    const rangeWithDots: (number | string)[] = [];
    let prevNum: number | undefined;
    for (const num of range) {
      if (prevNum) {
        if (num - prevNum === 2) {
          rangeWithDots.push(prevNum + 1);
        } else if (num - prevNum !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(num);
      prevNum = num;
    }

    const handleJump = (e: React.FormEvent) => {
      e.preventDefault();
      const p = parseInt(jumpLookupPageInput, 10);
      if (!isNaN(p) && p >= 1 && p <= totalLookupPages) {
        setLookupPage(p);
      } else {
        setJumpLookupPageInput(String(lookupPage));
      }
    };

    return (
      <div className={`px-4 py-2.5 bg-gray-50 border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600 ${
        position === 'top' ? 'border-b rounded-t-lg' : 'border-t rounded-b-lg'
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            Mostrando <strong className="text-gray-900 font-mono">{filteredMatches.length === 0 ? 0 : startLookupIndex + 1}</strong>–<strong className="text-gray-900 font-mono">{endLookupIndex}</strong> de <strong className="text-[#3483FA] font-mono">{filteredMatches.length.toLocaleString('pt-BR')}</strong> IDs
          </span>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <span className="text-gray-500">
            Pág. <strong className="text-gray-800 font-mono">{lookupPage}</strong> de <strong className="text-gray-800 font-mono">{totalLookupPages}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => { setLookupPage(1); setJumpLookupPageInput('1'); }}
            disabled={lookupPage === 1}
            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Primeira página"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const nextP = Math.max(1, lookupPage - 1);
              setLookupPage(nextP);
              setJumpLookupPageInput(String(nextP));
            }}
            disabled={lookupPage === 1}
            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Página anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="hidden sm:flex items-center gap-1">
            {rangeWithDots.map((p, idx) => {
              if (p === '...') {
                return <span key={`ellipsis-lookup-${position}-${idx}`} className="px-1 text-gray-400 font-mono select-none">...</span>;
              }
              const isCurrent = p === lookupPage;
              return (
                <button
                  key={`page-lookup-${position}-${p}`}
                  type="button"
                  onClick={() => { setLookupPage(Number(p)); setJumpLookupPageInput(String(p)); }}
                  className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-[#3483FA] text-white shadow-sm'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const nextP = Math.min(totalLookupPages, lookupPage + 1);
              setLookupPage(nextP);
              setJumpLookupPageInput(String(nextP));
            }}
            disabled={lookupPage >= totalLookupPages}
            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Próxima página"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setLookupPage(totalLookupPages); setJumpLookupPageInput(String(totalLookupPages)); }}
            disabled={lookupPage >= totalLookupPages}
            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Última página"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">Por pág:</span>
            <select
              value={lookupPageSize}
              onChange={(e) => {
                setLookupPageSize(Number(e.target.value));
                setLookupPage(1);
                setJumpLookupPageInput('1');
              }}
              className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-700 outline-none focus:border-[#3483FA] cursor-pointer"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          <form onSubmit={handleJump} className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">Ir:</span>
            <input
              type="number"
              min={1}
              max={totalLookupPages}
              value={jumpLookupPageInput}
              onChange={(e) => setJumpLookupPageInput(e.target.value)}
              onBlur={handleJump}
              className="w-12 px-1 py-1 bg-white border border-gray-300 rounded text-xs font-mono font-bold text-center text-gray-800 outline-none focus:border-[#3483FA]"
            />
          </form>
        </div>
      </div>
    );
  };

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
      .sort((a, b) => {
        if (a.name === 'ERROS') return 1;
        if (b.name === 'ERROS') return -1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const rawLines = content.split(/\r?\n/);
      const validLines = rawLines.filter((l) => l.trim() !== '');

      if (validLines.length <= 1) {
        setInputText('');
        return;
      }

      // Ignore index 0 (A1 header), process index 1 onwards (A2, A3...)
      const extractedIds: string[] = [];
      for (let i = 1; i < validLines.length; i++) {
        const line = validLines[i].trim();
        if (!line) continue;

        // Get value from Column A (first column before delimiter)
        const firstCol = line.split(/[,;\t]/)[0]?.trim().replace(/^["']|["']$/g, '');
        if (firstCol) {
          extractedIds.push(firstCol);
        }
      }

      setInputText(extractedIds.join('\n'));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Top Search Input Box */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* Beautiful Header */}
        <div className="bg-gray-50/80 border-b border-gray-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-sm border border-blue-200">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Consulta em Massa</h2>
              <p className="text-xs text-gray-500 mt-0.5">Cole os IDs ou importe um arquivo CSV com os faltantes.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGruposModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 text-purple-700 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-purple-600" />
              <span className="hidden sm:inline">Importar Grupo</span>
            </button>
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700 rounded-lg text-xs font-bold transition-all shadow-sm">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Carregar Faltantes (CSV)</span>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
            </label>

            {rows.length > 0 && (
              <span className="hidden sm:inline-block text-[11px] font-mono text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200 font-bold">
                {rows.length} base
              </span>
            )}
          </div>
        </div>

        {/* Clean Textarea Section */}
        <div className="p-5">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden focus-within:ring-4 focus-within:ring-blue-500/15 focus-within:border-blue-500 transition-all">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Cole os IDs aqui (separados por linha, vírgula, tabulação ou espaço)...&#10;&#10;Ex:&#10;47691021163&#10;47707799806"
              rows={5}
              className="w-full bg-transparent border-0 focus:ring-0 outline-none p-5 text-gray-900 font-mono text-sm leading-relaxed placeholder:text-gray-400 resize-y min-h-[120px]"
            />
            
            <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {inputText.trim() !== "" ? (
                  <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    {matches.length} {matches.length === 1 ? "ID detectado" : "IDs detectados"}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-gray-400 font-medium">Nenhum ID detectado</span>
                )}
              </div>

              {inputText && (
                <button
                  onClick={() => setInputText("")}
                  className="text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                  title="Limpar campo de busca"
                >
                  <X className="w-4 h-4" />
                  Limpar
                </button>
              )}
            </div>
          </div>
          
          {rows.length === 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 text-xs">
              <div className="flex items-start sm:items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="leading-relaxed font-medium">Nenhum CSV base carregado. A consulta precisa da base principal para cruzar os dados.</p>
              </div>
              <button
                onClick={onNavigateToUpload}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 flex-shrink-0 shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Carregar Base CSV
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
                className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 font-mono border ${
                  g.name === 'ERROS'
                    ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <span className={g.name === 'ERROS' ? 'text-red-700 font-bold' : 'text-amber-900 font-bold'}>{g.name}:</span>
                <span className="text-gray-900 font-black bg-white px-1.5 py-0.2 rounded border border-gray-200">
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
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
          {renderLookupPagination('top')}
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
                {displayedMatches.map((match, idx) => {
                  const globalIdx = startLookupIndex + idx;
                  const isExpanded = expandedRowIdx === globalIdx;
                  return (
                    <React.Fragment key={`${match.searchTerm}-${globalIdx}`}>
                      <tr
                        className={`hover:bg-amber-50/50 transition-colors ${
                          !match.found ? 'bg-red-50/30' : globalIdx % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'
                        }`}
                      >
                        <td className="py-2 px-3 text-gray-400 text-[10px]">{globalIdx + 1}</td>

                        <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-gray-900">{match.searchTerm}</span>
                            {match.found && match.row?.rawFields?.['Lista de Coleta'] && (
                              <span className="text-[10px] text-[#3483FA] font-medium font-sans truncate max-w-[170px]" title={`Lista: ${match.row.rawFields['Lista de Coleta']}`}>
                                📋 {match.row.rawFields['Lista de Coleta']}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          {match.found && match.row ? (
                            match.row.group === 'ERROS' ? (
                              <span className="inline-flex items-center gap-1 bg-red-100 text-red-900 font-bold px-2 py-0.5 rounded text-[11px] border border-red-300">
                                <AlertCircle className="w-3 h-3 text-red-600" />
                                {match.row.group}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[11px] border border-amber-200">
                                <Layers className="w-3 h-3 text-amber-700" />
                                {match.row.group}
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded text-[10px] border border-red-200">
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              NÃO ENCONTRADO
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          {match.found && match.row?.saida ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              {match.row.saida}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-mono">—</span>
                          )}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          {match.found && match.row?.motivo ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              {match.row.motivo}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-mono">—</span>
                          )}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap font-bold text-amber-900">
                          {match.found && match.row?.concat ? match.row.concat : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopySingleRowDetail(match, globalIdx)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 text-[10px] font-mono font-medium transition-colors"
                              title="Copiar ID, Grupo e Saída"
                            >
                              {copiedDetailIdx === globalIdx ? (
                                <span className="text-green-600 font-bold">Copiado</span>
                              ) : (
                                <span>Copiar</span>
                              )}
                            </button>

                            {match.found && match.row && (
                              <button
                                onClick={() => setExpandedRowIdx(isExpanded ? null : globalIdx)}
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
                            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2 flex items-center justify-between flex-wrap gap-2">
                              <div>
                                Detalhes do ID: <span className="text-gray-900 font-mono font-bold text-xs">{match.searchTerm}</span>
                              </div>
                              {match.row.rawFields?.['Lista de Coleta'] && (
                                <span className="bg-blue-100 text-[#3483FA] text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                                  Origem: {match.row.rawFields['Lista de Coleta']}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px]">
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Saída</span>
                                <span className="truncate block font-mono font-bold text-blue-700">{match.row.saida || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Motivo</span>
                                <span className="truncate block font-mono font-bold text-amber-800">{match.row.motivo || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Rota</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.rawFields?.['Rota'] || match.row.concat || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Bipado por</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.rawFields?.['Bipado por'] || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Data / Horário</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.rawFields?.['Data / Hora'] || match.row.rawFields?.['Horário do Bip'] || '—'}</span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded p-1.5 shadow-2xs">
                                <span className="block text-[9px] font-bold text-gray-400 uppercase">Reversão</span>
                                <span className="truncate block font-mono text-gray-800">{match.row.reversao || '—'}</span>
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
          {renderLookupPagination('bottom')}
        </div>
      ) : null}

      {/* MODAL DE IMPORTAÇÃO DE GRUPOS */}
      {showGruposModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <ListPlus className="w-5 h-5 text-purple-600" />
                  Importar Grupo de Lista de Coleta
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Selecione um grupo para carregar os IDs na consulta.</p>
              </div>
              <button onClick={() => setShowGruposModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-4">
              {listas.filter(l => l.tipo === 'grupos' && l.grupos && l.grupos.length > 0).length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <Layers className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">Nenhuma Lista com Grupos encontrada.</p>
                </div>
              ) : (
                listas.filter(l => l.tipo === 'grupos' && l.grupos && l.grupos.length > 0).map(lista => (
                  <div key={lista.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-800">{lista.nome}</span>
                      <span className="text-xs text-gray-500">{lista.data}</span>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {lista.grupos?.map(grupo => {
                        const idsDoGrupo = lista.itens.filter(i => i.grupoId === grupo.id).map(i => i.codigo);
                        return (
                          <button
                            key={grupo.id}
                            onClick={() => {
                              if (idsDoGrupo.length > 0) {
                                const currentInput = inputText.trim();
                                const newIds = idsDoGrupo.join('\n');
                                setInputText(currentInput ? `${currentInput}\n${newIds}` : newIds);
                              }
                              setShowGruposModal(false);
                            }}
                            className="flex flex-col items-start gap-1 p-3 rounded-lg border border-purple-100 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition-colors text-left group cursor-pointer"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-bold text-sm text-purple-900 group-hover:text-purple-700">
                                {grupo.nome}
                              </span>
                              <span className="text-xs font-bold px-2 py-0.5 bg-white text-purple-700 rounded-full border border-purple-200 shadow-sm">
                                {idsDoGrupo.length}
                              </span>
                            </div>
                            <span className="text-[10px] text-purple-600 font-medium">Líder: {grupo.lider}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowGruposModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
