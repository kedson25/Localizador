import React, { useState, useEffect } from 'react';
import { User, getAllUsers, updateUserAdminStatus, getUserById } from '../lib/auth';
import { Shield, ShieldAlert, CheckCircle, XCircle, Users, Activity, Settings2, AlertTriangle, Package, CheckSquare, Edit3, BarChart3, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listenToListas, saveLista } from '../lib/firebase';
import { ColetaLista } from '../types';

const TABS = [
  { id: 'consulta', label: 'Buscar grupos' },
  { id: 'remover', label: 'Remover IDs' },
  { id: 'reporte', label: 'Reporte WhatsApp' },
  { id: 'listas', label: 'Listas de Coleta' },
  { id: 'upload', label: 'Importar CSV' },
];

interface AdminPanelProps {
  currentUser?: User | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const navigate = useNavigate();

  // Modal de métricas para a lista selecionada
  const [selectedListaForMetrics, setSelectedListaForMetrics] = useState<ColetaLista | null>(null);
  const [formAcerto, setFormAcerto] = useState<string>('100');
  const [formGaiola, setFormGaiola] = useState<string>('Fechado');
  const [formFaltaram, setFormFaltaram] = useState<string>('0');

  useEffect(() => {
    verifyAndFetch();
    const unsubListas = listenToListas((data) => {
      setListas(data);
    });
    return () => {
      unsubListas();
    };
  }, [currentUser]);

  const verifyAndFetch = async () => {
    setLoading(true);
    if (!currentUser?.id) {
      setIsVerifiedAdmin(false);
      setLoading(false);
      return;
    }
    
    const freshUser = await getUserById(currentUser.id);
    if ((freshUser && freshUser.isAdmin) || (!freshUser && currentUser.isAdmin)) {
      setIsVerifiedAdmin(true);
      await fetchUsers();
    } else {
      setIsVerifiedAdmin(false);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    const data = await getAllUsers();
    setUsers(data);
  };

  const toggleApproval = async (userId: string, currentStatus: boolean) => {
    await updateUserAdminStatus(userId, { isApproved: !currentStatus });
    fetchUsers();
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    await updateUserAdminStatus(userId, { isAdmin: !currentStatus });
    fetchUsers();
  };

  const toggleTabAccess = async (userId: string, currentGroups: string[], tabId: string) => {
    const newGroups = currentGroups.includes(tabId) 
      ? currentGroups.filter(t => t !== tabId)
      : [...currentGroups, tabId];
      
    await updateUserAdminStatus(userId, { allowedGroups: newGroups });
    fetchUsers();
  };

  const handleOpenMetricsModal = (lista: ColetaLista) => {
    setSelectedListaForMetrics(lista);
    setFormAcerto(lista.porcentagemAcerto !== undefined ? lista.porcentagemAcerto.toString() : '100');
    setFormGaiola(lista.fechamentoGaiola || 'Fechado');
    setFormFaltaram(lista.itensFaltaram !== undefined ? lista.itensFaltaram.toString() : '0');
  };

  const handleSaveMetrics = async () => {
    if (!selectedListaForMetrics) return;
    const updated: ColetaLista = {
      ...selectedListaForMetrics,
      status: 'finalizada',
      porcentagemAcerto: parseFloat(formAcerto) || 0,
      fechamentoGaiola: formGaiola,
      itensFaltaram: parseInt(formFaltaram, 10) || 0
    };
    await saveLista(updated);
    setSelectedListaForMetrics(null);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Verificando permissões...</div>;
  }
  
  if (!isVerifiedAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white p-8 rounded-lg shadow border border-red-200 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Negado</h2>
        <p className="text-gray-600 mb-6">Você não tem permissões de administrador para visualizar esta página.</p>
        <button 
          onClick={() => navigate('/')}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors"
        >
          Voltar para Início
        </button>
      </div>
    );
  }

  const approvedUsers = users.filter(u => u.isApproved);
  const pendingUsers = users.filter(u => !u.isApproved);

  // Cálculos de métricas mensais
  const listasFinalizadas = listas.filter(l => l.status === 'finalizada');
  const totalItensColetados = listas.reduce((acc, l) => acc + (l.itens?.length || 0), 0);
  const totalFaltantesGeral = listasFinalizadas.reduce((acc, l) => acc + (l.itensFaltaram || 0), 0);
  const mediaAcertoGeral = listasFinalizadas.length > 0 
    ? (listasFinalizadas.reduce((acc, l) => acc + (l.porcentagemAcerto ?? 100), 0) / listasFinalizadas.length).toFixed(1)
    : '100.0';

  return (
    <div className="space-y-8 animate-in pb-12">
      {/* Header Geral e Métricas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800">Painel de Métricas Mensais & Operacionais</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <div className="text-2xl font-black text-blue-700">{totalItensColetados}</div>
            <div className="text-xs text-blue-600 font-bold uppercase mt-1">Total Coletado</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
            <div className="text-2xl font-black text-emerald-700">{mediaAcertoGeral}%</div>
            <div className="text-xs text-emerald-600 font-bold uppercase mt-1">Média de Acerto Mensal</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
            <div className="text-2xl font-black text-amber-700">{totalFaltantesGeral}</div>
            <div className="text-xs text-amber-600 font-bold uppercase mt-1">Total Faltantes</div>
          </div>
          <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
            <div className="text-2xl font-black text-purple-700">{listasFinalizadas.length} / {listas.length}</div>
            <div className="text-xs text-purple-600 font-bold uppercase mt-1">Listas Finalizadas</div>
          </div>
        </div>
      </div>

      {/* GERENCIAR LISTAS E MÉTRICAS DE ACERTIVIDADE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-[#3483FA]" />
            <div>
              <h2 className="text-lg font-bold text-gray-800">Listas de Coleta & Fechamento de Gaiolas</h2>
              <p className="text-xs text-gray-500">Clique em "Finalizar / Métricas" para registrar a precisão e fechar a gaiola.</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-gray-700">
            <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-600 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Nome da Lista</th>
                <th className="py-3 px-4 text-center">Tipo</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Itens</th>
                <th className="py-3 px-4 text-center">Acerto (%)</th>
                <th className="py-3 px-4 text-center">Gaiola</th>
                <th className="py-3 px-4 text-center">Faltaram</th>
                <th className="py-3 px-4 text-center">Ações / Métricas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listas.map(lista => (
                <tr key={lista.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-gray-900">{lista.nome}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[11px]">
                      {lista.tipo === 'grupos' ? 'Grupo' : 'Comum'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                      lista.status === 'finalizada' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {lista.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-gray-800">{lista.itens?.length || 0}</td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-600">
                    {lista.porcentagemAcerto !== undefined ? `${lista.porcentagemAcerto}%` : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center font-medium">
                    {lista.fechamentoGaiola || '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-red-600">
                    {lista.itensFaltaram !== undefined ? lista.itensFaltaram : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => handleOpenMetricsModal(lista)}
                      className="px-3 py-1.5 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {lista.status === 'finalizada' ? 'Editar Métricas' : 'Finalizar / Métricas'}
                    </button>
                  </td>
                </tr>
              ))}
              {listas.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 font-medium">
                    Nenhuma lista de coleta encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* GERENCIAR USUÁRIOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-800">Gerenciar Usuários & Permissões</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium uppercase text-xs border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Usuário / E-mail</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Admin</th>
                <th className="px-4 py-3">Acesso às Abas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="font-medium text-gray-800">{user.username}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </td>
                  
                  <td className="px-4 py-4 text-center">
                    <button 
                      onClick={() => toggleApproval(user.id, user.isApproved)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        user.isApproved 
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      {user.isApproved ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      {user.isApproved ? 'Aprovado' : 'Aprovar'}
                    </button>
                  </td>
                  
                  <td className="px-4 py-4 text-center">
                    <button 
                      onClick={() => toggleAdmin(user.id, user.isAdmin)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        user.isAdmin 
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {user.isAdmin ? 'Sim' : 'Não'}
                    </button>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {TABS.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => toggleTabAccess(user.id, user.allowedGroups || [], tab.id)}
                          className={`px-2 py-1 border rounded text-[11px] font-medium transition-colors ${
                            (user.allowedGroups || []).includes(tab.id)
                            ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                            : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE METRICAS E FECHAMENTO DE GAIOLA */}
      {selectedListaForMetrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-2 text-[#3483FA]">
                <BarChart3 className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-tight">Finalizar & Registrar Métricas</h3>
              </div>
              <button 
                onClick={() => setSelectedListaForMetrics(null)}
                className="p-2 hover:bg-blue-100 rounded-full text-blue-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-400 uppercase">Lista Selecionada</p>
                <p className="text-base font-black text-gray-800">{selectedListaForMetrics.nome}</p>
                <p className="text-xs font-bold text-gray-600 mt-1">Total de Bips Coletados: <span className="text-[#3483FA]">{selectedListaForMetrics.itens?.length || 0} itens</span></p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Porcentagem de Acerto (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formAcerto}
                  onChange={(e) => setFormAcerto(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  placeholder="Ex: 99.5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Fechamento de Gaiola</label>
                <select
                  value={formGaiola}
                  onChange={(e) => setFormGaiola(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                >
                  <option value="Fechado com Sucesso">Fechado com Sucesso</option>
                  <option value="Fechamento Parcial">Fechamento Parcial</option>
                  <option value="Aguardando Recontagem">Aguardando Recontagem</option>
                  <option value="Divergência Encontrada">Divergência Encontrada</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Quantos Faltaram (Itens Ausentes)</label>
                <input
                  type="number"
                  min="0"
                  value={formFaltaram}
                  onChange={(e) => setFormFaltaram(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  placeholder="Ex: 0"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setSelectedListaForMetrics(null)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveMetrics}
                className="flex-1 py-3 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                SALVAR E FINALIZAR LISTA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
