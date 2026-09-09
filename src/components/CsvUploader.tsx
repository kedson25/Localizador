import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

interface CsvUploaderProps {
  onLoadText: (rawText: string) => void;
  currentTotalRows: number;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({
  onLoadText,
  currentTotalRows,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          onLoadText(text);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          onLoadText(text);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="max-w-3xl mx-auto font-sans text-slate-800">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border border-dashed rounded p-8 text-center cursor-pointer bg-white ${
          isDragging
            ? 'border-[#3483FA] bg-slate-50'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.tsv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-600">
          <Upload className="w-5 h-5" />
        </div>

        <h3 className="text-xs font-bold text-slate-900 mb-1 uppercase tracking-wider">
          Importar Arquivo CSV
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Arraste o arquivo ou clique para selecionar (CSV, TXT, TSV)
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold transition-colors cursor-pointer"
        >
          Selecionar Arquivo
        </button>

        {currentTotalRows > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-600">
            {currentTotalRows.toLocaleString('pt-BR')} registros na base atual
          </div>
        )}
      </div>
    </div>
  );
};
