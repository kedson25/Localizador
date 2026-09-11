import React, { useState, useMemo, useEffect } from 'react';
import {
  MessageSquare,
  Copy,
  Check,
  Share2,
  FileText,
  Upload,
  Trash2,
  Layers,
  AlertCircle,
  Clock,
  Calendar,
  Sparkles,
  RefreshCw,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { CsvRow, ColetaLista } from '../types';
import { cleanDigits } from '../utils/csvParser';
import { listenToListas } from '../lib/firebase';

interface WhatsappReportProps {
  rows: CsvRow[];
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function listaDateKey(value: string): string {
  const normalized = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const match = normalized.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : normalized;
}

export function WhatsappReport({ rows }: WhatsappReportProps) {
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [selectedListaId, setSelectedListaId] = useState<string>('');

  useEffect(() => {
    return listenToListas(setListas);
  }, []);

  const [inputText, setInputText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [useAllBase, setUseAllBase] = useState<boolean>(false);

  // Date formatting (DD/MM/YYYY)
  const getTodayFormatted = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Time based greeting:
  // Antes das 12h/13h (1h da tarde): "Bom dia, time! 👋"
  // Das 12h/13h até as 18h: "Boa tarde, time! 👋"
  // A partir das 18h: "Boa noite, time! 👋"
  const getDefaultGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Bom dia, time! 👋';
    } else if (hour >= 12 && hour < 18) {
      return 'Boa tarde, time! 👋';
    } else {
      return 'Boa noite, time! 👋';
    }
  };

  // Helper to extract clean cycle code (e.g., 'PM', 'SD', 'D0') removing words like 'Saida', 'Ciclo', etc.
  const extractCleanCycle = (val: string): string => {
    if (!val) return 'SD';
    let cleaned = val.replace(/^(ciclos?|sa[íi]da|origem)[:\s-]*/gi, '').trim();
    cleaned = cleaned.replace(/^(ciclos?|sa[íi]da|origem)[:\s-]*/gi, '').trim();
    return cleaned.toUpperCase() || 'SD';
  };

  const [greeting, setGreeting] = useState<string>(getDefaultGreeting());
  const [reportDate, setReportDate] = useState<string>(getTodayFormatted());
  const [customCycle, setCustomCycle] = useState<string>('');
  const [customFooterNote, setCustomFooterNote] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Extract pasted IDs
  const parsedIds = useMemo(() => {
    if (!inputText.trim()) return [];
    const rawTokens = inputText.split(/[\n\r,;\t\s]+/);
    const uniqueTokens = Array.from(new Set(rawTokens.map((t) => t.trim()).filter((t) => t.length > 0)));
    return uniqueTokens;
  }, [inputText]);

  // Match IDs with the loaded CSV base
  const selectedLista = useMemo(() => listas.find(l => l.id === selectedListaId), [listas, selectedListaId]);
  const listasDoDia = useMemo(() => {
    const today = localDateKey();
    return listas.filter(lista => listaDateKey(lista.data) === today);
  }, [listas]);
  const listasForaDoDia = useMemo(() => {
    const today = localDateKey();
    return listas.filter(lista => listaDateKey(lista.data) !== today);
  }, [listas]);

  const { matchedRows, notFoundIds, detectedSaidaList, motivosCount } = useMemo(() => {
    if (selectedLista) {
      const motivosMap = new Map<string, number>();
      const saidasSet = new Set<string>();
      const itensSafe = Array.isArray(selectedLista.itens) ? selectedLista.itens : [];

      itensSafe.forEach((i) => {
        const mot = (i.motivo || 'Sem Motivo').trim();
        motivosMap.set(mot, (motivosMap.get(mot) || 0) + 1);

        const sai = (i.saida || selectedLista.saidaPadrao || '').trim();
        if (sai) saidasSet.add(sai);
      });

      return {
        matchedRows: itensSafe as unknown as CsvRow[], // Just for length counting
        notFoundIds: [],
        detectedSaidaList: Array.from(saidasSet),
        motivosCount: Array.from(motivosMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      };
    }

    if (useAllBase) {
      const motivosMap = new Map<string, number>();
      const saidasSet = new Set<string>();

      rows.forEach((r) => {
        const mot = (r.motivo || r.rawFields['MOTIVO'] || 'Sem Motivo').trim();
        motivosMap.set(mot, (motivosMap.get(mot) || 0) + 1);

        const sai = (r.saida || r.rawFields['Saída'] || r.rawFields['Saida'] || '').trim();
        if (sai) saidasSet.add(sai);
      });

      return {
        matchedRows: rows,
        notFoundIds: [],
        detectedSaidaList: Array.from(saidasSet),
        motivosCount: Array.from(motivosMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      };
    }

    if (parsedIds.length === 0 || rows.length === 0) {
      return {
        matchedRows: [],
        notFoundIds: parsedIds,
        detectedSaidaList: [],
        motivosCount: [],
      };
    }

    // Build lookup maps for fast matching
    const rowById = new Map<string, CsvRow>();
    const rowByCleanId = new Map<string, CsvRow>();

    rows.forEach((r) => {
      if (r.id) rowById.set(r.id.trim(), r);
      if (r.originalId) rowById.set(r.originalId.trim(), r);
      if (r.cleanId) rowByCleanId.set(r.cleanId, r);
      if (r.concat) {
        rowById.set(r.concat.trim(), r);
        const concatClean = cleanDigits(r.concat);
        if (concatClean) rowByCleanId.set(concatClean, r);
      }
    });

    const foundList: CsvRow[] = [];
    const notFoundList: string[] = [];
    const seenRowIndices = new Set<number>();
    const saidasSet = new Set<string>();
    const motivosMap = new Map<string, number>();

    parsedIds.forEach((term) => {
      const cleanTerm = cleanDigits(term);
      let match = rowById.get(term) || (cleanTerm ? rowByCleanId.get(cleanTerm) : undefined);

      if (!match) {
        // Fallback search
        match = rows.find(
          (r) =>
            r.id === term ||
            (cleanTerm && r.cleanId === cleanTerm) ||
            r.id.includes(term) ||
            (r.concat && r.concat.includes(term))
        );
      }

      if (match) {
        // Avoid duplicate counting in stats if same ID provided twice
        if (!seenRowIndices.has(match.rowIndex)) {
          seenRowIndices.add(match.rowIndex);
          foundList.push(match);

          const mot = (match.motivo || match.rawFields['MOTIVO'] || 'Sem Motivo').trim();
          motivosMap.set(mot, (motivosMap.get(mot) || 0) + 1);

          const sai = (match.saida || match.rawFields['Saída'] || match.rawFields['Saida'] || '').trim();
          if (sai) saidasSet.add(sai);
        }
      } else {
        notFoundList.push(term);
      }
    });

    return {
      matchedRows: foundList,
      notFoundIds: notFoundList,
      detectedSaidaList: Array.from(saidasSet),
      motivosCount: Array.from(motivosMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [rows, parsedIds, useAllBase, selectedLista]);

  // Set default cycle based on detected saidas if not manually modified
  useEffect(() => {
    if (!customCycle && detectedSaidaList.length > 0) {
      const first = detectedSaidaList[0];
      setCustomCycle(extractCleanCycle(first));
    } else if (!customCycle && rows.length > 0) {
      const firstRowSaida = rows.find((r) => r.saida)?.saida;
      if (firstRowSaida) {
        setCustomCycle(extractCleanCycle(firstRowSaida));
      } else {
        setCustomCycle('SD');
      }
    }
  }, [detectedSaidaList, rows]);

  // Build the WhatsApp message text
  const generatedMessage = useMemo(() => {
    const totalCount = matchedRows.length;
    const activeCycle = extractCleanCycle(customCycle || 'SD');

    const defaultFooter = `📎 Anexado o reporte com os pacotes desconteinerizados adicionados ao ciclo ${activeCycle}.`;
    const finalFooter = customFooterNote.trim() ? customFooterNote.trim() : defaultFooter;

    // Format motivos lines
    let motivosText = '';
    if (motivosCount.length > 0) {
      motivosText = motivosCount
        .map((m) => `* ${m.name}: ${m.count} ${m.count === 1 ? 'pacote' : 'pacotes'}`)
        .join('\n');
    } else {
      motivosText = '* (Nenhum motivo identificado nos IDs)';
    }

    const lines = [
      greeting,
      '',
      'Segue o reporte da lista de inventário de hoje.',
      '',
      `Lista total:  ${totalCount} ${totalCount === 1 ? 'pacote' : 'pacotes'}`,
      '',
      `Origem agregada no Ciclo ${activeCycle}  (${reportDate})`,
      '',
      motivosText,
      '',
      finalFooter,
    ];

    return lines.join('\n');
  }, [greeting, matchedRows.length, customCycle, reportDate, motivosCount, customFooterNote]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Falha ao copiar texto:', err);
    }
  };

  const handleShareWhatsapp = () => {
    const encoded = encodeURIComponent(generatedMessage);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
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

      if (validLines.length === 0) return;

      const extractedIds: string[] = [];
      const startIndex = validLines.length > 1 && !/^\d{5,}/.test(validLines[0].trim()) ? 1 : 0;

      for (let i = startIndex; i < validLines.length; i++) {
        const line = validLines[i].trim();
        if (!line) continue;
        const firstCol = line.split(/[,;\t]/)[0]?.trim().replace(/^["']|["']$/g, '');
        if (firstCol) {
          extractedIds.push(firstCol);
        }
      }

      setUseAllBase(false);
      setInputText(extractedIds.join('\n'));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Main Grid: Input List vs WhatsApp Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: ID Input & Stats (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                Lista de IDs para o Reporte
              </label>

              <div className="flex items-center gap-1.5">
                <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded text-[11px] font-bold transition-colors shadow-2xs">
                  <Upload className="w-3 h-3 text-amber-700" />
                  <span>Carregar arquivo</span>
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {inputText && (
                  <button
                    onClick={() => {
                      setInputText('');
                      setUseAllBase(false);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-medium transition-colors"
                    title="Limpar texto colado"
                  >
                    <Trash2 className="w-3 h-3 text-gray-500" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                  Calcular a partir de uma Lista do Sistema
                </label>
                <select
                  value={selectedListaId}
                  onChange={(e) => {
                    setSelectedListaId(e.target.value);
                    if (e.target.value) {
                      setUseAllBase(false);
                      setInputText('');
                    }
                  }}
                  className="w-full bg-white border border-gray-300 rounded p-2 text-xs font-bold text-gray-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">-- Nenhuma (Usar Colar IDs ou Base CSV) --</option>
                  {listasDoDia.length > 0 && (
                    <optgroup label="Lista atual (hoje)">
                      {listasDoDia.map((lista) => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} (Criada em: {lista.data} - {lista.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {listasForaDoDia.length > 0 && (
                    <optgroup label="Outras listas">
                      {listasForaDoDia.map((lista) => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} (Criada em: {lista.data} - {lista.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {!selectedListaId && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setUseAllBase(false)}
                      className={`py-1.5 px-2 rounded border font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        !useAllBase
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>Colar Lista Específica</span>
                      {parsedIds.length > 0 && !useAllBase && (
                        <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                          {parsedIds.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseAllBase(true);
                        setInputText('');
                      }}
                      className={`py-1.5 px-2 rounded border font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        useAllBase
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>Toda a Base CSV</span>
                      <span className="bg-gray-700 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                        {rows.length}
                      </span>
                    </button>
                  </div>

                  {!useAllBase ? (
                    <div className="relative">
                      <textarea
                        rows={8}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={`Cole aqui os IDs a serem reportados (um por linha ou separados por vírgula)...&#10;Exemplo:&#10;47712645205&#10;47712645206&#10;47712645207`}
                        className="w-full bg-white border border-gray-300 rounded p-2.5 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
                      />
                    </div>
                  ) : (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded p-3 text-xs text-emerald-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        Utilizando todos os {rows.length} registros da base CSV carregada.
                      </p>
                      <p className="text-[11px] text-emerald-800">
                        Os totais e contagens de motivos abaixo refletem a base completa atualizada.
                      </p>
                    </div>
                  )}
                </>
              )}

              {selectedListaId && selectedLista && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded p-3 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    Utilizando os {selectedLista.itens?.length || selectedLista.totalItens || 0} registros da lista selecionada.
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Calculando motivos e saídas diretamente dos dados coletados na lista.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Match Statistics Cards */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
              <div className="bg-gray-50 border border-gray-200 rounded p-2">
                <span className="block text-[10px] text-gray-500 font-sans font-bold uppercase">Informados</span>
                <span className="text-sm font-black text-gray-900">
                  {selectedLista ? (selectedLista.itens?.length || selectedLista.totalItens || 0) : (useAllBase ? rows.length : parsedIds.length)}
                </span>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                <span className="block text-[10px] text-emerald-700 font-sans font-bold uppercase">Encontrados</span>
                <span className="text-sm font-black text-emerald-900">{matchedRows.length}</span>
              </div>

              <div className={`border rounded p-2 ${
                notFoundIds.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <span className="block text-[10px] text-gray-500 font-sans font-bold uppercase">Não Achados</span>
                <span className={`text-sm font-black ${notFoundIds.length > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                  {notFoundIds.length}
                </span>
              </div>
            </div>

            {/* Not Found IDs Warning Box */}
            {notFoundIds.length > 0 && !useAllBase && (
              <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-900 space-y-1.5">
                <div className="flex items-center justify-between font-bold text-red-800">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                    {notFoundIds.length} ID(s) não constam na base CSV:
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto font-mono text-[11px] bg-white p-1.5 rounded border border-red-200 text-red-700 break-all space-y-0.5">
                  {notFoundIds.map((id, idx) => (
                    <div key={idx}>• {id}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Motivos Calculation Table */}
          <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-xs space-y-2">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center justify-between">
              <span>Cálculo dos Motivos Detectados</span>
              <span className="text-[11px] font-mono font-normal text-gray-500">
                {motivosCount.length} motivos
              </span>
            </h3>

            {motivosCount.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2 text-center">
                Cole IDs ou carregue dados para visualizar o cálculo dos motivos.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {motivosCount.map((m) => {
                  const percent = matchedRows.length > 0 ? Math.round((m.count / matchedRows.length) * 100) : 0;
                  return (
                    <div
                      key={m.name}
                      className="flex items-center justify-between p-1.5 bg-gray-50 border border-gray-200 rounded text-xs"
                    >
                      <span className="font-medium text-gray-800 truncate max-w-[200px]" title={m.name}>
                        {m.name}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-[11px] text-gray-500">{percent}%</span>
                        <span className="bg-emerald-100 text-emerald-950 font-bold px-2 py-0.5 rounded text-xs border border-emerald-300">
                          {m.count} {m.count === 1 ? 'pct' : 'pcts'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: WhatsApp Message Output (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Mensagem Formatada para WhatsApp
                </h3>
                <p className="text-[11px] text-gray-500">
                  Pronto para copiar e colar diretamente no chat do grupo.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all shadow-xs ${
                    copied
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                <button
                  onClick={handleShareWhatsapp}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-gray-950 font-bold rounded-md text-xs transition-colors shadow-xs"
                  title="Abrir diretamente no WhatsApp Web"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Enviar no WhatsApp</span>
                </button>
              </div>
            </div>

            {/* WhatsApp Simulation Chat Bubble */}
            <div className="bg-[#EFEAE2] p-4 rounded-lg border border-gray-300/80 shadow-inner relative min-h-[300px]">
              {/* WhatsApp stylized message bubble */}
              <div className="max-w-xl bg-white rounded-lg rounded-tl-xs p-3.5 shadow-sm border border-gray-200/80 space-y-2 relative text-gray-800 text-xs sm:text-sm font-sans leading-relaxed">
                {/* Bubble tail triangle */}
                <div className="absolute top-0 -left-2 w-0 h-0 border-t-8 border-t-white border-l-8 border-l-transparent"></div>

                <div className="whitespace-pre-wrap font-sans select-all leading-normal">
                  {generatedMessage}
                </div>

                <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 font-mono pt-1">
                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-emerald-500 font-bold">✓✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
