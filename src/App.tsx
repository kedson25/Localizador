import React, { useState } from 'react';
import { ActiveTab, CsvRow, GroupSummary } from './types';
import { parseCsvText } from './utils/csvParser';
import { Header } from './components/Header';
import { IdLookup } from './components/IdLookup';
import { IdRemover } from './components/IdRemover';
import { CsvUploader } from './components/CsvUploader';
import { StatsSummary } from './components/StatsSummary';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleParseText = (textToParse: string, notifyMsg?: string) => {
    setRawText(textToParse);
    const parsed = parseCsvText(textToParse);
    setRows(parsed.rows);
    setGroups(parsed.groups);
    setHeaders(parsed.headers);

    if (notifyMsg) {
      showNotification(notifyMsg);
    }
  };

  const handleClear = () => {
    setRawText('');
    setRows([]);
    setGroups([]);
    setHeaders([]);
    setActiveTab('upload');
    showNotification('Dados limpos com sucesso.');
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Fixed High Density Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onClear={handleClear}
        totalRows={rows.length}
        totalGroups={groups.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Floating Notification */}
        {notification && (
          <div className="bg-[#111827] text-white px-4 py-2 rounded shadow-md text-xs font-mono flex items-center justify-between border border-gray-700 animate-in fade-in">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              {notification}
            </span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 hover:text-gray-300 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Summary Bar */}
        <StatsSummary totalRows={rows.length} groups={groups} />

        {/* Tab Views */}
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

        {activeTab === 'upload' && (
          <CsvUploader
            onLoadText={(text) => {
              handleParseText(text, 'Arquivo processado e dados carregados com sucesso!');
              setActiveTab('lookup');
            }}
            currentTotalRows={rows.length}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-2.5 text-center text-[10px] text-gray-400 font-mono uppercase tracking-widest">
        ID.GROUP LOCATOR &copy; {new Date().getFullYear()} — HIGH DENSITY OPERATIONAL SYSTEM
      </footer>
    </div>
  );
}
