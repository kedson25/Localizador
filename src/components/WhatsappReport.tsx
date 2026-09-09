import React, { useState, useMemo, useEffect } from 'react';
import {
  Copy,
  Check,
  Share2,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { CsvRow, ColetaLista } from '../types';
import { cleanDigits } from '../utils/csvParser';
import { listenToListas } from '../lib/firebase';

interface WhatsappReportProps {
  rows: CsvRow[];
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

  const getTodayFormatted = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getDefaultGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Bom dia, time!';
    } else if (hour >= 12 && hour < 18) {
      return 'Boa tarde, time!';
    } else {
      return 'Boa noite, time!';
    }
  };

  const extractCleanCycle = (val: string): string => {
    if (!val) return 'SD';
    let cleaned = val.replace(/^(ciclos?|sa[íi]da|origem)[:\s-]*/gi, '').trim();
    cleaned = cleaned.replace(/^(ciclos?|sa[íi]da|origem)[:\s-]*/gi, '').trim();
    return cleaned.toUpperCase() || 'SD';
  };

  const [greeting] = useState<string>(getDefaultGreeting());
  const [reportDate] = useState<string>(getTodayFormatted());
  const [customCycle, setCustomCycle] = useState<string>('');

  const parsedIds = useMemo(() => {
    if (!inputText.trim()) return [];
    const rawTokens = inputText.split(/[\n\r,;\t\s]+/);
    const uniqueTokens = Array.from(new Set(rawTokens.map((t) => t.trim()).filter((t) => t.length > 0)));
    return uniqueTokens;
  }, [inputText]);

  const selectedLista = useMemo(() => listas.find(l => l.id === selectedListaId), [listas, selectedListaId]);

  const { matchedRows, notFoundIds, detectedSaidaList, motivosCount } = useMemo(() => {
    if (selectedLista) {
      const motivosMap = new Map<string, number>();
      const saidasSet = new Set<string>();

      selectedLista.itens.forEach((i) => {
        const mot = (i.motivo || 'Sem Motivo').trim();
        motivosMap.set(mot, (motivosMap.get(mot) || 0) + 1);

        const sai = (i.saida || selectedLista.saidaPadrao || '').trim();
        if (sai) saidasSet.add(sai);
      });

      return {
        matchedRows: selectedLista.itens as unknown as CsvRow[],
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
        match = rows.find(
          (r) =>
            r.id === term ||
            (cleanTerm && r.cleanId === cleanTerm) ||
            r.id.includes(term) ||
            (r.concat && r.concat.includes(term))
        );
      }

      if (match) {
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

  const generatedMessage = useMemo(() => {
    const totalCount = matchedRows.length;
    const activeCycle = extractCleanCycle(customCycle || 'SD');

    const defaultFooter = `Anexado o reporte com os pacotes adicionados ao ciclo ${activeCycle}.`;

    let motivosText = '';
    if (motivosCount.length > 0) {
      motivosText = motivosCount
        .map((m) => `* ${m.name}: ${m.count} ${m.count === 1 ? 'pacote' : 'pacotes'}`)
        .join('\n');
    } else {
      motivosText = '* Sem motivos identificados';
    }

    const lines = [
      greeting,
      '',
      'Segue o reporte da lista de inventário de hoje.',
      '',
      `Lista total: ${totalCount} ${totalCount === 1 ? 'pacote' : 'pacotes'}`,
      '',
      `Ciclo ${activeCycle} (${reportDate})`,
      '',
      motivosText,
      '',
      defaultFooter,
    ];

    return lines.join('\n');
  }, [greeting, matchedRows.length, customCycle, reportDate, motivosCount]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
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
    <div className="space-y-4 font-sans text-slate-800">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Parâmetros do Reporte
              </label>

              <div className="flex items-center gap-1.5">
                <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors border border-slate-300">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Arquivo</span>
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
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Selecionar Lista
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
                  className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold text-slate-900 outline-none"
                >
                  <option value="">-- Nenhuma (Cole os IDs abaixo) --</option>
                  {listas.map((lista) => (
                    <option key={lista.id} value={lista.id}>
                      {lista.nome} ({lista.data})
                    </option>
                  ))}
                </select>
              </div>

              {!selectedListaId && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setUseAllBase(false)}
                      className={`py-1.5 px-2 rounded border font-bold text-xs cursor-pointer ${
                        !useAllBase
                          ? 'bg-slate-100 border-slate-400 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      Colar IDs Específicos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseAllBase(true);
                        setInputText('');
                      }}
                      className={`py-1.5 px-2 rounded border font-bold text-xs cursor-pointer ${
                        useAllBase
                          ? 'bg-slate-100 border-slate-400 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      Toda a Base ({rows.length})
                    </button>
                  </div>

                  {!useAllBase && (
                    <textarea
                      rows={6}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Cole os IDs aqui..."
                      className="w-full bg-white border border-slate-300 rounded p-2.5 font-mono text-xs text-slate-900 outline-none"
                    />
                  )}
                </>
              )}

              {(selectedLista || useAllBase) && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-600" />
                  <span>
                    Usando {selectedLista ? selectedLista.itens.length : rows.length} registros para o cálculo.
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
              <div className="border border-slate-200 rounded p-2 bg-slate-50">
                <span className="block text-[10px] text-slate-500 font-sans font-bold uppercase">Informados</span>
                <span className="text-sm font-bold text-slate-900">
                  {selectedLista ? selectedLista.itens.length : (useAllBase ? rows.length : parsedIds.length)}
                </span>
              </div>

              <div className="border border-slate-200 rounded p-2 bg-slate-50">
                <span className="block text-[10px] text-slate-500 font-sans font-bold uppercase">Encontrados</span>
                <span className="text-sm font-bold text-slate-900">{matchedRows.length}</span>
              </div>

              <div className="border border-slate-200 rounded p-2 bg-slate-50">
                <span className="block text-[10px] text-slate-500 font-sans font-bold uppercase">Não Encontrados</span>
                <span className={`text-sm font-bold ${notFoundIds.length > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                  {notFoundIds.length}
                </span>
              </div>
            </div>

            {notFoundIds.length > 0 && !useAllBase && (
              <div className="border border-red-200 bg-red-50 rounded p-2.5 text-xs text-red-800 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  {notFoundIds.length} IDs não constam na base:
                </div>
                <div className="max-h-20 overflow-y-auto font-mono text-[11px] text-red-700">
                  {notFoundIds.join(', ')}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Motivos Calculados
            </h3>

            {motivosCount.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">
                Sem motivos para exibir.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
                {motivosCount.map((m) => (
                  <div key={m.name} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-200 rounded">
                    <span className="font-semibold text-slate-800">{m.name}</span>
                    <span className="font-bold text-slate-900">{m.count} pcts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Texto para Envio
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                <button
                  onClick={handleShareWhatsapp}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Enviar WhatsApp</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded border border-slate-200 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
              {generatedMessage}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
