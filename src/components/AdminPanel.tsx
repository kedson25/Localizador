import React, { useState, useEffect } from 'react';
import { User, getAllUsers, updateUserAdminStatus, getUserById } from '../lib/auth';
import { Shield, ShieldAlert, CheckCircle, XCircle, Users, Activity, Settings2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [loading, setLoading] = useState(true);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    verifyAndFetch();
  }, [currentUser]);

  const verifyAndFetch = async () => {
    setLoading(true);
    if (!currentUser?.id) {
      setIsVerifiedAdmin(false);
      setLoading(false);
      return;
    }
    
    // Verify directly from backend or fallback to currentUser
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

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800">Métricas Gerais</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-700">{users.length}</div>
            <div className="text-xs text-blue-600 font-medium uppercase mt-1">Total Usuários</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-700">{approvedUsers.length}</div>
            <div className="text-xs text-emerald-600 font-medium uppercase mt-1">Aprovados</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-amber-700">{pendingUsers.length}</div>
            <div className="text-xs text-amber-600 font-medium uppercase mt-1">Pendentes</div>
          </div>
          <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-700">{users.filter(u => u.isAdmin).length}</div>
            <div className="text-xs text-purple-600 font-medium uppercase mt-1">Administradores</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-800">Gerenciar Usuários</h2>
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
              
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
