import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertCircle, Barcode, Trash2, XCircle, Lock, Unlock, Download, FilePlus, X, FolderPlus, ListPlus, Check } from 'lucide-react';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import { saveRefugo, clearRefugo, clearRefugoScans, listenToRefugoScans, listenToRefugo, saveLista, listenToListas, saveRefugoScans } from '../lib/firebase';

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
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

export function ControleRefugo({ currentUser }: { currentUser?: any }) {
  const [rows, setRows] = useState<RefugoRow[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string } | null>(null);
  const [, setBaseDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const [existingListas, setExistingListas] = useState<ColetaLista[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDestinationType, setExportDestinationType] = useState<'new' | 'existing'>('new');
  const [exportListName, setExportListName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [exportSaida, setExportSaida] = useState('Ciclo 2 - Saída PM');
  const [exportMotivo, setExportMotivo] = useState('Brancas');
  const [exportTargetCodes, setExportTargetCodes] = useState<string[]>([]);

  useEffect(() => {
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

    const unsubScans = listenToRefugoScans((scans) => {
      const parsedScans = scans.map(s => ({
        ...s,
        scannedAt: s.scannedAt ? (typeof s.scannedAt === 'string' ? new Date(s.scannedAt) : s.scannedAt) : new Date()
      }));
      setScannedItems(parsedScans);
    });

    const unsubListas = listenToListas((listas) => {
      setExistingListas(listas);
    });

    return () => {
      unsubRefugo();
      unsubScans();
      unsubListas();
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
    processedInput = processedInput.replace(/d[çc]?⁴/gi, '4');
    processedInput = processedInput.replace(/d[çc]?4/gi, '4');
    
    const match47 = processedInput.match(/(47\d+)/);
    if (match47) {
      processedInput = match47[1];
    } else {
      processedInput = processedInput.replace(/m$/i, '');
    }

    const cleanInput = processedInput.toUpperCase();
    const cleanInputDigits = cleanDigits(cleanInput);
    
    const alreadyScanned = scannedItems.find(item => item.id === cleanInput || (cleanInputDigits && cleanDigits(item.id) === cleanInputDigits));
    
    if (alreadyScanned) {
      if (alreadyScanned.status === 'found') {
        setLastScanResult({ status: 'success', message: `Pacote já bipado anteriormente!` });
        playBeep();
      } else {
        setLastScanResult({ status: 'error', message: `Pacote já bipado anteriormente!` });
      }
      setBipInput('');
      return;
    }

    const foundRow = rows.find(r => {
      if (r.id === cleanInput) return true;
      const rDigits = cleanDigits(r.id);
      return rDigits && cleanInputDigits && rDigits === cleanInputDigits;
    });

    if (foundRow) {
      const isHibrida = (foundRow.rota.match(/_/g) || []).length >= 2;
      const message = isHibrida ? `ROTA: ${foundRow.rota} (HÍBRIDA)` : `ROTA: ${foundRow.rota}`;
      const operatorName = currentUser?.username || localStorage.getItem('operanteNome') || 'Operador';
      
      setLastScanResult({ status: 'success', message });
      const newScans: ScannedItem[] = [{ id: foundRow.id, rota: foundRow.rota, scannedAt: new Date().toISOString() as any, status: 'found', foundBy: operatorName }, ...scannedItems];
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
      setLastScanResult({ status: 'error', message: `Não encontrado: ${cleanInput}` });
      const newScans: ScannedItem[] = [{ id: cleanInput, rota: '', scannedAt: new Date().toISOString() as any, status: 'not_found' }, ...scannedItems];
      setScannedItems(newScans);
      saveRefugoScans(newScans);
    }

    setBipInput('');
    inputRef.current?.focus();
  };

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

  const handleOpenExportModal = () => {
    const scannedSemRota = scannedItems.filter(
      s => s.status === 'not_found' || s.rota === 'SEM ROTA' || s.rota === 'Sem Rota' || !s.rota
    );

    const baseSemRota = rows.filter(
      r => !r.rota || r.rota === 'Sem Rota' || r.rota === 'SEM ROTA' || r.rota.toLowerCase().includes('branca')
    );

    let targetCodes: string[] = [];

    if (scannedSemRota.length > 0) {
      targetCodes = scannedSemRota.map(s => s.id.trim().toUpperCase());
    } else if (baseSemRota.length > 0) {
      targetCodes = baseSemRota.map(r => r.id.trim().toUpperCase());
    } else if (scannedItems.length > 0) {
      if (window.confirm("Exportar todos os pacotes bipados para a Lista Branca?")) {
        targetCodes = scannedItems.map(s => s.id.trim().toUpperCase());
      } else {
        return;
      }
    }

    const uniqueCodes = Array.from(new Set(targetCodes)).filter(Boolean);

    if (uniqueCodes.length === 0) {
      alert('Nenhum pacote sem rota foi encontrado.');
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
    if (exportTargetCodes.length === 0) return;

    const operatorName = currentUser?.username || localStorage.getItem('operanteNome') || 'Operador';
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
          itens: newColetaItens
        };
        await saveLista(novaLista, true);
      } else {
        const targetList = existingListas.find(l => l.id === selectedListId);
        if (!targetList) {
          alert('Selecione uma lista válida.');
          return;
        }

        const existingCodes = new Set((targetList.itens || []).map(i => i.codigo.toUpperCase()));
        const uniqueNewItems = newColetaItens.filter(i => !existingCodes.has(i.codigo.toUpperCase()));

        const updatedLista: ColetaLista = {
          ...targetList,
          itens: [...(targetList.itens || []), ...uniqueNewItems]
        };

        await saveLista(updatedLista, true);
      }

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
      alert(`${exportTargetCodes.length} pacote(s) exportado(s) com sucesso.`);
    } catch (err) {
      console.error('Erro ao exportar:', err);
      alert('Erro ao salvar.');
    }
  };

  const foundCount = scannedItems.filter(s => s.status === 'found').length;
  const notFoundCount = scannedItems.filter(s => s.status === 'not_found').length;
  const semRotaCount = notFoundCount || rows.filter(r => !r.rota || r.rota === 'Sem Rota' || r.rota === 'SEM ROTA').length;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center text-xs font-mono text-slate-500">
        Carregando dados...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto font-sans text-slate-800 space-y-4">
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-10 text-center space-y-3">
          <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Controle de Refugo
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Carregue a base CSV de pacotes faltantes para iniciar a leitura.
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold transition-colors cursor-pointer">
            <UploadCloud className="w-4 h-4" />
            <span>Carregar Base CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider text-center">
              Leitura de Pacotes
            </h3>

            <form onSubmit={handleBip} className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-700">Código do Pacote</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsLocked(!isLocked);
                    if (isLocked) setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{isLocked ? 'Travar' : 'Liberado'}</span>
                </button>
              </div>

              <div className="relative">
                <Barcode className="absolute left-3 top-3.5 w-6 h-6 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={bipInput}
                  onChange={(e) => setBipInput(e.target.value)}
                  onBlur={() => {
                    if (!isLocked) setTimeout(() => inputRef.current?.focus(), 150);
                  }}
                  disabled={isLocked}
                  className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded font-mono text-lg font-bold text-slate-900 outline-none focus:border-[#3483FA]"
                  placeholder={isLocked ? "TRAVADO" : "Bipe o ID..."}
                  autoFocus
                />
              </div>

              <button type="submit" className="hidden" disabled={isLocked}>Verificar</button>
            </form>

            {lastScanResult && (
              <div className={`p-4 rounded border font-mono text-center space-y-1 ${
                lastScanResult.status === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}>
                <div className="font-bold text-sm uppercase">
                  {lastScanResult.status === 'success' ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}
                </div>
                <div className="text-xs">{lastScanResult.message}</div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Histórico</span>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span>Ok: <strong>{foundCount}</strong></span>
                <span>Sem Rota: <strong>{notFoundCount}</strong></span>
                <span>Total: <strong>{scannedItems.length}</strong></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300">
                <span>Carregar CSV</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>

              <button
                onClick={clearData}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300"
              >
                Limpar Base
              </button>

              <button
                onClick={handleOpenExportModal}
                className="px-2.5 py-1 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Exportar Lista Branca ({semRotaCount})</span>
              </button>

              {scannedItems.length > 0 && (
                <>
                  <button
                    onClick={clearScans}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300"
                  >
                    Limpar Bipados
                  </button>
                  <button
                    onClick={exportScannedCSV}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold transition-colors cursor-pointer border border-slate-300 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar CSV</span>
                  </button>
                </>
              )}
            </div>

            <div className="overflow-y-auto max-h-80 space-y-1.5 font-mono text-xs">
              {scannedItems.length > 0 ? (
                scannedItems.map((item, idx) => (
                  <div key={`scan-${idx}`} className={`flex justify-between items-center p-2 rounded border ${
                    item.status === 'found' ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'
                  }`}>
                    <span className="font-bold text-slate-900">{item.id}</span>
                    <span className="text-slate-700">{item.status === 'found' ? `Rota: ${item.rota}` : 'SEM ROTA'}</span>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-400 py-8 italic text-xs">
                  Nenhum pacote bipado ainda.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-slate-200 max-w-md w-full p-5 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 uppercase">Exportar para Lista Branca</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600">
              Exportando <strong>{exportTargetCodes.length}</strong> pacotes sem rota.
            </p>

            <div className="space-y-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                  <input
                    type="radio"
                    name="destType"
                    checked={exportDestinationType === 'new'}
                    onChange={() => setExportDestinationType('new')}
                  />
                  <span>Nova Lista</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                  <input
                    type="radio"
                    name="destType"
                    disabled={existingListas.length === 0}
                    checked={exportDestinationType === 'existing'}
                    onChange={() => setExportDestinationType('existing')}
                  />
                  <span>Lista Existente</span>
                </label>
              </div>

              {exportDestinationType === 'new' ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={exportListName}
                    onChange={(e) => setExportListName(e.target.value)}
                    placeholder="Nome da lista"
                    className="w-full border border-slate-300 rounded p-2 text-xs outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={exportSaida}
                      onChange={(e) => setExportSaida(e.target.value)}
                      className="border border-slate-300 rounded p-2 text-xs outline-none"
                    >
                      <option value="Ciclo 1 - Saída AM">Ciclo 1 - Saída AM</option>
                      <option value="Ciclo 2 - Saída PM">Ciclo 2 - Saída PM</option>
                      <option value="Inbound">Inbound</option>
                    </select>

                    <select
                      value={exportMotivo}
                      onChange={(e) => setExportMotivo(e.target.value)}
                      className="border border-slate-300 rounded p-2 text-xs outline-none"
                    >
                      <option value="Brancas">Brancas</option>
                      <option value="Refugo">Refugo</option>
                    </select>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 text-xs outline-none"
                >
                  {existingListas.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                className="px-3 py-1.5 bg-[#3483FA] hover:bg-blue-600 text-white rounded font-bold cursor-pointer"
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
