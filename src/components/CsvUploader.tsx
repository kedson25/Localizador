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
    <div className="max-w-4xl mx-auto space-y-4">
      {/* File Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer bg-white ${
          isDragging
            ? 'border-amber-500 bg-amber-50/50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
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

        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
          <Upload className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-gray-900 mb-1 uppercase tracking-tight">
          Importar Arquivo
        </h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
          CSV, TXT ou TSV
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="px-4 py-2 bg-[#111827] hover:bg-black text-white rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors shadow-sm"
        >
          Selecionar
        </button>

        {currentTotalRows > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs font-mono text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-200 font-bold">
              ✓ {currentTotalRows} registros carregados
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
