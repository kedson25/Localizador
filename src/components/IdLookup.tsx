import React, { useState, useMemo, useEffect } from 'react';
import { Copy, Check, AlertCircle, Layers, X, ChevronDown, ChevronUp, Filter, ListPlus } from 'lucide-react';
import { CsvRow, LookupMatch, ColetaLista, ColetaItem } from '../types';
import { cleanDigits } from '../utils/csvParser';
import { listenToListas } from '../lib/firebase';

interface IdLookupProps {
  rows: CsvRow[];
  onNavigateToUpload: () => void;
}

export const IdLookup: React.FC<IdLookupProps> = ({ rows }) => {
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

    const rowMap = new Map<string, CsvRow>();
    if (rows && rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.id) rowMap.set(r.id, r);
        if (r.originalId) rowMap.set(r.originalId, r);
        if (r.cleanId) rowMap.set(r.cleanId, r);
        if (r.concat) rowMap.set(r.concat, r);
      }
    }

    const listaItemMap = new Map<string, { item: ColetaItem; lista: ColetaLista; grupoNome?: string }>();
    if (listas && listas.length > 0) {
      for (const lista of listas) {
        if (!lista.itens) continue;
        for (const item of lista.itens) {
          if (!item.codigo) continue;
          const cleanCod = cleanDigits(item.codigo);
          let grupoNome = '';
          if (item.grupoId && lista.grupos) {
            const g = lista.grupos.find((grp) => grp.id === item.grupoId);
            if (g) grupoNome = g.nome;
          }
          const entry = { item, lista, grupoNome };
          listaItemMap.set(item.codigo, entry);
          if (cleanCod) listaItemMap.set(cleanCod, entry);
        }
      }
    }

    const processedTerms = new Set<string>();
    const results: LookupMatch[] = [];

    for (const term of rawTerms) {
      if (processedTerms.has(term)) continue;
      processedTerms.add(term);

      const cleanTerm = cleanDigits(term);

      const matchedRow = rowMap.get(term) || (cleanTerm ? rowMap.get(cleanTerm) : undefined);
      const foundInLista = listaItemMap.get(term) || (cleanTerm ? listaItemMap.get(cleanTerm) : null);

      const motivoLista = foundInLista?.item.motivo || foundInLista?.lista.motivoPadrao || '';
      const saidaLista = foundInLista?.item.saida || foundInLista?.lista.saidaPadrao || '';
      const grupoLista = foundInLista?.grupoNome || '';
      const nomeLista = foundInLista?.lista.nome || '';
      const bipadoPor = foundInLista?.item.responsavel || foundInLista?.lista.responsavel || '';
      const horarioBip = foundInLista?.item.scannedAt || '';
      const rotaLista = foundInLista?.item.rota || foundInLista?.lista.rota || '';

      if (matchedRow) {
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
        results.push({
          searchTerm: term,
          cleanSearchTerm: cleanTerm,
          found: false
        });
      }
    }

    return results;
  }, [inputText, rows, listas]);

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

  const filteredMatches = useMemo(() => {
    let list = matches;
    if (saidaFilter) {
      list = list.filter((m) => {
        if (!m.found || !m.row) return false;
        return (m.row.saida || '').toLowerCase().includes(saidaFilter.toLowerCase());
      });
    }

    return [...list].sort((a, b) => {
      if (a.found && !b.found) return -1;
      if (!a.found && b.found) return 1;

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

      return a.searchTerm.localeCompare(b.searchTerm, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [matches, saidaFilter]);

  const foundMatchesCount = useMemo(() => {
    return filteredMatches.filter((m) => m.found).length;
  }, [filteredMatches]);

  const notFoundMatchesCount = useMemo(() => {
    return filteredMatches.filter((m) => !m.found).length;
  }, [filteredMatches]);

  const handleCopySummary = () => {
    if (filteredMatches.length === 0) return;

    const lines: string[] = [];
    filteredMatches.forEach((m) => {
      if (m.found && m.row) {
        const id = m.searchTerm;
        const group = m.row.group || 'Sem Grupo';
        const saida = m.row.saida || '-';
        lines.push(`${id}\t${group}\t${saida}`);
      } else {
        lines.push(`${m.searchTerm}\tNÃO ENCONTRADO\t-`);
      }
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySingleRowDetail = (match: LookupMatch, idx: number) => {
    let text = match.searchTerm;
    if (match.found && match.row) {
      text = `${match.searchTerm}\t${match.row.group || ''}\t${match.row.saida || ''}`;
    } else {
      text = `${match.searchTerm}\tNÃO ENCONTRADO`;
    }
    navigator.clipboard.writeText(text);
    setCopiedDetailIdx(idx);
    setTimeout(() => setCopiedDetailIdx(null), 1500);
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      
      {/* Search Input Box */}
      <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Consulta de IDs em Lote
            </h2>
            <p className="text-xs text-slate-500">
              Cole ou digite os códigos (um por linha ou separados por espaço/vírgula)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGruposModal(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
            >
              <ListPlus className="w-3.5 h-3.5 text-slate-600" />
              <span>Importar Grupo de Lista</span>
            </button>

            {inputText && (
              <button
                onClick={() => {
                  setInputText('');
                  setSaidaFilter('');
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          rows={5}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Cole os IDs aqui..."
          className="w-full border border-slate-300 rounded p-3 text-xs font-mono focus:border-[#3483FA] outline-none"
        />

        {/* Filters and Actions toolbar */}
        {inputText.trim().length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-600">Filtrar Saída:</label>
              <select
                value={saidaFilter}
                onChange={(e) => setSaidaFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-medium focus:border-[#3483FA] outline-none"
              >
                <option value="">Todas as Saídas</option>
                {availableSaidas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-600">
                {foundMatchesCount} encontrados / {notFoundMatchesCount} não encontrados
              </span>

              <button
                onClick={handleCopySummary}
                className="px-3 py-1.5 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar Resultado'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      {inputText.trim().length > 0 && filteredMatches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-mono font-bold text-[11px]">
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3">ID / Pacote</th>
                  <th className="py-2 px-3">Grupo</th>
                  <th className="py-2 px-3">Saída</th>
                  <th className="py-2 px-3">Motivo</th>
                  <th className="py-2 px-3">Rota</th>
                  <th className="py-2 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredMatches.map((match, idx) => {
                  const isExpanded = expandedRowIdx === idx;
                  return (
                    <React.Fragment key={`${match.searchTerm}-${idx}`}>
                      <tr className={!match.found ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                        <td className="py-2 px-3 text-slate-400 text-[10px]">{idx + 1}</td>

                        <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{match.searchTerm}</span>
                            {match.found && match.row?.rawFields?.['Lista de Coleta'] && (
                              <span className="text-[10px] text-[#3483FA] font-sans font-normal truncate max-w-[180px]">
                                {match.row.rawFields['Lista de Coleta']}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          {match.found && match.row ? (
                            match.row.group === 'ERROS' ? (
                              <span className="inline-flex items-center gap-1 text-red-700 font-bold text-xs">
                                <AlertCircle className="w-3 h-3 text-red-600" />
                                {match.row.group}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-800 font-bold text-xs">
                                <Layers className="w-3 h-3 text-slate-500" />
                                {match.row.group}
                              </span>
                            )
                          ) : (
                            <span className="text-red-600 font-bold text-xs">NÃO ENCONTRADO</span>
                          )}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                          {match.found && match.row?.saida ? match.row.saida : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                          {match.found && match.row?.motivo ? match.row.motivo : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap font-bold text-slate-800">
                          {match.found && match.row?.concat ? match.row.concat : '—'}
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopySingleRowDetail(match, idx)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                            >
                              {copiedDetailIdx === idx ? 'Copiado' : 'Copiar'}
                            </button>

                            {match.found && match.row && (
                              <button
                                onClick={() => setExpandedRowIdx(isExpanded ? null : idx)}
                                className="p-1 text-slate-500 hover:text-slate-800 bg-slate-100 rounded border border-slate-200 cursor-pointer"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && match.found && match.row && (
                        <tr className="bg-slate-50 border-b border-slate-200 font-sans">
                          <td colSpan={7} className="p-3">
                            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                              Detalhes do ID: <span className="text-slate-900 font-mono font-bold text-xs">{match.searchTerm}</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Saída</span>
                                <span className="font-mono font-bold text-slate-800">{match.row.saida || '—'}</span>
                              </div>
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Motivo</span>
                                <span className="font-mono font-bold text-slate-800">{match.row.motivo || '—'}</span>
                              </div>
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Rota</span>
                                <span className="font-mono text-slate-800">{match.row.rawFields?.['Rota'] || match.row.concat || '—'}</span>
                              </div>
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Bipado por</span>
                                <span className="font-mono text-slate-800">{match.row.rawFields?.['Bipado por'] || '—'}</span>
                              </div>
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Data / Horário</span>
                                <span className="font-mono text-slate-800">{match.row.rawFields?.['Data / Hora'] || match.row.rawFields?.['Horário do Bip'] || '—'}</span>
                              </div>
                              <div className="bg-white border border-slate-200 rounded p-2">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase">Reversão</span>
                                <span className="font-mono text-slate-800">{match.row.reversao || '—'}</span>
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
      )}

      {/* Modal Importar Grupo */}
      {showGruposModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded p-5 max-w-xl w-full border border-slate-200 shadow-lg flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Importar Grupo de Lista de Coleta
              </h3>
              <button onClick={() => setShowGruposModal(false)} className="text-slate-400 hover:text-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3">
              {listas.filter(l => l.tipo === 'grupos' && l.grupos && l.grupos.length > 0).length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Nenhuma lista com grupos encontrada.
                </div>
              ) : (
                listas.filter(l => l.tipo === 'grupos' && l.grupos && l.grupos.length > 0).map(lista => (
                  <div key={lista.id} className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{lista.nome}</span>
                      <span className="text-slate-500 text-[11px]">{lista.data}</span>
                    </div>
                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                            className="p-2.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-slate-800">
                                {grupo.nome}
                              </span>
                              <span className="text-[11px] font-mono font-bold text-slate-600">
                                {idsDoGrupo.length} IDs
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-0.5">Líder: {grupo.lider}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-2 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowGruposModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold cursor-pointer"
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
