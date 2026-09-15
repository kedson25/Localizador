import React, { useState, useEffect, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, Search, XCircle, Lock, Unlock, Download, FilePlus, X, FolderPlus, ListPlus, Check } from 'lucide-react';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import { saveRefugo, clearRefugo, saveRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo, saveLista, listenToListas, addItemsBatchToLista, getAllItemsForExport } from '../lib/firebase';
import { cleanDigits, cleanTrackingId } from '../utils/csvParser';
import type { User } from '../lib/auth';
import { ResultPagination, RESULTS_PAGE_SIZE } from './ResultPagination';
import { PageSkeleton } from './PageSkeleton';

interface ScannedItem {
  id: string;
  rota: string;
  scannedAt: Date;
  status: 'found' | 'not_found';
  foundBy?: string;
}

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
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string } | null>(null);
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
  const codeKey = (code: string) => cleanDigits(cleanTrackingId(code)) || cleanTrackingId(code) || code.trim().toUpperCase().replace(/M$/, '');
  const rowByCode = useMemo(() => new Map(rows.map(row => [codeKey(row.id), row])), [rows]);
  const scanByCode = useMemo(() => new Map(scannedItems.map(scan => [codeKey(scan.id), scan])), [scannedItems]);
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
    return result.data.flatMap(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      if (!id || ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id)) return [];
      return [{ id, rota: String(values[1] || 'Sem Rota').trim(), rawFields: Object.fromEntries(values.map((value, index) => [String(index), value])) }];
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
      setScannedItems(scans.map(scan => ({ ...scan, scannedAt: new Date(scan.scannedAt) })));
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

    const key = codeKey(cleanInput);
    const rawKey = codeKey(bipInput);
    const alreadyScanned = scanByCode.get(key) || scanByCode.get(rawKey);
    
    if (alreadyScanned) {
      setLastScanResult({ status: alreadyScanned.status === 'found' ? 'success' : 'error', message: 'O pacote já foi bipado anteriormente!' });
      if (alreadyScanned.status === 'found') playBeep();
      setBipInput('');
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }
    
    const foundRow = rowByCode.get(key) || rowByCode.get(rawKey);

    // Limpa o input instantaneamente para não travar a próxima leitura da leitora
    setBipInput('');
    setTimeout(() => inputRef.current?.focus(), 10);
    
    await runOperation(async () => {
      const newScan: ScannedItem = {
        id: foundRow?.id || cleanInput,
        rota: foundRow?.rota || '',
        scannedAt: new Date(),
        status: foundRow ? 'found' : 'not_found',
        foundBy: currentUser?.username || 'Operador'
      };
      const newScans = [newScan, ...scannedItems];
      setScannedItems(newScans);
      await saveRefugoScans(newScans);
      
      if (foundRow) {
        const isHibrida = (foundRow.rota.match(/_/g) || []).length >= 2;
        setLastScanResult({ status: 'success', message: `ROTA VÁLIDA: ${foundRow.rota}${isHibrida ? ' (HÍBRIDA)' : ''}` });
        playBeep();
        if (isHibrida && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const message = new SpeechSynthesisUtterance('Rota Híbrida');
          message.lang = 'pt-BR';
          message.rate = 1.2;
          window.speechSynthesis.speak(message);
        }
      } else {
        setLastScanResult({ status: 'error', message: `Bipado: ${cleanInput}` });
      }
      setPage(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    });
  };

  const foundItems = scannedItems.filter(s => s.status === 'found');


  const removeScan = async (idToRemove: string) => {
    if (!window.confirm(`Deseja remover o pacote ${idToRemove} do histórico?`)) return;
    await runOperation(async () => {
      const newScans = scannedItems.filter(s => s.id !== idToRemove);
      setScannedItems(newScans);
      await saveRefugoScans(newScans);
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
                  lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {lastScanResult.status === 'success' ? (
                    <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-4" />
                  ) : (
                    <XCircle className="w-20 h-20 text-red-500 mb-4" />
                  )}
                  <p className="font-black text-3xl uppercase tracking-wide">
                    {lastScanResult.status === 'success' ? 'ENCONTRADO' : 'ERRO'}
                  </p>
                  <p className="text-xl font-bold mt-2">{lastScanResult.message}</p>
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
                scannedItems.slice(currentPage * RESULTS_PAGE_SIZE, (currentPage + 1) * RESULTS_PAGE_SIZE).map((item) => (
                  <div key={item.id} className={`flex justify-between items-center p-3 rounded-lg border transition-opacity ${item.status === 'found' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-2">
                      {item.status === 'found' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className={`font-mono font-bold text-sm ${item.status === 'found' ? 'text-emerald-900' : 'text-red-900'}`}>{item.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'found' ? (
                        <div className="flex flex-col items-end">
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-xs font-bold border border-emerald-200">
                            Rota: {item.rota}
                          </span>
                          {item.foundBy && (
                            <span className="text-[10px] text-gray-500 mt-0.5 font-medium">
                              Encontrado por: <strong className="text-gray-700">{item.foundBy}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-xs font-bold border border-red-200">
                          SEM ROTA
                        </span>
                      )}
                      <button
                        onClick={() => removeScan(item.id)}
                        className="ml-1 text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
                        title="Remover pacote"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                   <Barcode className="w-12 h-12 text-gray-300 mb-3" />
                   <p className="text-base font-bold text-[#333333]">Nenhum pacote bipado</p>
                   <p className="text-sm mt-1">Comece a ler os pacotes para ver o histórico.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Export Popup / Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FilePlus className="w-6 h-6 text-white" />
                <div>
                  <h3 className="font-bold text-lg leading-tight">Exportar para Lista Branca</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Selecione a lista de destino no sistema</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Pacotes Summary Box */}
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

              {/* Destination Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Destino da Lista no Sistema
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    onClick={() => setExportDestinationType('new')}
                    className={`cursor-pointer border-2 rounded-xl p-3.5 flex flex-col gap-1 transition-all ${
                      exportDestinationType === 'new'
                        ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="destType"
                        checked={exportDestinationType === 'new'}
                        onChange={() => setExportDestinationType('new')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-bold text-xs text-gray-800 flex items-center gap-1">
                        <FolderPlus className="w-4 h-4 text-amber-600" /> Criar Nova Lista
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 pl-5">Gera uma nova lista branca no sistema</span>
                  </label>

                  <label
                    onClick={() => {
                      if (existingListas.length > 0) setExportDestinationType('existing');
                    }}
                    className={`border-2 rounded-xl p-3.5 flex flex-col gap-1 transition-all ${
                      existingListas.length === 0
                        ? 'opacity-50 cursor-not-allowed border-gray-200'
                        : 'cursor-pointer ' + (exportDestinationType === 'existing' ? 'border-amber-500 bg-amber-50/50 shadow-xs' : 'border-gray-200 hover:border-gray-300')
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="destType"
                        disabled={existingListas.length === 0}
                        checked={exportDestinationType === 'existing'}
                        onChange={() => setExportDestinationType('existing')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-bold text-xs text-gray-800 flex items-center gap-1">
                        <ListPlus className="w-4 h-4 text-amber-600" /> Lista Existente
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 pl-5">
                      {existingListas.length === 0 ? 'Nenhuma lista disponível' : 'Anexar itens a uma lista ativa'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Form Options */}
              {exportDestinationType === 'new' ? (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Nome da Nova Lista
                    </label>
                    <input
                      type="text"
                      value={exportListName}
                      onChange={(e) => setExportListName(e.target.value)}
                      placeholder="Ex: Lista Branca - Refugo"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Saída Padrão
                      </label>
                      <select
                        value={exportSaida}
                        onChange={(e) => setExportSaida(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="Ciclo 1 - Saída AM">Ciclo 1 - Saída AM</option>
                        <option value="Ciclo 2 - Saída PM">Ciclo 2 - Saída PM</option>
                        <option value="Inbound">Inbound</option>
                        <option value="Socorro">Socorro</option>
                        <option value="Retorno">Retorno</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Motivo Padrão
                      </label>
                      <select
                        value={exportMotivo}
                        onChange={(e) => setExportMotivo(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="Brancas">Brancas</option>
                        <option value="Refugo">Refugo</option>
                        <option value="Atraso">Atraso</option>
                        <option value="Falta de Capacidade">Falta de Capacidade</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Selecione a Lista de Destino no Sistema
                    </label>
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                    >
                      {existingListas.map((lista) => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} ({lista.totalItens || 0} itens) - {lista.rota || 'Geral'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                  disabled={busy}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Confirmar e Exportar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
