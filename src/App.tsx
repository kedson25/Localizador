import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ActiveTab, CsvRow, GroupSummary } from './types';
import { parseCsvText } from './utils/csvParser';
import { Header } from './components/Header';
import { ToolsHub } from './components/ToolsHub';
import { IdLookup } from './components/IdLookup';
import { IdRemover } from './components/IdRemover';
import { WhatsappReport } from './components/WhatsappReport';
import { CsvUploader } from './components/CsvUploader';
import { StatsSummary } from './components/StatsSummary';
import { ControleRefugo } from './components/ControleRefugo';
import { saveToColetor, loadFromColetor, clearColetor } from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tools');
  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState<boolean>(true);

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
    setActiveTab('tools');

    // Clear from Firebase
    await clearColetor();
    showNotification('Dados zerados com sucesso!');
  };

  return (
    <div className="min-h-screen bg-[#EBEBEB] text-[#333333] flex flex-col font-sans selection:bg-[#3483FA] selection:text-white">
      {/* Global Theme Header */}
      {activeTab !== 'tools' && (
        <header className="bg-[#FFE600] px-4 py-3 sticky top-0 z-50 shadow-sm flex items-center justify-between">
          <button 
            onClick={() => setActiveTab('tools')}
            className="flex items-center gap-2 text-sm font-bold text-[#333333] hover:text-black transition-colors bg-white/60 hover:bg-white/80 px-3 py-1.5 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          
          <div className="text-xs font-bold text-[#2D3277]/70 uppercase hidden sm:block">
            {activeTab === 'lookup' && 'Consultar IDs'}
            {activeTab === 'remove' && 'Remover IDs'}
            {activeTab === 'report' && 'Reporte WhatsApp'}
            {activeTab === 'upload' && 'Importar CSV'}
            {activeTab === 'refugo' && 'Controle Refugo'}
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
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

        {loadingFirebase && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2 rounded text-xs font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            Carregando dados salvos...
          </div>
        )}

        {/* Tab Views */}
        {activeTab === 'tools' && (
          <ToolsHub
            onSelectTab={setActiveTab}
            totalRows={rows.length}
            groups={groups}
            onClear={handleClear}
          />
        )}

        {/* Stats Summary Bar for lookup */}
        {activeTab === 'lookup' && (
          <StatsSummary totalRows={rows.length} groups={groups} />
        )}

        {activeTab === 'lookup' && (
          <IdLookup
            rows={rows}
            onNavigateToUpload={() => setActiveTab('upload')}
          />
        )}

        {activeTab === 'remove' && (
          <IdRemover
            rows={rows}
            headers={headers}
          />
        )}

        {activeTab === 'report' && (
          <WhatsappReport
            rows={rows}
          />
        )}

        {activeTab === 'refugo' && (
          <ControleRefugo />
        )}

        {activeTab === 'upload' && (
          <CsvUploader
            onLoadText={(text) => {
              handleParseAndSave(text);
              setActiveTab('tools');
            }}
            currentTotalRows={rows.length}
          />
        )}
      </main>
    </div>
  );
}
