import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Barcode, Clock, CheckCircle2, Package, Filter, 
  RotateCcw, Info, MoreVertical, Copy, Check, 
  ChevronLeft, ChevronRight, ArrowLeft, Download, 
  Plus, Users, ShieldAlert, Unlock, Play, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../lib/auth';
import { 
  ColetaList, 
  SaidaOption, 
  MotivoOption, 
  addScannedItemToList, 
  addDirtyScanToList,
  updatePackageDetail,
  updateListStatus,
  togglePackageCollected
} from '../lib/coletas';

// Isometric 3D Yellow Cube Icon matching the designer screenshot
const IsometricYellowCube: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Top Face */}
    <polygon points="16,2 30,10 16,18 2,10" fill="#FFE600" />
    {/* Left Face */}
    <polygon points="2,10 16,18 16,30 2,22" fill="#F59E0B" />
    {/* Right Face */}
    <polygon points="16,18 30,10 30,22 16,30" fill="#D97706" />
  </svg>
);

// Web Audio Helpers
let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {}
};

const playAlarmSiren = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [0, 0.12, 0.24].forEach((offset, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 350 : 880, now + offset);
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  } catch (e) {}
};

interface PackageRow {
  id: string;
  originalIndex: number;
  saida: SaidaOption;
  motivo: MotivoOption;
  isCollected: boolean;
  scannedAt?: string;
  scannedBy?: string;
}

interface AbaColetaPlanilhaProps {
  list: ColetaList;
  currentUser?: User | null;
  onBackToLists: () => void;
  onOpenTeamModal: () => void;
  onOpenAddIdsModal: () => void;
  onExportCSV: () => void;
  onOpenCreateModal?: () => void;
}

export const AbaColetaPlanilha: React.FC<AbaColetaPlanilhaProps> = ({
  list,
  currentUser,
  onBackToLists,
  onOpenTeamModal,
  onOpenAddIdsModal,
  onExportCSV,
  onOpenCreateModal
}) => {
  // Barcode input and options
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedScanSaida, setSelectedScanSaida] = useState<SaidaOption>('Saída PM');
  const [inputError, setInputError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterSaida, setFilterSaida] = useState<string>('Todas');
  const [filterMotivo, setFilterMotivo] = useState<string>('Todos');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Row Action Menu popup
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User dropdown menu
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Safety Lock State
  const [isLockedByDirtyId, setIsLockedByDirtyId] = useState(false);
  const [dirtyLockDetails, setDirtyLockDetails] = useState<{
    id: string;
    reason: string;
    scannedBy: string;
    time: string;
  } | null>(null);

  // Highlighted Row for recent scans
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Compute all package rows
  const packageRows: PackageRow[] = useMemo(() => {
    const scannedMap = new Map<string, { scannedBy?: string; scannedAt: string; saida?: SaidaOption; motivo?: MotivoOption }>();
    (list.scannedItems || []).forEach(item => {
      scannedMap.set(item.id, item);
    });

    return list.ids.map((id, index) => {
      const scanned = scannedMap.get(id);
      const customDetail = list.itemDetails?.[id];

      // Saída priority: customDetail > scanned.saida > default ('Saída PM' if scanned, 'Em rota' if pending)
      let saida: SaidaOption;
      if (customDetail?.saida) {
        saida = customDetail.saida;
      } else if (scanned?.saida) {
        saida = scanned.saida;
      } else if (scanned) {
        saida = 'Saída PM';
      } else {
        saida = 'Em rota';
      }

      // Motivo priority: customDetail > scanned.motivo > default ('Bipado' if scanned, 'Aguardando coleta' if pending)
      let motivo: MotivoOption;
      if (customDetail?.motivo) {
        motivo = customDetail.motivo;
      } else if (scanned?.motivo) {
        motivo = scanned.motivo;
      } else if (scanned) {
        motivo = 'Bipado';
      } else {
        motivo = 'Aguardando coleta';
      }

      return {
        id,
        originalIndex: index + 1,
        saida,
        motivo,
        isCollected: Boolean(scanned),
        scannedAt: scanned?.scannedAt || customDetail?.scannedAt,
        scannedBy: scanned?.scannedBy || customDetail?.scannedBy
      };
    });
  }, [list]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return packageRows.filter(row => {
      if (filterSaida !== 'Todas' && row.saida !== filterSaida) return false;
      if (filterMotivo !== 'Todos' && row.motivo !== filterMotivo) return false;
      return true;
    });
  }, [packageRows, filterSaida, filterMotivo]);

  // Statistics
  const totalCount = packageRows.length;
  const collectedCount = packageRows.filter(r => r.isCollected).length;
  const pendingCount = totalCount - collectedCount;

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRows, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSaida, filterMotivo]);

  // Handle Scanning Barcode (COLETOR MODE - Collects and saves scanned IDs into this list)
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = barcodeInput.trim();
    if (!cleanId) return;

    if (isLockedByDirtyId) {
      playAlarmSiren();
      return;
    }

    setInputError(null);

    // 1. Check if ID was already scanned in this list
    const alreadyScanned = (list.scannedItems || []).some(s => s.id === cleanId);
    if (alreadyScanned) {
      playAlarmSiren();
      const lockData = {
        id: cleanId,
        reason: 'PACOTE JÁ BIPADO/COLETADO! ID Duplicado detectado.',
        scannedBy: currentUser?.username || 'Coletor',
        time: new Date().toLocaleTimeString('pt-BR')
      };
      setDirtyLockDetails(lockData);
      setIsLockedByDirtyId(true);
      addDirtyScanToList(list.id, {
        id: cleanId,
        reason: 'ja_bipado',
        reasonText: 'Tentativa de bip duplicado para pacote já coletado',
        scannedAt: new Date().toISOString(),
        scannedBy: currentUser?.username || 'Coletor',
        scannedById: currentUser?.id
      });
      setBarcodeInput('');
      return;
    }

    // 2. Valid Scan & Collect!
    playBeep();
    const now = new Date().toISOString();
    await addScannedItemToList(list.id, {
      id: cleanId,
      scannedAt: now,
      scannedBy: currentUser?.username || 'Coletor',
      scannedById: currentUser?.id,
      saida: selectedScanSaida,
      motivo: 'Bipado'
    });

    setHighlightedRowId(cleanId);
    setTimeout(() => setHighlightedRowId(null), 3000);

    setSuccessToast(`Pacote ${cleanId} coletado e salvo na lista (${selectedScanSaida})!`);
    setTimeout(() => setSuccessToast(null), 3500);

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  const handleUnlockScanner = () => {
    setIsLockedByDirtyId(false);
    setDirtyLockDetails(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 150);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    setActiveMenuId(null);
  };

  const handleUpdateSaida = async (id: string, newSaida: SaidaOption, currentMotivo: MotivoOption) => {
    await updatePackageDetail(list.id, id, newSaida, currentMotivo);
    setActiveMenuId(null);
  };

  const handleUpdateMotivo = async (id: string, currentSaida: SaidaOption, newMotivo: MotivoOption) => {
    await updatePackageDetail(list.id, id, currentSaida, newMotivo);
    setActiveMenuId(null);
  };

  const handleToggleCollected = async (id: string, currentSaida: SaidaOption, currentMotivo: MotivoOption) => {
    await togglePackageCollected(
      list.id,
      id,
      currentUser?.username || 'Coletor',
      currentUser?.id || 'user',
      currentSaida,
      currentMotivo
    );
    setActiveMenuId(null);
  };

  const handleToggleListFinalized = async () => {
    const isCurrentlyDone = list.status === 'Finalizada';
    const newStatus = isCurrentlyDone ? 'Em andamento' : 'Finalizada';
    if (window.confirm(isCurrentlyDone ? 'Deseja reabrir esta coleta?' : 'Tem certeza que deseja finalizar esta coleta?')) {
      await updateListStatus(list.id, newStatus);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleWindowClick = () => {
      setActiveMenuId(null);
      setIsUserMenuOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  // Display user initial
  const userInitial = (currentUser?.username || 'kedson').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col xl:flex-row text-gray-900 animate-in fade-in duration-200">
      
      {/* ============================================================ */}
      {/* LEFT SECTION: SPREADSHEET TABLE (Aba de Coleta)              */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col p-3 sm:p-6 lg:p-8 space-y-5 min-w-0">
        
        {/* Header: Isometric Yellow Cube + Aba de Coleta | 05/09/2026 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <IsometricYellowCube className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 drop-shadow-sm" />
            <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight whitespace-nowrap">
                  Aba de Coleta
                </h1>
                <span className="text-gray-300 font-light text-xl sm:text-2xl select-none hidden xs:inline">|</span>
                <span className="text-sm sm:text-base md:text-lg font-medium text-gray-500 whitespace-nowrap">
                  {list.date || new Date().toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-[11px] sm:text-xs font-black px-2 py-0.5 rounded-md bg-[#FFE600] text-gray-950 border border-yellow-400 shadow-xs shrink-0">
                  {list.cycle}
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-gray-700 bg-white border border-gray-200 px-2.5 py-0.5 rounded-full shadow-xs truncate max-w-[180px] sm:max-w-[260px]">
                  {list.name}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions (Mobile / Tablet helper) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-auto">
            {onOpenCreateModal && (
              <button
                onClick={onOpenCreateModal}
                className="text-xs font-black text-gray-950 bg-[#FFE600] hover:bg-yellow-400 px-2.5 sm:px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 sm:gap-1.5 shadow-sm cursor-pointer min-h-[36px]"
                title="Criar uma nova lista de conferência"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span className="text-[11px] sm:text-xs">Nova Lista</span>
              </button>
            )}
            <button
              onClick={onBackToLists}
              className="text-xs font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 px-2.5 sm:px-3 py-2 rounded-xl transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer min-h-[36px]"
              title="Voltar para a galeria de todas as listas"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="text-[11px] sm:text-xs">Ver Listas</span>
            </button>
            <button
              onClick={onExportCSV}
              className="text-xs font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 px-2.5 sm:px-3 py-2 rounded-xl transition-colors flex items-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer min-h-[36px]"
              title="Exportar dados da planilha"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px] sm:text-xs">Exportar</span>
            </button>
          </div>
        </div>

        {/* Security Alert Banner when Locked */}
        <AnimatePresence>
          {isLockedByDirtyId && dirtyLockDetails && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 sm:p-5 rounded-2xl bg-red-600 text-white shadow-lg border-2 border-red-400 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white text-red-600 flex items-center justify-center shrink-0 shadow-md">
                    <ShieldAlert className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="bg-black/30 text-white font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Trava de Segurança Ativada
                    </span>
                    <h3 className="text-base sm:text-lg font-black mt-0.5">
                      ID SUJO IDENTIFICADO! LEITOR BLOQUEADO
                    </h3>
                  </div>
                </div>

                <button
                  onClick={handleUnlockScanner}
                  className="bg-white hover:bg-red-50 text-red-700 font-black px-4 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Unlock className="w-4 h-4" />
                  DESTRAVAR LEITOR
                </button>
              </div>

              <div className="bg-black/30 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-red-200 uppercase font-bold text-[10px]">ID Bipado Rejeitado:</span>
                  <div className="font-mono font-black text-[#FFE600] text-lg">{dirtyLockDetails.id}</div>
                </div>
                <div>
                  <span className="text-red-200 uppercase font-bold text-[10px]">Motivo:</span>
                  <div className="font-bold text-white">{dirtyLockDetails.reason}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Toast */}
        <AnimatePresence>
          {successToast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-3 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{successToast}</span>
              </div>
              <button onClick={() => setSuccessToast(null)} className="text-white/80 hover:text-white text-sm px-2">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile / Tablet Top Quick Collector Scanning Bar */}
        <div className="xl:hidden bg-gradient-to-r from-[#102033] to-[#0B1726] border border-[#2A3B52] rounded-2xl p-4 text-white shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Barcode className="w-5 h-5 text-[#FFE600]" />
              <h2 className="text-sm font-black text-white">Coletor de Pacotes</h2>
            </div>
            <span className="text-xs font-bold text-[#FFE600] bg-yellow-400/10 px-2.5 py-0.5 rounded-full border border-yellow-400/20">
              {collectedCount}/{totalCount} Coletados
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider shrink-0">
                Saída:
              </span>
              <div className="grid grid-cols-3 gap-1 flex-1">
                {(['Saída PM', 'Saída SD', 'Saída AM'] as SaidaOption[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSelectedScanSaida(s)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold text-center transition-all cursor-pointer min-h-[38px] ${
                      selectedScanSaida === s
                        ? 'bg-[#FFE600] text-gray-950 font-black shadow-sm'
                        : 'bg-[#0B1320] text-gray-300 border border-[#223552]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Bipe ou digite o ID do pacote..."
                disabled={isLockedByDirtyId}
                className="flex-1 bg-[#0B1320] border border-[#223552] text-white placeholder-gray-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono focus:outline-none focus:border-[#FFE600] disabled:opacity-50 min-h-[44px]"
              />
              <button
                type="submit"
                disabled={isLockedByDirtyId || !barcodeInput.trim()}
                className="bg-[#FFE600] hover:bg-yellow-400 disabled:opacity-40 disabled:pointer-events-none text-gray-950 font-black px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-md transition-all cursor-pointer shrink-0 min-h-[44px]"
              >
                <Barcode className="w-4 h-4" />
                <span>Coletar</span>
              </button>
            </form>
          </div>
        </div>

        {/* Spreadsheet Card Table */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-w-0">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70 text-gray-500 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-14 text-center">#</th>
                  <th className="py-3.5 px-4 min-w-[200px]">ID</th>
                  <th className="py-3.5 px-4 min-w-[140px]">Saída</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Motivo</th>
                  <th className="py-3.5 px-4 w-20 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                      Nenhum pacote encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => {
                    const isHighlighted = highlightedRowId === row.id;

                    return (
                      <tr 
                        key={row.id}
                        className={`transition-colors ${
                          isHighlighted 
                            ? 'bg-yellow-100/90 font-bold' 
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* # Column */}
                        <td className="py-3 px-4 text-center font-medium text-gray-400 text-xs select-none">
                          {row.originalIndex}
                        </td>

                        {/* ID Column */}
                        <td className="py-3 px-4 font-mono font-medium text-gray-800 text-sm tracking-tight select-all">
                          {row.id}
                        </td>

                        {/* Saída Column (Pill Badges matching HTML spec) */}
                        <td className="py-3 px-4">
                          {row.saida === 'Saída PM' && (
                            <span className="bg-[#FFF1B7] text-[#6B4C00] font-bold text-xs px-3 py-1 rounded-full inline-flex items-center justify-center min-w-[96px]">
                              Saída PM
                            </span>
                          )}
                          {row.saida === 'Saída SD' && (
                            <span className="bg-[#D9EAFF] text-[#0562CB] font-bold text-xs px-3 py-1 rounded-full inline-flex items-center justify-center min-w-[96px]">
                              Saída SD
                            </span>
                          )}
                          {row.saida === 'Saída AM' && (
                            <span className="bg-[#D8F6E8] text-[#007D55] font-bold text-xs px-3 py-1 rounded-full inline-flex items-center justify-center min-w-[96px]">
                              Saída AM
                            </span>
                          )}
                          {row.saida === 'Em rota' && (
                            <span className="bg-[#EBEFF4] text-[#273444] font-bold text-xs px-3 py-1 rounded-full inline-flex items-center justify-center min-w-[96px]">
                              Em rota
                            </span>
                          )}
                        </td>

                        {/* Motivo Column */}
                        <td className="py-3 px-4 text-gray-700 text-sm font-normal">
                          {row.motivo}
                        </td>

                        {/* Ações Column */}
                        <td className="py-3 px-4 text-center relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === row.id ? null : row.id);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors inline-flex items-center justify-center cursor-pointer"
                            title="Opções do pacote"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Row Actions Menu Dropdown */}
                          <AnimatePresence>
                            {activeMenuId === row.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-4 top-10 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-2 z-30 text-left space-y-2 text-xs"
                              >
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                                    Alterar Saída:
                                  </span>
                                  <div className="grid grid-cols-2 gap-1 mt-1">
                                    {(['Saída PM', 'Saída SD', 'Saída AM', 'Em rota'] as SaidaOption[]).map((s) => (
                                      <button
                                        key={s}
                                        onClick={() => handleUpdateSaida(row.id, s, row.motivo)}
                                        className={`px-2 py-1 rounded-md text-[11px] font-semibold text-center transition-colors ${
                                          row.saida === s 
                                            ? 'bg-amber-100 text-amber-900 font-black' 
                                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                                        }`}
                                      >
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="border-t border-gray-100 pt-1.5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                                    Alterar Motivo:
                                  </span>
                                  <div className="space-y-0.5 mt-1">
                                    {(['Bipado', 'Transferência', 'Roteirizado', 'Aguardando coleta'] as MotivoOption[]).map((m) => (
                                      <button
                                        key={m}
                                        onClick={() => handleUpdateMotivo(row.id, row.saida, m)}
                                        className={`w-full text-left px-2 py-1 rounded-md text-[11px] transition-colors ${
                                          row.motivo === m 
                                            ? 'bg-blue-50 text-blue-800 font-bold' 
                                            : 'hover:bg-gray-100 text-gray-700'
                                        }`}
                                      >
                                        {m}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="border-t border-gray-100 pt-1.5 space-y-1">
                                  <button
                                    onClick={() => handleCopyId(row.id)}
                                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-100 flex items-center gap-2 text-gray-700 font-medium"
                                  >
                                    {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                                    <span>{copiedId === row.id ? 'Copiado!' : 'Copiar ID'}</span>
                                  </button>

                                  <button
                                    onClick={() => handleToggleCollected(row.id, row.saida, row.motivo)}
                                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-100 flex items-center gap-2 text-gray-700 font-medium"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
                                    <span>{row.isCollected ? 'Desfazer Bip (Pendente)' : 'Marcar como Coletado'}</span>
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer: Mostrando 1 a 20 de 20 pacotes | Pagination */}
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-500 bg-white">
            <span className="font-medium">
              Mostrando {filteredRows.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} a{' '}
              {Math.min(currentPage * itemsPerPage, filteredRows.length)} de {filteredRows.length} pacotes
              {filteredRows.length !== totalCount && ` (filtrado de ${totalCount})`}
            </span>

            {/* Pagination controls */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                    currentPage === pageNum
                      ? 'bg-[#FFE600] text-gray-950 font-black shadow-xs'
                      : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* RIGHT SECTION: DARK COMMAND CENTER PANEL                     */}
      {/* ============================================================ */}
      <div className="w-full xl:w-[420px] 2xl:w-[460px] bg-gradient-to-b from-[#102033] to-[#0B1726] text-white p-4 sm:p-6 lg:p-7 flex flex-col space-y-5 shrink-0 border-t xl:border-t-0 xl:border-l border-[#2A3B52] min-w-0">
        
        {/* Top User Profile Header: K kedson ⌵ */}
        <div className="relative flex items-center justify-between xl:justify-end pb-2 border-b border-[#1E3453] xl:border-none">
          <div className="flex items-center gap-2 xl:hidden">
            <span className="text-xs font-black text-[#FFE600] uppercase tracking-wider">Painel do Coletor</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsUserMenuOpen(!isUserMenuOpen);
            }}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-[#FFE600] text-gray-950 font-black flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
              {userInitial}
            </div>
            <span className="text-sm font-bold text-gray-200 group-hover:text-white">
              {currentUser?.username || 'kedson'}
            </span>
            <span className="text-gray-400 text-xs">⌵</span>
          </button>

          {/* User Popover Dropdown */}
          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-12 w-56 bg-[#132238] border border-[#223552] rounded-xl shadow-2xl p-2 z-40 space-y-1 text-xs text-gray-200"
              >
                <div className="px-3 py-2 border-b border-gray-700/60">
                  <div className="font-bold text-white">{currentUser?.username || 'kedson'}</div>
                  <div className="text-[10px] text-gray-400">Operador Logístico Conectado</div>
                </div>

                {onOpenCreateModal && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenCreateModal();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-yellow-400/20 text-yellow-300 flex items-center gap-2 transition-colors font-bold"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FFE600]" />
                    <span>Criar Nova Lista</span>
                  </button>
                )}

                <button
                  onClick={onBackToLists}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-colors font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Voltar para Todas as Listas</span>
                </button>

                <button
                  onClick={onOpenTeamModal}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-colors font-semibold"
                >
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Equipe ({list.isPublicToAll !== false ? 'Geral' : (list.teamMembers?.length || 0)})</span>
                </button>

                <button
                  onClick={onOpenAddIdsModal}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-colors font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Inserir Mais IDs</span>
                </button>

                <button
                  onClick={onExportCSV}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 transition-colors font-semibold"
                >
                  <Download className="w-3.5 h-3.5 text-gray-400" />
                  <span>Exportar Relatório CSV</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Command Center Responsive Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-4 lg:gap-5">
          
          {/* Column 1: Metrics & Scanning Barcode Card */}
          <div className="space-y-4">
            {/* 3 Metric Cards: Coletados | Pendentes | Total */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {/* Coletados */}
              <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-sm">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white tracking-tight">{collectedCount}</div>
                  <div className="text-[10px] sm:text-[11px] text-gray-400 font-medium">Coletados</div>
                </div>
              </div>

              {/* Pendentes */}
              <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-sm">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-1.5">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white tracking-tight">{pendingCount}</div>
                  <div className="text-[10px] sm:text-[11px] text-gray-400 font-medium">Pendentes</div>
                </div>
              </div>

              {/* Total */}
              <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between shadow-sm">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/10 text-white flex items-center justify-center mb-1.5">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white tracking-tight">{totalCount}</div>
                  <div className="text-[10px] sm:text-[11px] text-gray-400 font-medium">Total</div>
                </div>
              </div>
            </div>

            {/* Card: Coletar / Bipar Pacote */}
            <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-[#FFE600]" />
                <h2 className="text-sm font-black text-white tracking-wide">
                  Coletar / Bipar Pacote
                </h2>
              </div>
              <p className="text-xs text-gray-400 -mt-1">
                Bipe ou digite o ID para coletar e salvar nesta lista...
              </p>

              {/* Choose Saída for the scan */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Saída para a Coleta:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Saída PM', 'Saída SD', 'Saída AM'] as SaidaOption[]).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setSelectedScanSaida(s)}
                      className={`py-2 px-2 rounded-lg text-[11px] font-bold text-center transition-all cursor-pointer min-h-[40px] ${
                        selectedScanSaida === s
                          ? 'bg-[#FFE600] text-gray-950 font-black shadow-sm ring-1 ring-yellow-400'
                          : 'bg-[#0B1320] text-gray-300 border border-[#223552] hover:bg-white/5'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleScanSubmit} className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Bipe ou digite o ID do pacote..."
                    disabled={isLockedByDirtyId}
                    className="flex-1 bg-[#0B1320] border border-[#223552] text-white placeholder-gray-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono focus:outline-none focus:border-[#FFE600] disabled:opacity-50 min-h-[44px]"
                  />
                  <button
                    type="submit"
                    disabled={isLockedByDirtyId || !barcodeInput.trim()}
                    className="bg-[#FFE600] hover:bg-yellow-400 disabled:opacity-40 disabled:pointer-events-none text-gray-950 font-black px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-md transition-all cursor-pointer shrink-0 min-h-[44px]"
                  >
                    <Barcode className="w-4 h-4" />
                    <span>Bipar / Coletar</span>
                  </button>
                </div>
                {inputError && (
                  <p className="text-[11px] text-red-400 font-medium">{inputError}</p>
                )}
              </form>
            </div>
          </div>

          {/* Column 2: Filters & List Info Card */}
          <div className="space-y-4">
            {/* Card: Filtros */}
            <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#FFE600]" />
                  <h2 className="text-sm font-black text-white">Filtros</h2>
                </div>
                {(filterSaida !== 'Todas' || filterMotivo !== 'Todos') && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Saída select */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Saída
                  </label>
                  <select
                    value={filterSaida}
                    onChange={(e) => setFilterSaida(e.target.value)}
                    className="w-full bg-[#0B1320] border border-[#223552] text-white rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-[#FFE600]"
                  >
                    <option value="Todas">Todas</option>
                    <option value="Saída PM">Saída PM</option>
                    <option value="Saída SD">Saída SD</option>
                    <option value="Saída AM">Saída AM</option>
                    <option value="Em rota">Em rota</option>
                  </select>
                </div>

                {/* Motivo select */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Motivo
                  </label>
                  <select
                    value={filterMotivo}
                    onChange={(e) => setFilterMotivo(e.target.value)}
                    className="w-full bg-[#0B1320] border border-[#223552] text-white rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-[#FFE600]"
                  >
                    <option value="Todos">Todos</option>
                    <option value="Bipado">Bipado</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Roteirizado">Roteirizado</option>
                    <option value="Aguardando coleta">Aguardando coleta</option>
                  </select>
                </div>
              </div>

              {/* Reset Filters button */}
              <button
                onClick={() => {
                  setFilterSaida('Todas');
                  setFilterMotivo('Todos');
                }}
                className="w-full text-center py-1 text-xs text-gray-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpar filtros</span>
              </button>
            </div>

            {/* Card: Informações da Coleta */}
            <div className="bg-[#132238] border border-[#1e3453] rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#FFE600]" />
                <h2 className="text-sm font-black text-white">Informações da Coleta</h2>
              </div>

              <div className="space-y-2 text-xs divide-y divide-gray-800/80">
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-400">Data</span>
                  <span className="font-semibold text-white">{list.date || '05/09/2026'}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400">Responsável</span>
                  <span className="font-semibold text-white">{currentUser?.username || 'kedson'} (Você)</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400">Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    list.status === 'Finalizada' 
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' 
                      : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  }`}>
                    {list.status || 'Em andamento'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400">Total de pacotes</span>
                  <span className="font-bold text-white">{totalCount}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400">Coletados</span>
                  <span className="font-bold text-emerald-400">{collectedCount}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-gray-400">Pendentes</span>
                  <span className="font-bold text-amber-400">{pendingCount}</span>
                </div>
              </div>

              {/* Yellow Action Button: Finalizar Coleta */}
              <button
                onClick={handleToggleListFinalized}
                className="w-full mt-3 bg-[#FFE600] hover:bg-yellow-400 text-gray-950 font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{list.status === 'Finalizada' ? 'Reabrir Coleta' : 'Finalizar Coleta'}</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
