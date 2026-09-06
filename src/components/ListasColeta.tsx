import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Calendar, Layers, Plus, Trash2, ListTodo, 
  ChevronRight, Barcode, Lock, Unlock, CheckCircle2, 
  AlertCircle, XCircle, Users, UserPlus, Search, 
  Download, Copy, Check, Sparkles, Share2, X, RefreshCw,
  Radio, Clock, ShieldCheck, ArrowLeft, ShieldAlert,
  AlertTriangle, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, getAllUsers } from '../lib/auth';
import { 
  ColetaList, 
  ScannedItem, 
  DirtyScanItem,
  subscribeToColetaLists, 
  saveColetaList, 
  deleteColetaList, 
  addScannedItemToList,
  addDirtyScanToList,
  updateListTeam 
} from '../lib/coletas';
import { AbaColetaPlanilha } from './AbaColetaPlanilha';

// Web Audio Beep Helpers
let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.12);
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
    [0, 0.12, 0.24, 0.36].forEach((offset, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 340 : 880, now + offset);
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  } catch (e) {}
};

const playErrorBeep = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {}
};

interface ListasColetaProps {
  currentUser?: User | null;
  onOpenChange?: (isOpen: boolean) => void;
}

export const ListasColeta: React.FC<ListasColetaProps> = ({ currentUser, onOpenChange }) => {
  const { listId: routeListId } = useParams<{ listId?: string }>();
  const navigate = useNavigate();

  const [lists, setLists] = useState<ColetaList[]>([]);
  const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'done'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [cycleType, setCycleType] = useState('AM');
  const [customCycle, setCustomCycle] = useState('');
  const [listName, setListName] = useState('');
  const [rawIds, setRawIds] = useState('');
  const [isPublicToAll, setIsPublicToAll] = useState(true);
  const [selectedTeamUserIds, setSelectedTeamUserIds] = useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Active Collection View State (initialized with route token if present)
  const [selectedListId, setSelectedListId] = useState<string | null>(routeListId || null);

  // Keep selectedListId in sync with the route URL token
  useEffect(() => {
    if (routeListId) {
      setSelectedListId(routeListId);
    } else {
      setSelectedListId(null);
    }
  }, [routeListId]);

  // Trava de Segurança & IDs Sujos
  const [isLockedByDirtyId, setIsLockedByDirtyId] = useState(false);
  const [dirtyLockDetails, setDirtyLockDetails] = useState<{
    id: string;
    reason: string;
    scannedBy: string;
    time: string;
  } | null>(null);

  // Tab in scanning view: faltantes (default), coletados, sujos, todas
  const [scanActiveTab, setScanActiveTab] = useState<'faltantes' | 'coletados' | 'sujos' | 'todas'>('faltantes');
  const [dirtySearch, setDirtySearch] = useState('');
  const [scannedSearch, setScannedSearch] = useState('');

  // Collection Scanning State
  const [bipInput, setBipInput] = useState('');
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string, id?: string } | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [missingSearch, setMissingSearch] = useState('');
  const [isAddingIdsModalOpen, setIsAddingIdsModalOpen] = useState(false);
  const [newExtraIds, setNewExtraIds] = useState('');

  // Team Manage Modal for Existing List
  const [managingTeamList, setManagingTeamList] = useState<ColetaList | null>(null);
  const [tempTeamUserIds, setTempTeamUserIds] = useState<string[]>([]);
  const [tempIsPublicToAll, setTempIsPublicToAll] = useState(true);

  const bipInputRef = useRef<HTMLInputElement>(null);

  // 1. Subscribe to Firestore in Real Time
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToColetaLists((liveLists) => {
      setLists(liveLists);
      setLoading(false);
    });

    // Also fetch all system users for inviting
    getAllUsers().then(users => {
      setAllSystemUsers(users || []);
    });

    return () => unsubscribe();
  }, []);

  // Sync selectedList from current state
  const selectedList = useMemo(() => {
    if (!selectedListId) return null;
    return lists.find(l => l.id === selectedListId) || null;
  }, [lists, selectedListId]);

  const handleBackToLists = () => {
    setSelectedListId(null);
    navigate('/listas');
  };

  const handleSelectList = (id: string) => {
    setSelectedListId(id);
    navigate(`/listas/${id}`);
  };

  // Collaborative live score: tally bips per user + show active logged-in user
  const userBipsSummary = useMemo(() => {
    if (!selectedList) return [];
    const map: Record<string, { username: string; count: number }> = {};

    // Current user always visible
    if (currentUser?.username) {
      map[currentUser.username] = { username: currentUser.username, count: 0 };
    }

    // Team members
    if (selectedList.teamMemberUsernames) {
      selectedList.teamMemberUsernames.forEach(uname => {
        if (!map[uname]) {
          map[uname] = { username: uname, count: 0 };
        }
      });
    }

    // Count bips from scanned items
    selectedList.scannedItems?.forEach(item => {
      const name = item.scannedBy || 'Coletor';
      if (!map[name]) {
        map[name] = { username: name, count: 0 };
      }
      map[name].count += 1;
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [selectedList, currentUser]);

  // Calculated missing IDs
  const missingIds = useMemo(() => {
    if (!selectedList) return [];
    const scannedSet = new Set(selectedList.scannedItems.map(s => s.id));
    return selectedList.ids.filter(id => !scannedSet.has(id));
  }, [selectedList]);

  // Notify parent if list is open
  useEffect(() => {
    onOpenChange?.(Boolean(selectedListId));
    return () => {
      onOpenChange?.(false);
    };
  }, [selectedListId, onOpenChange]);

  // Keep focus on input when in scanning mode
  useEffect(() => {
    if (selectedList) {
      setTimeout(() => {
        bipInputRef.current?.focus();
      }, 100);
    }
  }, [selectedListId, selectedList]);

  // Auto-fill list name when cycle changes in create modal
  useEffect(() => {
    const finalCycle = cycleType === 'Personalizado' ? (customCycle || 'Especial') : cycleType;
    const today = new Date().toLocaleDateString('pt-BR');
    setListName(`Lista ${finalCycle} - ${today}`);
  }, [cycleType, customCycle]);

  // Pre-select current user in team when opening create modal
  const openCreateModal = () => {
    const today = new Date().toLocaleDateString('pt-BR');
    setCycleType('AM');
    setCustomCycle('');
    setListName(`Lista AM - ${today}`);
    setRawIds('');
    setIsPublicToAll(true);
    setSelectedTeamUserIds(currentUser?.id ? [currentUser.id] : []);
    setUserSearchTerm('');
    setIsCreateModalOpen(true);
  };

  const toggleUserInCreateModal = (userId: string) => {
    setSelectedTeamUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateList = async () => {
    if (cycleType === 'Personalizado' && !customCycle.trim()) return;
    if (!listName.trim()) return;

    setIsSaving(true);
    const finalCycle = cycleType === 'Personalizado' ? customCycle.trim() : cycleType;
    const today = new Date().toLocaleDateString('pt-BR');
    
    // Parse IDs
    const parsedIds: string[] = Array.from(new Set<string>(
      rawIds.split(/[\n\r,;\t\s]+/)
        .map(i => i.trim().toUpperCase())
        .filter(i => i.length > 0)
    ));

    // Resolve user names
    const teamUsernames = allSystemUsers
      .filter(u => selectedTeamUserIds.includes(u.id))
      .map(u => u.username);

    const newList: ColetaList = {
      id: 'col_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: listName.trim(),
      date: today,
      cycle: finalCycle,
      ids: parsedIds,
      isPrivate: false,
      scannedItems: [],
      createdAt: new Date().toISOString(),
      createdBy: {
        id: currentUser?.id || 'anon',
        username: currentUser?.username || 'Usuário'
      },
      teamMembers: selectedTeamUserIds,
      teamMemberUsernames: teamUsernames,
      isPublicToAll
    };

    const ok = await saveColetaList(newList);
    setIsSaving(false);
    setIsCreateModalOpen(false);
    // Auto open the created list immediately in the Aba de Coleta spreadsheet via route token!
    setSelectedListId(newList.id);
    navigate(`/listas/${newList.id}`);
  };

  const handleDeleteList = async (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir esta lista de coleta? Esta ação é irreversível.')) {
      if (selectedListId === listId) {
        setSelectedListId(null);
        navigate('/listas');
      }
      await deleteColetaList(listId);
    }
  };

  const handleUnlockScanner = () => {
    setIsLockedByDirtyId(false);
    setDirtyLockDetails(null);
    setTimeout(() => {
      bipInputRef.current?.focus();
    }, 50);
  };

  const handleScanBarcode = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !bipInput.trim() || !selectedList) return;
    if (isLockedByDirtyId) return;
    
    const scannedId = bipInput.trim().toUpperCase();
    const isTarget = selectedList.ids.includes(scannedId);
    const isAlreadyScanned = selectedList.scannedItems.some(i => i.id === scannedId);

    if (isAlreadyScanned) {
      playAlarmSiren();
      try { navigator.vibrate?.([300, 100, 300]); } catch (err) {}
      const existing = selectedList.scannedItems.find(i => i.id === scannedId);
      const reasonMsg = `PACOTE JÁ BIPADO anteriormente por ${existing?.scannedBy || 'outro membro'}!`;
      
      // Ativa Trava de Segurança
      setIsLockedByDirtyId(true);
      setDirtyLockDetails({
        id: scannedId,
        reason: `Pacote JÁ FOI BIPADO por ${existing?.scannedBy || 'outro coletor'}. Não bipe novamente!`,
        scannedBy: currentUser?.username || 'Você',
        time: new Date().toLocaleTimeString('pt-BR')
      });

      setLastScanResult({ 
        status: 'error', 
        message: `🚨 TRAVA ATIVADA: ID DUPLICADO (${scannedId})!`,
        id: scannedId
      });

      // Registra ID Sujo
      const dirtyItem: DirtyScanItem = {
        id: scannedId,
        reason: 'ja_bipado',
        reasonText: `Já bipado anteriormente por ${existing?.scannedBy || 'outro membro'}`,
        scannedAt: new Date().toISOString(),
        scannedBy: currentUser?.username || 'Coletor',
        scannedById: currentUser?.id
      };
      await addDirtyScanToList(selectedList.id, dirtyItem);

    } else if (!isTarget) {
      playAlarmSiren();
      try { navigator.vibrate?.([400, 150, 400]); } catch (err) {}
      
      // Ativa Trava de Segurança
      setIsLockedByDirtyId(true);
      setDirtyLockDetails({
        id: scannedId,
        reason: `Pacote NÃO PERTENCE a esta lista de coleta! Separe este volume fisicamente.`,
        scannedBy: currentUser?.username || 'Você',
        time: new Date().toLocaleTimeString('pt-BR')
      });

      setLastScanResult({ 
        status: 'error', 
        message: `🚨 TRAVA ATIVADA: ID SUJO FORA DA LISTA (${scannedId})!`,
        id: scannedId
      });

      // Registra ID Sujo
      const dirtyItem: DirtyScanItem = {
        id: scannedId,
        reason: 'nao_pertence_lista',
        reasonText: 'Pacote NÃO pertence a esta lista de coleta',
        scannedAt: new Date().toISOString(),
        scannedBy: currentUser?.username || 'Coletor',
        scannedById: currentUser?.id
      };
      await addDirtyScanToList(selectedList.id, dirtyItem);

    } else {
      playBeep();
      const newItem: ScannedItem = {
        id: scannedId,
        scannedAt: new Date().toISOString(),
        scannedBy: currentUser?.username || 'Coletor',
        scannedById: currentUser?.id
      };

      setLastScanResult({ 
        status: 'success', 
        message: `Pacote ${scannedId} coletado com sucesso!`,
        id: scannedId
      });

      // Update in Firestore
      await addScannedItemToList(selectedList.id, newItem);
    }

    setBipInput('');
    if (isTarget && !isAlreadyScanned) {
      setTimeout(() => {
        bipInputRef.current?.focus();
      }, 20);
    }
  };

  // Extra IDs Addition
  const handleAddExtraIds = async () => {
    if (!selectedList || !newExtraIds.trim()) return;
    const additional = newExtraIds.split(/[\n\r,;\t\s]+/)
      .map(i => i.trim().toUpperCase())
      .filter(i => i.length > 0);

    const merged: string[] = Array.from(new Set<string>([...selectedList.ids, ...additional]));
    const updated = { ...selectedList, ids: merged };
    await saveColetaList(updated);
    setNewExtraIds('');
    setIsAddingIdsModalOpen(false);
  };

  // Open Team Edit Modal for existing list
  const handleOpenTeamModal = (list: ColetaList, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setManagingTeamList(list);
    setTempTeamUserIds(list.teamMembers || []);
    setTempIsPublicToAll(list.isPublicToAll ?? true);
  };

  const handleSaveTeamModal = async () => {
    if (!managingTeamList) return;
    const usernames = allSystemUsers
      .filter(u => tempTeamUserIds.includes(u.id))
      .map(u => u.username);

    await updateListTeam(managingTeamList.id, tempTeamUserIds, usernames, tempIsPublicToAll);
    setManagingTeamList(null);
  };

  const toggleUserInTeamModal = (userId: string) => {
    setTempTeamUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Filter Lists
  const filteredLists = useMemo(() => {
    return lists.filter(list => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = list.name.toLowerCase().includes(term);
        const matchesCycle = list.cycle.toLowerCase().includes(term);
        const matchesDate = list.date.toLowerCase().includes(term);
        const matchesCreator = list.createdBy?.username?.toLowerCase().includes(term);
        if (!matchesName && !matchesCycle && !matchesDate && !matchesCreator) return false;
      }

      // Tab filter
      const isMine = list.createdBy?.id === currentUser?.id;
      const isInTeam = list.teamMembers?.includes(currentUser?.id || '');
      const isPublic = list.isPublicToAll !== false;
      const isDone = list.ids.length > 0 && list.scannedItems.length >= list.ids.length;

      if (filterTab === 'mine') return isMine;
      if (filterTab === 'team') return isInTeam && !isMine;
      if (filterTab === 'done') return isDone;

      // 'all' shows lists user can see: public, or user is admin, or user is creator, or user is in team
      if (currentUser?.isAdmin) return true;
      return isPublic || isMine || isInTeam;
    });
  }, [lists, searchTerm, filterTab, currentUser]);

  // Export List Data to CSV
  const handleExportCSV = (list: ColetaList) => {
    const rows = [
      ['ID', 'Status', 'Horario de Bip', 'Bipado Por'],
      ...list.ids.map(id => {
        const scanned = list.scannedItems.find(s => s.id === id);
        return [
          id,
          scanned ? 'COLETADO' : 'PENDENTE',
          scanned ? new Date(scanned.scannedAt).toLocaleString('pt-BR') : '-',
          scanned?.scannedBy || '-'
        ];
      })
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${list.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyMissingIds = (list: ColetaList) => {
    const missing = list.ids.filter(id => !list.scannedItems.some(s => s.id === id));
    navigator.clipboard.writeText(missing.join('\n'));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className={selectedList ? "w-full min-h-screen" : "max-w-7xl mx-auto p-3 sm:p-6 space-y-6"}>
      
      {/* Header bar (only shown in gallery view) */}
      {!selectedList && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFE600] flex items-center justify-center text-gray-950 font-black shadow-sm">
              <ListTodo className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Listas de Coleta
                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                  {lists.length}
                </span>
              </h1>
              <p className="text-xs text-gray-500">
                Gerencie listas de conferência, acompanhe o progresso e bipe com sua equipe
              </p>
            </div>
          </div>

          <button
            onClick={openCreateModal}
            className="bg-[#FFE600] hover:bg-yellow-400 text-gray-950 font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Criar Nova Lista
          </button>
        </div>
      )}

      {/* Main View: List Collection View OR List Gallery */}
      {selectedList ? (
        <AbaColetaPlanilha
          list={selectedList}
          currentUser={currentUser}
          onBackToLists={handleBackToLists}
          onOpenTeamModal={() => handleOpenTeamModal(selectedList)}
          onOpenAddIdsModal={() => setIsAddingIdsModalOpen(true)}
          onExportCSV={() => handleExportCSV(selectedList)}
          onOpenCreateModal={openCreateModal}
        />
      ) : (
        /* GALLERY / CARDS VIEW */
        <div className="space-y-5">
          
          {/* Filters and Search Bar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Tabs */}
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterTab === 'all' 
                    ? 'bg-[#FFE600] text-gray-950 font-black shadow-sm ring-1 ring-yellow-400' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas as Listas ({lists.length})
              </button>
              <button
                onClick={() => setFilterTab('done')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterTab === 'done' 
                    ? 'bg-[#FFE600] text-gray-950 font-black shadow-sm ring-1 ring-yellow-400' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Concluídas
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por nome, ciclo ou data..."
                className="w-full bg-gray-50 pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-amber-500 focus:bg-white transition-colors"
              />
            </div>

          </div>

          {/* Lists Table / List View */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
              <span className="text-sm font-medium">Sincronizando listas da nuvem...</span>
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center space-y-4">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                <ListTodo className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-900">Nenhuma lista encontrada</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {searchTerm.trim() ? 'Nenhuma lista corresponde ao filtro informado.' : 'Crie sua primeira lista de coleta e convide sua equipe para bipar junto!'}
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="bg-[#FFE600] hover:bg-yellow-400 text-gray-950 font-black px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Criar Lista de Coleta
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Table Column Headers on Desktop */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3.5 bg-gray-50 border-b border-gray-200 text-[11px] font-black uppercase tracking-wider text-gray-600 select-none">
                <div className="col-span-4">Lista & Ciclo</div>
                <div className="col-span-3">Equipe Autorizada</div>
                <div className="col-span-3">Progresso da Coleta</div>
                <div className="col-span-2 text-right">Ações</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {filteredLists.map(list => {
                  const total = list.ids.length;
                  const scanned = list.scannedItems?.length || 0;
                  const percent = total > 0 ? Math.round((scanned / total) * 100) : 0;
                  const isCreator = list.createdBy?.id === currentUser?.id;
                  const isDone = total > 0 && scanned >= total;

                  return (
                    <div 
                      key={list.id}
                      onClick={() => handleSelectList(list.id)}
                      className="px-5 py-4 hover:bg-amber-50/40 transition-colors cursor-pointer group flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 lg:items-center"
                    >
                      {/* Col 1: Ciclo + Nome + Detalhes */}
                      <div className="lg:col-span-4 flex items-start gap-3 min-w-0">
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                          <span className="text-xs font-black px-2 py-0.5 rounded-md bg-[#FFE600] text-gray-950 shadow-xs border border-yellow-400">
                            {list.cycle}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 text-sm group-hover:text-amber-900 transition-colors truncate">
                              {list.name}
                            </h3>
                            {isDone && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                100%
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5 truncate">
                            <span>{list.date}</span>
                            <span>•</span>
                            <span>Criado por <strong>{list.createdBy?.username || 'Admin'}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Col 2: Equipe */}
                      <div className="lg:col-span-3 flex items-center gap-1.5 flex-wrap">
                        {list.isPublicToAll !== false ? (
                          <span className="text-[11px] bg-gray-100 text-gray-700 font-medium px-2.5 py-1 rounded-lg border border-gray-200 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-gray-500" />
                            Toda a equipe (Geral)
                          </span>
                        ) : list.teamMemberUsernames && list.teamMemberUsernames.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[11px] bg-amber-50 text-amber-950 font-medium px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-amber-700" />
                              {list.teamMemberUsernames.slice(0, 2).join(', ')}
                              {list.teamMemberUsernames.length > 2 && (
                                <span className="font-bold text-amber-800">
                                  +{list.teamMemberUsernames.length - 2}
                                </span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200">
                            Apenas Criador
                          </span>
                        )}
                      </div>

                      {/* Col 3: Progresso */}
                      <div className="lg:col-span-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-emerald-700 font-bold">{scanned} / {total} coletados</span>
                          <span className="text-gray-500 font-mono text-[11px]">{percent}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Col 4: Ações */}
                      <div 
                        className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0 border-t border-gray-100 lg:border-t-0"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleOpenTeamModal(list, e)}
                            className="text-gray-500 hover:text-amber-900 p-2 rounded-lg hover:bg-amber-100/70 transition-colors cursor-pointer"
                            title="Gerenciar Equipe de Coletores"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          
                          {(isCreator || currentUser?.isAdmin) && (
                            <button
                              onClick={(e) => handleDeleteList(list.id, e)}
                              className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                              title="Excluir lista"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => handleSelectList(list.id)}
                          className="bg-[#FFE600] hover:bg-yellow-400 text-gray-950 font-black px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Bipar</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* POPUP / MODAL: CRIAR NOVA LISTA DE COLETA COM EQUIPE    */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col my-auto"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-gray-900 border-b-2 border-[#FFE600] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                    <ListTodo className="w-5 h-5 text-[#FFE600]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Criar Nova Lista de Coleta</h3>
                    <p className="text-xs text-gray-300">Defina o ciclo, convide coletores e adicione os IDs</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
                
                {/* 1. Ciclo & Nome */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600" />
                    1. Ciclo Operacional
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {['AM', 'PM', 'SD', 'Personalizado'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCycleType(opt)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          cycleType === opt
                            ? 'bg-[#FFE600] text-gray-950 font-black shadow-sm ring-1 ring-yellow-400'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  {cycleType === 'Personalizado' && (
                    <input
                      type="text"
                      value={customCycle}
                      onChange={e => setCustomCycle(e.target.value)}
                      placeholder="Ex: Turno Corujão / Especial..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium focus:border-amber-500 focus:bg-white outline-none transition-all"
                    />
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-500">Nome da Lista</label>
                    <input
                      type="text"
                      value={listName}
                      onChange={e => setListName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-800 focus:border-amber-500 focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 2. Equipe de Coletores (Convite aos Usuários do Sistema) */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-amber-600" />
                      2. Equipe de Coletores (Bipar Juntos)
                    </label>
                    <span className="text-[11px] font-bold text-amber-950 bg-amber-100 px-2 py-0.5 rounded-full">
                      {isPublicToAll ? 'Todos os usuários' : `${selectedTeamUserIds.length} selecionados`}
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPublicToAll(true)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col gap-1 cursor-pointer ${
                        isPublicToAll
                          ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-400/20'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-extrabold flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-amber-700" /> Liberado para Todos
                      </span>
                      <span className="text-[10px] text-gray-500 font-normal">Qualquer membro do sistema poderá ver e bipar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPublicToAll(false)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col gap-1 cursor-pointer ${
                        !isPublicToAll
                          ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-400/20'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-extrabold flex items-center gap-1.5">
                        <UserPlus className="w-3.5 h-3.5 text-amber-700" /> Convidar Coletores Específicos
                      </span>
                      <span className="text-[10px] text-gray-500 font-normal">Apenas você e os usuários marcados verão a lista</span>
                    </button>
                  </div>

                  {/* Users Selection List */}
                  {!isPublicToAll && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          placeholder="Buscar usuário registrado..."
                          className="w-full bg-white pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {allSystemUsers
                          .filter(u => !userSearchTerm.trim() || u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                          .map(u => {
                            const isSelected = selectedTeamUserIds.includes(u.id);
                            const isMe = u.id === currentUser?.id;
                            return (
                              <div
                                key={u.id}
                                onClick={() => toggleUserInCreateModal(u.id)}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors border ${
                                  isSelected 
                                    ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-bold' 
                                    : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isSelected ? 'bg-[#FFE600] text-gray-950' : 'bg-gray-200 text-gray-600'}`}>
                                    {u.username.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <span>{u.username}</span>
                                    {isMe && <span className="ml-1 text-[10px] text-amber-700 font-bold">(Você)</span>}
                                    <div className="text-[10px] text-gray-400 font-normal">{u.email}</div>
                                  </div>
                                </div>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-gray-300 bg-white'}`}>
                                  {isSelected && <Check className="w-3 h-3" />}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. IDs dos Pacotes */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-amber-600" />
                      3. IDs dos Pacotes para Coleta
                    </label>
                    <span className="text-[11px] font-mono text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded">
                      {rawIds.split(/[\n\r,;\t\s]+/).filter(i => i.trim().length > 0).length} IDs detectados
                    </span>
                  </div>
                  <textarea
                    value={rawIds}
                    onChange={e => setRawIds(e.target.value)}
                    placeholder="Cole aqui os códigos de rastreio/IDs (separados por linha, vírgula ou espaço). Pode também adicionar mais tarde!"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono focus:border-amber-500 focus:bg-white outline-none min-h-[120px] resize-y"
                  />
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateList}
                  disabled={isSaving || !listName.trim()}
                  className="bg-[#FFE600] hover:bg-yellow-400 disabled:bg-gray-200 disabled:text-gray-400 text-gray-950 px-6 py-2.5 rounded-xl text-xs font-black shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-gray-950" />}
                  <span>{isSaving ? 'Salvando...' : 'Salvar Lista na Nuvem'}</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* POPUP: GERENCIAR EQUIPE DE UMA LISTA EXISTENTE           */}
      {/* ======================================================== */}
      <AnimatePresence>
        {managingTeamList && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 bg-gray-900 border-b-2 border-[#FFE600] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-[#FFE600]" />
                  <div>
                    <h3 className="font-bold text-sm">Equipe da Lista: {managingTeamList.name}</h3>
                    <p className="text-[11px] text-gray-300">Escolha quem pode visualizar e bipar junto</p>
                  </div>
                </div>
                <button 
                  onClick={() => setManagingTeamList(null)}
                  className="text-white/80 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTempIsPublicToAll(true)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      tempIsPublicToAll 
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-black ring-2 ring-amber-400/20' 
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    Liberado p/ Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempIsPublicToAll(false)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      !tempIsPublicToAll 
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-black ring-2 ring-amber-400/20' 
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    Coletores Específicos
                  </button>
                </div>

                {!tempIsPublicToAll && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-gray-700">Selecione os Coletores:</div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2 bg-gray-50">
                      {allSystemUsers.map(u => {
                        const isSelected = tempTeamUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUserInTeamModal(u.id)}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                              isSelected 
                                ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-bold' 
                                : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <div>
                              <span>{u.username}</span>
                              <div className="text-[10px] text-gray-400 font-normal">{u.email}</div>
                            </div>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-gray-300 bg-white'}`}>
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => setManagingTeamList(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveTeamModal}
                  className="bg-[#FFE600] hover:bg-yellow-400 text-gray-950 px-5 py-2 rounded-xl text-xs font-black shadow-sm cursor-pointer"
                >
                  Salvar Equipe
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* POPUP: INSERIR MAIS IDS EM UMA LISTA ATIVA               */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isAddingIdsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 bg-gray-900 border-b-2 border-[#FFE600] text-white flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#FFE600]" />
                  Adicionar Mais IDs à Lista
                </h3>
                <button onClick={() => setIsAddingIdsModalOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500">
                  Cole os IDs adicionais que chegaram para este ciclo. Eles serão somados à lista existente.
                </p>
                <textarea
                  value={newExtraIds}
                  onChange={e => setNewExtraIds(e.target.value)}
                  placeholder="Cole os IDs adicionais aqui..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono min-h-[140px] focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => setIsAddingIdsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddExtraIds}
                  className="bg-[#FFE600] hover:bg-yellow-400 text-gray-950 px-5 py-2 rounded-xl text-xs font-black shadow-sm cursor-pointer"
                >
                  Adicionar IDs
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
