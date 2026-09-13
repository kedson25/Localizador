import React, { useState, useEffect, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Barcode, 
  Trash2, 
  Search, 
  XCircle, 
  Lock, 
  Unlock, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  User,
  Clock,
  Sparkles
} from 'lucide-react';
import { RefugoRow } from '../types';
import { saveRefugo, loadRefugo, clearRefugo, saveRefugoScans, loadRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo } from '../lib/firebase';

interface ScannedItem {
  id: string;
  rota: string;
  scannedAt: Date;
  status: 'found' | 'not_found';
  foundBy?: string;
}

let audioCtx: AudioContext | null = null;

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

const playBeep = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (_) {}
    };

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.error("Audio beep error:", e);
  }
};

export function ControleRefugo({ currentUser }: { currentUser?: any }) {
  const [rows, setRows] = useState<RefugoRow[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string } | null>(null);
  const [baseDate, setBaseDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Paginação para pacotes bipados (suporta 9.000+ IDs sem travar)
  const [scanPage, setScanPage] = useState<number>(1);
  const [scanPageSize, setScanPageSize] = useState<number>(100);
  const [jumpScanPageInput, setJumpScanPageInput] = useState<string>('1');

  const totalScanPages = Math.max(1, Math.ceil(scannedItems.length / scanPageSize));

  useEffect(() => {
    if (scanPage > totalScanPages) {
      setScanPage(totalScanPages);
      setJumpScanPageInput(String(totalScanPages));
    }
  }, [totalScanPages, scanPage]);

  const startScanIndex = (scanPage - 1) * scanPageSize;
  const endScanIndex = Math.min(scannedItems.length, startScanIndex + scanPageSize);

  const displayedScans = useMemo(() => {
    return scannedItems.slice(startScanIndex, endScanIndex);
  }, [scannedItems, startScanIndex, endScanIndex]);

  useEffect(() => {
    // Listen to real-time refugo base
    const unsubRefugo = listenToRefugo((data) => {
      if (data && data.rawText) {
        parseCSV(data.rawText, false);
        if (data.updatedAt) {
          const d = typeof data.updatedAt === 'string' ? new Date(data.updatedAt) : (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt));
          setBaseDate(d.toLocaleString('pt-BR'));
        } else {
          setBaseDate(null);
        }
      } else {
        setRows([]);
        setBaseDate(null);
      }
      setIsLoading(false);
    });

    // Listen to real-time scans
    const unsubScans = listenToRefugoScans((scans) => {
      // Fix dates since Firestore might not return Date objects directly
      const parsedScans = scans.map(s => ({
        ...s,
        scannedAt: s.scannedAt ? (typeof s.scannedAt === 'string' ? new Date(s.scannedAt) : s.scannedAt) : new Date()
      }));
      setScannedItems(parsedScans);
    });

    return () => {
      unsubRefugo();
      unsubScans();
    };
  }, []);

  const parseCSV = (text: string, saveToDb: boolean = true) => {
    Papa.parse(text, {
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedRows: RefugoRow[] = results.data.map((row: any) => {
          const values = Object.values(row);
          const idRaw = String(values[0] || '').trim();
          if (!idRaw) return null;
          return {
            id: idRaw.toUpperCase(),
            rota: String(values[1] || 'Sem Rota').trim(),
            rawFields: row,
          };
        }).filter(Boolean) as RefugoRow[];

        setRows(parsedRows);

        if (saveToDb) {
          await saveRefugo(text, parsedRows.length);
        }
      },
    });
  };

  const cleanDigits = (str: string) => str.replace(/\D/g, '');

  const rowsMap = useMemo(() => {
    const map = new Map<string, RefugoRow>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.id) continue;
      const id = r.id.trim().toUpperCase();
      map.set(id, r);
      const withoutM = id.replace(/m$/i, '');
      if (!map.has(withoutM)) map.set(withoutM, r);
      const digits = cleanDigits(id);
      if (digits && !map.has(digits)) map.set(digits, r);
    }
    return map;
  }, [rows]);

  const scannedMap = useMemo(() => {
    const map = new Map<string, ScannedItem>();
    for (let i = 0; i < scannedItems.length; i++) {
      const s = scannedItems[i];
      if (!s.id) continue;
      const id = s.id.trim().toUpperCase();
      map.set(id, s);
      const withoutM = id.replace(/m$/i, '');
      if (!map.has(withoutM)) map.set(withoutM, s);
      const digits = cleanDigits(id);
      if (digits && !map.has(digits)) map.set(digits, s);
    }
    return map;
  }, [scannedItems]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      
      // Force clean scans before loading new base to avoid mixing
      await clearRefugoScans();
      setScannedItems([]);
      setLastScanResult(null);

      parseCSV(text, true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearData = async () => {
    if (window.confirm("Deseja realmente limpar a base de faltantes? (Isso também apagará os itens bipados)")) {
      await clearRefugo();
      await clearRefugoScans();
      setRows([]);
      setScannedItems([]);
      setLastScanResult(null);
    }
  };

  const clearScans = async () => {
    if (window.confirm("Deseja limpar apenas o histórico de pacotes bipados?")) {
      await clearRefugoScans();
      setScannedItems([]);
      setLastScanResult(null);
    }
  };

  const handleBip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim()) return;

    let processedInput = bipInput.trim();
    
    // Replace dirt patterns (dÇ4, dÇ⁴, d⁴, d4) with 4
    processedInput = processedInput.replace(/d[çc]?⁴/gi, '4');
    processedInput = processedInput.replace(/d[çc]?4/gi, '4');
    
    // Extract ID starting with 47 if there is one
    const match47 = processedInput.match(/(47\d+)/);
    if (match47) {
      processedInput = match47[1];
    } else {
      // Fallback: just remove trailing 'm'
      processedInput = processedInput.replace(/m$/i, '');
    }

    const cleanInput = processedInput.toUpperCase();
    const cleanInputDigits = cleanDigits(cleanInput);
    const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
    
    // Check if already scanned (O(1))
    const alreadyScanned = scannedMap.get(cleanInput) || 
                           scannedMap.get(cleanInputWithoutM) || 
                           (cleanInputDigits ? scannedMap.get(cleanInputDigits) : undefined);
    
    if (alreadyScanned) {
      if (alreadyScanned.status === 'found') {
        setLastScanResult({ status: 'success', message: `O pacote já foi bipado anteriormente!` });
        playBeep();
      } else {
        setLastScanResult({ status: 'error', message: `O pacote já foi bipado anteriormente!` });
      }
      setBipInput('');
      return;
    }

    const foundRow = rowsMap.get(cleanInput) || 
                     rowsMap.get(cleanInputWithoutM) || 
                     (cleanInputDigits ? rowsMap.get(cleanInputDigits) : undefined);

    if (foundRow) {
      const isHibrida = (foundRow.rota.match(/_/g) || []).length >= 2;
      const message = isHibrida ? `ROTA VÁLIDA: ${foundRow.rota} (HÍBRIDA)` : `ROTA VÁLIDA: ${foundRow.rota}`;
      const operatorName = currentUser?.username || localStorage.getItem('operanteNome') || 'Operador';
      
      setLastScanResult({ status: 'success', message });
      const newScans: ScannedItem[] = [{ id: foundRow.id, rota: foundRow.rota, scannedAt: new Date(), status: 'found', foundBy: operatorName }, ...scannedItems];
      setScannedItems(newScans);
      saveRefugoScans(newScans);
      
      playBeep();

      if (isHibrida && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance("Rota Híbrida");
        msg.lang = 'pt-BR';
        msg.rate = 1.2;
        window.speechSynthesis.speak(msg);
      }
    } else {
      setLastScanResult({ status: 'error', message: `Bipado: ${cleanInput}` });
      const newScans: ScannedItem[] = [{ id: cleanInput, rota: '', scannedAt: new Date(), status: 'not_found' }, ...scannedItems];
      setScannedItems(newScans);
      saveRefugoScans(newScans);
    }

    setBipInput('');
    inputRef.current?.focus();
  };

  const foundItems = scannedItems.filter(s => s.status === 'found');

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

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12 mt-2">
        <div className="bg-white border border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl animate-pulse mb-4"></div>
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-4"></div>
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-6"></div>
          <div className="h-12 w-40 bg-gray-200 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mt-2">
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
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                    Base: {rows.length} {baseDate && <span className="font-normal ml-1">({baseDate})</span>}
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm">
                    {scannedItems.length} Bipados
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm">
                    {scannedItems.filter(i => i.status === 'found').length} Encontradas
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
                {scannedItems.length > 0 && (
                  <>
                    <button
                      onClick={clearScans}
                      className="px-3 py-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex items-center gap-1.5 ml-auto"
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
            
            {/* Controles de Paginação Superior */}
            {scannedItems.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 mb-2">
                <div className="flex items-center gap-2">
                  <span>
                    Mostrando <strong className="text-gray-900 font-mono">{startScanIndex + 1}</strong>–<strong className="text-gray-900 font-mono">{endScanIndex}</strong> de <strong className="text-emerald-700 font-mono">{scannedItems.length.toLocaleString('pt-BR')}</strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>Pág. <strong className="text-gray-800">{scanPage}</strong>/{totalScanPages}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setScanPage(1); setJumpScanPageInput('1'); }}
                    disabled={scanPage === 1}
                    className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Primeira"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, scanPage - 1);
                      setScanPage(next);
                      setJumpScanPageInput(String(next));
                    }}
                    disabled={scanPage === 1}
                    className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs font-medium flex items-center gap-0.5"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Ant
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(totalScanPages, scanPage + 1);
                      setScanPage(next);
                      setJumpScanPageInput(String(next));
                    }}
                    disabled={scanPage >= totalScanPages}
                    className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs font-medium flex items-center gap-0.5"
                  >
                    Próx <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScanPage(totalScanPages); setJumpScanPageInput(String(totalScanPages)); }}
                    disabled={scanPage >= totalScanPages}
                    className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Última"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>

                  <select
                    value={scanPageSize}
                    onChange={(e) => {
                      setScanPageSize(Number(e.target.value));
                      setScanPage(1);
                      setJumpScanPageInput('1');
                    }}
                    className="ml-1 px-1.5 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-700 outline-none cursor-pointer"
                  >
                    <option value={50}>50/pág</option>
                    <option value={100}>100/pág</option>
                    <option value={250}>250/pág</option>
                    <option value={500}>500/pág</option>
                  </select>
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
              {scannedItems.length > 0 ? (
                <>
                  {displayedScans.map((item, idx) => (
                    <div key={`scan-${startScanIndex + idx}`} className={`flex justify-between items-center p-3 rounded-lg border transition-opacity ${item.status === 'found' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex items-center gap-2">
                        {item.status === 'found' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={`font-mono font-bold text-sm ${item.status === 'found' ? 'text-emerald-900' : 'text-red-900'}`}>{item.id}</span>
                      </div>
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
                    </div>
                  ))}
                </>
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
      )}
    </div>
  );
}
