import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, Search, XCircle, Lock, Unlock, Download } from 'lucide-react';
import { RefugoRow } from '../types';
import { saveRefugo, loadRefugo, clearRefugo, saveRefugoScans, loadRefugoScans, clearRefugoScans, listenToRefugoScans, listenToRefugo } from '../lib/firebase';

interface ScannedItem {
  id: string;
  rota: string;
  scannedAt: Date;
  status: 'found' | 'not_found';
}

export function ControleRefugo() {
  const [rows, setRows] = useState<RefugoRow[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string } | null>(null);
  const [baseDate, setBaseDate] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

    const cleanInput = bipInput.trim().toUpperCase();
    const cleanInputDigits = cleanDigits(cleanInput);
    
    // Check if already scanned
    if (scannedItems.some(item => item.id === cleanInput || cleanDigits(item.id) === cleanInputDigits && item.status === 'found')) {
      setLastScanResult({ status: 'error', message: `O pacote já foi bipado anteriormente!` });
      setBipInput('');
      return;
    }

    const foundRow = rows.find(r => {
      if (r.id === cleanInput) return true;
      const rDigits = cleanDigits(r.id);
      return rDigits && cleanInputDigits && rDigits === cleanInputDigits;
    });

    if (foundRow) {
      setLastScanResult({ status: 'success', message: `ROTA VÁLIDA: ${foundRow.rota}` });
      const newScans: ScannedItem[] = [{ id: foundRow.id, rota: foundRow.rota, scannedAt: new Date(), status: 'found' }, ...scannedItems];
      setScannedItems(newScans);
      saveRefugoScans(newScans);
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(foundRow.rota);
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
    const csvContent = "ID,ROTA\n" + scannedItems.map(r => `${r.id},${r.status === 'found' ? r.rota : 'SEM ROTA'}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "log_coletor_bipados.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-mono text-xs font-bold">
                    {scannedItems.length} Bipados
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
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
              {scannedItems.length > 0 ? (
                scannedItems.map((item, idx) => (
                  <div key={`scan-${idx}`} className={`flex justify-between items-center p-3 rounded-lg border transition-opacity ${item.status === 'found' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-2">
                      {item.status === 'found' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className={`font-mono font-bold text-sm ${item.status === 'found' ? 'text-emerald-900' : 'text-red-900'}`}>{item.id}</span>
                    </div>
                    {item.status === 'found' ? (
                      <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-xs font-bold border border-emerald-200">
                        Rota: {item.rota}
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-xs font-bold border border-red-200">
                        SEM ROTA
                      </span>
                    )}
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
      )}
    </div>
  );
}
