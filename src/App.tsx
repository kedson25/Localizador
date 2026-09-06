import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CsvRow, GroupSummary } from './types';
import { parseCsvText } from './utils/csvParser';
import { ToolsHub } from './components/ToolsHub';
import { IdLookup } from './components/IdLookup';
import { IdRemover } from './components/IdRemover';
import { WhatsappReport } from './components/WhatsappReport';
import { CsvUploader } from './components/CsvUploader';
import { StatsSummary } from './components/StatsSummary';
import { ControleRefugo } from './components/ControleRefugo';
import { ListasColeta } from './components/ListasColeta';
import { Login } from './components/Login';
import { Navigate } from 'react-router-dom';
import { AdminPanel } from './components/AdminPanel';
import { User } from './lib/auth';

import { saveToColetor, loadFromColetor, clearColetor } from './lib/firebase';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
  });
  const isAuthenticated = !!currentUser;




  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // On mount, load stored CSV from Firebase Firestore
  useEffect(() => {
    async function initFromFirebase() {
      setLoadingFirebase(true);
      try {
        const savedData = await loadFromColetor();
        if (savedData && savedData.rawText) {
          setRawText(savedData.rawText);
          const parsed = parseCsvText(savedData.rawText);
          setRows(parsed.rows);
          setGroups(parsed.groups);
          setHeaders(parsed.headers);
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoadingFirebase(false);
      }
    }
    initFromFirebase();
  }, []);

  const handleParseAndSave = async (textToParse: string, fileName?: string) => {
    setRawText(textToParse);
    const parsed = parseCsvText(textToParse);
    setRows(parsed.rows);
    setGroups(parsed.groups);
    setHeaders(parsed.headers);

    // Save to Firebase
    const saved = await saveToColetor(textToParse, parsed.rows.length, fileName);
    if (saved) {
      showNotification(`Dados processados e salvos com sucesso! (${parsed.rows.length} IDs)`);
    } else {
      showNotification('Processado localmente.');
    }
  };

  const handleClear = async () => {
    setRawText('');
    setRows([]);
    setGroups([]);
    setHeaders([]);
    navigate('/');
    
    // Clear from Firebase
    await clearColetor();
    showNotification('Dados zerados com sucesso!');
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/consulta': return 'Buscar grupos';
      case '/remover': return 'Remover IDs';
      case '/reporte': return 'Reporte WhatsApp';
      case '/upload': return 'Importar CSV';
      case '/listas': return 'Listas de Coleta';
      case '/refugo': return 'Controle Refugo';
      case '/admin': return 'Painel Admin';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#EBEBEB] text-[#333333] flex flex-col font-sans selection:bg-[#3483FA] selection:text-white">
      {/* Global Theme Header */}
      {!isHome && location.pathname !== '/login' && (
        <header className="bg-[#FFE600] px-4 py-3 sticky top-0 z-50 shadow-sm flex items-center justify-between">
          <Link 
            to="/"
            className="flex items-center gap-2 text-sm font-bold text-[#333333] hover:text-black transition-colors bg-white/60 hover:bg-white/80 px-3 py-1.5 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
          
          <div className="text-xs font-bold text-[#2D3277]/70 uppercase hidden sm:block">
            {getPageTitle()}
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto ${location.pathname === "/login" ? "" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-4"}`}>
        {/* Floating Notification */}
        {notification && (
          <div className="bg-[#111827] text-white px-4 py-2.5 rounded shadow-md text-xs font-mono flex items-center justify-between border border-gray-700 animate-in fade-in">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              {notification}
            </span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 hover:text-gray-300 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {loadingFirebase && location.pathname !== '/refugo' ? (
          <div className="space-y-4 max-w-4xl mx-auto mt-4 animate-in fade-in duration-300">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-8"></div>
            
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="mt-6 space-y-4 border-t border-gray-50 pt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-gray-100 rounded-md animate-pulse"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={(user) => { setCurrentUser(user); localStorage.setItem('currentUser', JSON.stringify(user)); navigate('/'); }} />
            } />
            
            {/* Protected Routes */}
            {isAuthenticated && (
              <>
                <Route path="/" element={<ToolsHub totalRows={rows.length} groups={groups} onClear={handleClear} currentUser={currentUser} />} />
                
                {currentUser?.isAdmin && (
                  <Route path="/admin" element={<AdminPanel currentUser={currentUser} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('consulta')) && (
                  <Route path="/consulta" element={<><StatsSummary totalRows={rows.length} groups={groups} /><IdLookup rows={rows} onNavigateToUpload={() => navigate('/upload')} /></>} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('remover')) && (
                  <Route path="/remover" element={<IdRemover rows={rows} headers={headers} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('reporte')) && (
                  <Route path="/reporte" element={<WhatsappReport rows={rows} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('listas')) && (
                  <Route path="/listas" element={<ListasColeta currentUser={currentUser} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('upload')) && (
                  <Route path="/upload" element={<CsvUploader onLoadText={(text) => { handleParseAndSave(text); navigate('/'); }} currentTotalRows={rows.length} />} />
                )}
              </>
            )}
            
            {/* Fallback */}
            <Route path="*" element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
          </Routes>
        )}

      </main>
    </div>
  );
}
