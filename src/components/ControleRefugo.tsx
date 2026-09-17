import React, { useState, useEffect, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, Search, XCircle, Lock, Unlock, Download, FilePlus, X, FolderPlus, ListPlus, Check, Star } from 'lucide-react';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import { saveRefugo, clearRefugo, saveRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo, saveLista, listenToListas, addItemsBatchToLista, getAllItemsForExport, addRefugoScan, deleteRefugoScan } from '../lib/firebase';
import { cleanDigits, cleanTrackingId, normalizeTrackingCode } from '../utils/csvParser';
import type { User } from '../lib/auth';
import { ResultPagination, RESULTS_PAGE_SIZE } from './ResultPagination';
import { PageSkeleton } from './PageSkeleton';

import { RefugoScan } from "../lib/firebase";

let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.error("Audio beep error:", e);
  }
};

export function ControleRefugo({ currentUser }: { currentUser?: User | null }) {
  const [rows, setRows] = useState<RefugoRow[]>([]);
  const [scannedItems, setRefugoScans] = useState<RefugoScan[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error' | 'high_priority' | 'high_priority_no_route' | 'success_no_route', message: string, rota?: string, id?: string } | null>(null);
  const [highPriorityAlert, setHighPriorityAlert] = useState<RefugoRow | null>(null);
  const [baseDate, setBaseDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scansReady, setScansReady] = useState(false);
  const [listasReady, setListasReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(scannedItems.length / RESULTS_PAGE_SIZE) - 1));
  const codeKey = (code: string) => normalizeTrackingCode(code);
  const rowByCode = useMemo(() => new Map(rows.map(row => [codeKey(row.id), row])), [rows]);
  const scanByCode = useMemo(() => new Map(scannedItems.map(scan => [scan.normalizedId || codeKey(scan.id), scan])), [scannedItems]);
  const showError = (error: unknown) => setSyncError(error instanceof Error ? error.message : 'Não foi possível confirmar a operação no servidor. Tente novamente.');

  // Auto focus input when bip is unlocked
  useEffect(() => {
    if (!isLocked) {
      const timer = setTimeout(() => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLocked, busy, scannedItems.length]);

  // Modal / Popup States for Exporting to Lista Branca
  const [existingListas, setExistingListas] = useState<ColetaLista[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDestinationType, setExportDestinationType] = useState<'new' | 'existing'>('new');
  const [exportListName, setExportListName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [exportSaida, setExportSaida] = useState('Ciclo 2 - Saída PM');
  const [exportMotivo, setExportMotivo] = useState('Brancas');
  const [exportTargetCodes, setExportTargetCodes] = useState<string[]>([]);

  const parseCSV = (text: string): RefugoRow[] => {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    if (result.errors.some(error => error.type === 'Quotes')) throw new Error('O arquivo CSV contém aspas inválidas. Confira o arquivo.');
    
    const headerRow = result.data.find(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      return ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id);
    });

    let valorRealIndex = -1;
    let valorUsdIndex = -1;

    if (headerRow) {
      headerRow.forEach((col, idx) => {
        const c = String(col).trim().toUpperCase();
        if (c.includes('VALOR REAL')) valorRealIndex = idx;
        if (c.includes('VALOR USD')) valorUsdIndex = idx;
      });
    } else {
      valorRealIndex = 5;
      valorUsdIndex = 6;
    }

    return result.data.flatMap(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      if (!id || ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id)) return [];
      
      let isHighPriority = false;
      [valorRealIndex, valorUsdIndex].forEach(idx => {
         if (idx >= 0 && values[idx]) {
           const valStr = values[idx].replace(/\./g, '').replace(',', '.').trim();
           const val = parseFloat(valStr);
           if (!isNaN(val) && val > 1000) {
             isHighPriority = true;
           }
         }
      });

      return [{ id, rota: String(values[1] || 'Sem Rota').trim(), isHighPriority, rawFields: Object.fromEntries(values.map((value, index) => [String(index), value])) }];
    });
  };

  useEffect(() => {
    const unsubRefugo = listenToRefugo(data => {
      try {
        setRows(data?.rawText ? parseCSV(data.rawText) : []);
        setBaseDate(data?.updatedAt ? new Date(data.updatedAt).toLocaleString('pt-BR') : null);
      } catch (error) { setRows([]); showError(error); }
      setIsLoading(false);
    });
    
    const unsubScans = listenToRefugoScans((scans) => {
      setRefugoScans(scans.map(scan => ({ ...scan, scannedAt: new Date(scan.scannedAt) })));
      setScansReady(true);
    });
    
    const unsubListas = listenToListas(data => { 
      setExistingListas(data); 
      setListasReady(true); 
    });
    
    return () => { unsubRefugo(); unsubScans(); unsubListas(); };
  }, []);

  const runOperation = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
      setSyncError(null);
    } catch (error) { showError(error); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await runOperation(async () => {
      const text = await file.text();
      const parsed = parseCSV(text);
      await saveRefugo(text, parsed.length);
      setLastScanResult(null);
      setPage(0);
    });
  };

  const clearData = async () => {
    if (!window.confirm('Deseja realmente limpar a base de faltantes? (Isso também apagará os itens bipados)')) return;
    await runOperation(async () => {
      await clearRefugo();
      await clearRefugoScans();
      setLastScanResult(null);
    });
  };

  const clearScans = async () => {
    if (!window.confirm('Deseja limpar apenas o histórico de pacotes bipados?')) return;
    await runOperation(async () => {
      await clearRefugoScans();
      setLastScanResult(null);
    });
  };

  
  const handleBip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim() || isLocked) return;
    
    const cleanInput = cleanTrackingId(bipInput);
    if (!cleanInput) {
      setBipInput('');
      return;
    }

    const key = codeKey(bipInput);
    const alreadyScanned = scanByCode.get(key);
    
    if (alreadyScanned) {
      setLastScanResult({ status: alreadyScanned.status === 'found' ? 'success' : 'error', message: 'O pacote já foi bipado anteriormente!', id: alreadyScanned.id });
      setBipInput('');
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }

    const foundRow = rowByCode.get(key);
    
    setBipInput('');
    setTimeout(() => inputRef.current?.focus(), 10);
    
    await runOperation(async () => {
      const newScan: Omit<RefugoScan, 'firestoreId'> = {
        id: foundRow?.id || cleanInput,
        normalizedId: key,
        rota: foundRow?.rota || '',
        scannedAt: new Date().toLocaleString('pt-BR'),
        timestamp: Date.now(),
        status: foundRow ? 'found' : 'not_found',
        foundBy: currentUser?.username || 'Operador'
      };

      await addRefugoScan(newScan);

      if (foundRow) {
        if (foundRow.isHighPriority) {
           const isSemRota = !foundRow.rota || foundRow.rota.toUpperCase() === 'SEM ROTA' || foundRow.rota.toUpperCase() === 'SEM ROTA ';
           setLastScanResult({ status: isSemRota ? 'high_priority_no_route' : 'high_priority', message: '', rota: foundRow.rota, id: foundRow.id });
        } else {
           const isSemRota = !foundRow.rota || foundRow.rota.toUpperCase() === 'SEM ROTA' || foundRow.rota.toUpperCase() === 'SEM ROTA ';
           setLastScanResult({ status: isSemRota ? 'success_no_route' : 'success', message: 'Pacote localizado!', rota: foundRow.rota, id: foundRow.id });
        }

        
      } else {
        setLastScanResult({ status: 'error', message: `Bipado: ${cleanInput}`, id: cleanInput });
      }
      setPage(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    });
  };

  const removeScan = async (scan: RefugoScan) => {
    const targetId = scan.normalizedId || codeKey(scan.id);
    await runOperation(async () => {
      await deleteRefugoScan(targetId);
    });
  };

  const exportScannedCSV = () => {
    if (scannedItems.length === 0) return;
    const csvContent = "ID,ROTA,ENCONTRADO POR\n" + scannedItems.map(r => `${r.id},${r.status === 'found' ? r.rota : 'SEM ROTA'},${r.foundBy || ''}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "log_coletor_bipados.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExportModal = () => {
    // 1. Pacotes bipados que estão sem rota (status 'not_found' ou 'SEM ROTA')
    const scannedSemRota = scannedItems.filter(
      s => s.status === 'not_found' || s.rota === 'SEM ROTA' || s.rota === 'Sem Rota' || !s.rota
    );

    // 2. Pacotes da base que estão sem rota
    const baseSemRota = rows.filter(
      r => !r.rota || r.rota === 'Sem Rota' || r.rota === 'SEM ROTA' || r.rota.toLowerCase().includes('branca')
    );

    let targetCodes: string[] = [];

    if (scannedSemRota.length > 0) {
      targetCodes = scannedSemRota.map(s => s.id.trim().toUpperCase());
    } else if (baseSemRota.length > 0) {
      targetCodes = baseSemRota.map(r => r.id.trim().toUpperCase());
    } else if (scannedItems.length > 0) {
      if (window.confirm("Não foram encontrados pacotes especificamente marcados como 'SEM ROTA'. Deseja exportar todos os pacotes bipados para a Lista Branca?")) {
        targetCodes = scannedItems.map(s => s.id.trim().toUpperCase());
      } else {
        return;
      }
    }

    const uniqueCodes = Array.from(new Set(targetCodes)).filter(Boolean);

    if (uniqueCodes.length === 0) {
      alert('Nenhum pacote sem rota ("SEM ROTA") foi encontrado para exportar.');
      return;
    }

    const now = new Date();
    const todayBR = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    setExportTargetCodes(uniqueCodes);
    setExportListName(`Lista Branca - Refugo (${todayBR})`);
    setExportDestinationType('new');
    if (existingListas.length > 0) {
      setSelectedListId(existingListas[0].id);
    }
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    if (exportTargetCodes.length === 0 || busyRef.current) return;

    const operatorName = currentUser?.username || 'Operador';
    const now = new Date();
    const todayBR = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const newColetaItens: ColetaItem[] = exportTargetCodes.map((code, index) => ({
      id: `item-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 5)}`,
      codigo: code,
      rota: 'Brancas',
      saida: exportSaida,
      motivo: exportMotivo,
      scannedAt: new Date().toISOString(),
      responsavel: operatorName,
      validado: true
    }));

    busyRef.current = true;
    setBusy(true);
    try {
      if (exportDestinationType === 'new') {
        const novaLista: ColetaLista = {
          id: `lista-${Date.now()}`,
          nome: exportListName.trim() || `Lista Branca - Refugo (${todayBR})`,
          tipo: 'comum',
          rota: 'Brancas',
          data: todayBR,
          responsavel: operatorName,
          status: 'em_andamento',
          saidaPadrao: exportSaida,
          motivoPadrao: exportMotivo,
          // Removed these invalid properties to fix Type Error:
          // pacotesSemRotaEmFluxo: exportTargetCodes.length,
          // rotasEncontradas: foundCount,
          itens: newColetaItens
        };
        await saveLista(novaLista, true);
      } else {
        const targetList = existingListas.find(l => l.id === selectedListId);
        if (!targetList) {
          alert('Selecione uma lista existente válida.');
          return;
        }

        const currentItens = await getAllItemsForExport(targetList.id);

        // Evitar pacotes duplicados
        const existingCodes = new Set(currentItens.map(i => i.codigo.toUpperCase()));
        const uniqueNewItems = newColetaItens.filter(i => !existingCodes.has(i.codigo.toUpperCase()));

        if (uniqueNewItems.length > 0) {
          await addItemsBatchToLista(targetList.id, uniqueNewItems);
        }
      }

      // Download CSV file
      const csvHeader = "ID,ROTA\n";
      const csvBody = exportTargetCodes.map(code => `${code},Brancas`).join("\n");
      const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `lista_branca_refugo_${todayBR.replace(/\//g, '-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowExportModal(false);
      alert(`✅ Exportação concluída com sucesso!\n\n${exportTargetCodes.length} pacote(s) exportado(s) para o sistema e o arquivo CSV foi baixado.`);
    } catch (err) {
      showError(err);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const foundCount = scannedItems.filter(s => s.status === 'found').length;
  const notFoundCount = scannedItems.filter(s => s.status === 'not_found').length;
  const highPriorityCount = scannedItems.filter(s => {
    const row = rows.find(r => r.id.trim().toUpperCase() === s.id.trim().toUpperCase());
    return row?.isHighPriority;
  }).length;
  const semRotaCount = notFoundCount || rows.filter(r => !r.rota || r.rota === 'Sem Rota' || r.rota === 'SEM ROTA').length;

  if (isLoading || !scansReady || !listasReady) {
    return <PageSkeleton variant="detail" className="mx-auto max-w-7xl pb-12" />;
  }

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
      {syncError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{syncError}</div>}
      {rows.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center mt-4">
          <div className="w-16 h-16 bg-[#E3F2FD] rounded-2xl flex items-center justify-center mb-4">
            <UploadCloud className="w-8 h-8 text-[#3483FA]" />
          </div>
          <h2 className="text-xl font-bold text-[#333333] mb-2">Controle de Refugo</h2>
          <p className="text-gray-500 mb-6 max-w-md">
            Importe a lista de pacotes faltantes em CSV para começar a bipar e dar baixa.
          </p>
          <label className="cursor-pointer bg-[#3483FA] hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
            <UploadCloud className="w-5 h-5" />
            Carregar Base CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        <div className="space-y-4 w-full mt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Scanner Area */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm h-full">
              <h3 className="text-sm font-bold text-[#333333] uppercase tracking-wider mb-6 text-center">Leitura de Pacotes</h3>
              
              <form onSubmit={handleBip} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-gray-700">
                      Bipe o ID do pacote (Foco travado no campo)
                    </label>
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsLocked(!isLocked);
                        if (isLocked) {
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm border ${
                        isLocked 
                          ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {isLocked ? (
                        <><Lock className="w-4 h-4" /> Bip Travado</>
                      ) : (
                        <><Unlock className="w-4 h-4" /> Bip Liberado</>
                      )}
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                      <Barcode className={`h-8 w-8 ${isLocked ? 'text-gray-300' : 'text-[#3483FA]'}`} />
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      value={bipInput}
                      onChange={(e) => setBipInput(e.target.value)}
                      onBlur={() => {
                        if (!isLocked) setTimeout(() => inputRef.current?.focus(), 150);
                      }}
                      disabled={isLocked}
                      className={`block w-full pl-16 pr-6 py-8 border-2 rounded-xl text-3xl font-mono font-bold transition-all ${
                        isLocked 
                          ? 'bg-gray-50 border-gray-200 text-gray-400 placeholder-gray-300 cursor-not-allowed'
                          : 'border-[#3483FA]/30 focus:ring-4 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-300'
                      }`}
                      placeholder={isLocked ? "SISTEMA TRAVADO" : "MLB..."}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-3 text-center font-medium">
                    {isLocked ? 'Desbloqueie para voltar a ler pacotes.' : 'O campo submete automaticamente após a leitura do bipe (Enter).'}
                  </p>
                </div>
                <button type="submit" className="hidden" disabled={isLocked}>Verificar</button>
              </form>

              {lastScanResult && (
                <div className={`mt-8 p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center animate-in zoom-in duration-200 ${
                  lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
                  lastScanResult.status === 'success_no_route' ? 'bg-orange-50 border-orange-200 text-orange-800' : 
                  lastScanResult.status === 'high_priority' ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-[0_0_30px_rgba(250,204,21,0.5)]' :
                  lastScanResult.status === 'high_priority_no_route' ? 'bg-red-600 border-red-700 text-white shadow-[0_0_30px_rgba(220,38,38,0.6)]' :
                  'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {lastScanResult.status === 'high_priority' ? (
                    <AlertCircle className="w-20 h-20 text-yellow-800 mb-4 animate-bounce" />
                  ) : lastScanResult.status === 'high_priority_no_route' ? (
                    <Star className="w-20 h-20 text-white mb-4 animate-pulse fill-yellow-400" />
                  ) : lastScanResult.status === 'success' || lastScanResult.status === 'success_no_route' ? (
                    <CheckCircle2 className={`w-20 h-20 mb-4 ${lastScanResult.status === 'success_no_route' ? 'text-orange-500' : 'text-emerald-500'}`} />
                  ) : (
                    <XCircle className="w-20 h-20 text-red-500 mb-4" />
                  )}
                  <p className="font-black text-3xl uppercase tracking-wide flex flex-col items-center gap-3">
                    <span>{lastScanResult.status === 'high_priority' || lastScanResult.status === 'high_priority_no_route' ? 'ALTA PRIORIDADE BPP' : lastScanResult.status === 'success' || lastScanResult.status === 'success_no_route' ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}</span>
                    {(lastScanResult.status === 'high_priority' || lastScanResult.status === 'high_priority_no_route') && lastScanResult.id && (
                      <span className="text-4xl font-mono bg-black/10 px-6 py-2 rounded-xl mt-1 tracking-widest">{lastScanResult.id}</span>
                    )}
                  </p>
                  <p className={`text-xl font-bold mt-2 ${lastScanResult.status === 'high_priority_no_route' ? 'text-red-100' : ''}`}>{lastScanResult.message}</p>
                  {lastScanResult.rota && (
                    <div className={`mt-4 px-6 py-2 rounded-lg text-2xl font-black shadow-sm uppercase ${
                       lastScanResult.status === 'high_priority' ? 'bg-yellow-100 text-yellow-900' : 
                       lastScanResult.status === 'high_priority_no_route' ? 'bg-red-800 text-white' : 
                       lastScanResult.status === 'success_no_route' ? 'bg-orange-100 text-orange-900' :
                       'bg-white text-emerald-900'
                    }`}>
                      {lastScanResult.status === 'success_no_route' || lastScanResult.status === 'high_priority_no_route' || lastScanResult.rota.toUpperCase().includes('SEM ROTA') ? 'SEM ROTA' : `Rota: ${lastScanResult.rota}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scanned List Area */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col h-full min-h-[500px]">
            {/* Headers and Controls */}
            <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Histórico de Leitura</span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-md font-mono text-xs font-bold border border-yellow-300 flex items-center gap-1 shadow-sm">
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-600" /> Alta Prioridade (BPP): {highPriorityCount}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-mono text-xs font-bold border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Encontrados: {foundCount}
                  </span>
                  <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded-md font-mono text-xs font-bold border border-red-200 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-red-600" /> Sem Rota: {notFoundCount}
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md font-mono text-xs font-bold border border-blue-200">
                    Total: {scannedItems.length}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer bg-[#3483FA] hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4" />
                  Carregar Base
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
                <button
                  onClick={clearData}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={handleOpenExportModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer border border-amber-600"
                  title="Exporta pacotes sem rota (SEM ROTA) para uma Lista Branca no sistema e em CSV"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>Exportar Lista Branca</span>
                  {semRotaCount > 0 && (
                    <span className="bg-amber-700/60 text-white px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {semRotaCount}
                    </span>
                  )}
                </button>

                {scannedItems.length > 0 && (
                  <>
                    <button
                      onClick={clearScans}
                      className="px-3 py-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Limpar Bipados
                    </button>
                    <button
                      onClick={exportScannedCSV}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-[#333333] text-xs font-bold rounded-lg transition-colors border border-gray-300 shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Baixar Bipados (CSV)
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                            {scannedItems.length > 0 ? (
                scannedItems.slice(currentPage * RESULTS_PAGE_SIZE, (currentPage + 1) * RESULTS_PAGE_SIZE).map((item) => {
                  const isItemSemRota = item.status === 'not_found' || !item.rota || item.rota.toUpperCase() === 'SEM ROTA' || item.rota.toUpperCase() === 'SEM ROTA ';
                  const itemRow = rowByCode.get(item.normalizedId || codeKey(item.id));
                  const isBpp = Boolean(itemRow?.isHighPriority);
                  
                  // Color classes based on:
                  // - With route: Green
                  // - Sem rota BPP: Yellow (Amarelo)
                  // - Sem rota normal: Red (Vermelho)
                  let cardClasses = 'border-emerald-200 bg-emerald-50';
                  let idColor = 'text-emerald-900';
                  let badgeClasses = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  
                  if (isItemSemRota) {
                    if (isBpp) {
                      cardClasses = 'border-yellow-300 bg-yellow-50';
                      idColor = 'text-yellow-900';
                      badgeClasses = 'bg-yellow-100 text-yellow-900 border-yellow-300';
                    } else {
                      cardClasses = 'border-red-200 bg-red-50';
                      idColor = 'text-red-900';
                      badgeClasses = 'bg-red-100 text-red-800 border-red-200';
                    }
                  }
                  
                  return (
                  <div key={item.id} className={`flex justify-between items-center p-3 rounded-lg border transition-opacity ${cardClasses}`}>
                    <div className="flex items-center gap-2">
                      {!isItemSemRota ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isBpp ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className={`font-mono font-bold text-sm ${idColor}`}>{item.id}</span>
                      {isBpp && isItemSemRota && (
                        <span className="text-[10px] bg-yellow-200 text-yellow-800 font-bold px-1.5 py-0.5 rounded uppercase">BPP</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isItemSemRota ? (
                        <div className="flex flex-col items-end">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold border ${badgeClasses}`}>
                            Rota: {item.rota}
                          </span>
                          {item.foundBy && (
                            <span className="text-[10px] text-gray-500 mt-0.5 font-medium">
                              Encontrado por: <strong className="text-gray-700">{item.foundBy}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold border ${badgeClasses}`}>
                            SEM ROTA
                          </span>
                          {item.foundBy && (
                            <span className="text-[10px] text-gray-500 mt-0.5 font-medium">
                              Bipado por: <strong className="text-gray-700">{item.foundBy}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => removeScan(item)}
                        className="ml-1 text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
                        title="Remover pacote"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                   <Barcode className="w-12 h-12 text-gray-300 mb-3" />
                   <p className="text-base font-bold text-[#333333]">Nenhum pacote bipado</p>
                   <p className="text-sm mt-1">Comece a ler os pacotes para ver o histórico.</p>
                </div>
              )}
            </div>
            
            {scannedItems.length > 50 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
              </div>
            )}
            
          </div>
        </div>
      </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 uppercase">Exportar Lista Branca</h2>
                <p className="text-sm text-gray-500 mt-1 font-medium">Transferir pacotes sem rota para o sistema de coleta</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold text-sm text-amber-950">
                    {exportTargetCodes.length} pacote(s) sem rota selecionado(s)
                  </p>
                  <p className="mt-1 text-amber-800 line-clamp-2 font-mono">
                    {exportTargetCodes.slice(0, 6).join(', ')}{exportTargetCodes.length > 6 ? '...' : ''}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Destino da Exportação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('new')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      exportDestinationType === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <FolderPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Criar Nova Lista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('existing')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      exportDestinationType === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <ListPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Lista Existente</span>
                  </button>
                </div>
              </div>

              {exportDestinationType === 'new' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nome da Nova Lista</label>
                  <input
                    type="text"
                    value={exportListName}
                    onChange={(e) => setExportListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                    placeholder="Ex: Lista Branca - Refugo"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Selecione a Lista</label>
                  {existingListas.length > 0 ? (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      {existingListas.map(lista => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} ({lista.rota || 'Geral'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      Nenhuma lista de coleta encontrada no sistema. Crie uma nova lista.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Saída Padrão</label>
                  <input
                    type="text"
                    value={exportSaida}
                    onChange={(e) => setExportSaida(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Motivo</label>
                  <input
                    type="text"
                    value={exportMotivo}
                    onChange={(e) => setExportMotivo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors uppercase"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmExport}
                disabled={busy || (exportDestinationType === 'existing' && existingListas.length === 0)}
                className="flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 uppercase cursor-pointer"
              >
                {busy ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Exportação
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}