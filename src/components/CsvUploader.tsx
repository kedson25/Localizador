import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { PageSkeleton } from './PageSkeleton';

interface CsvUploaderProps {
  onLoadText: (rawText: string, fileName?: string) => void | Promise<void>;
  currentTotalRows: number;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({
  onLoadText,
  currentTotalRows,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File) => {
    setIsLoading(true);
    setFileError(null);
    try {
      const text = await file.text();
      if (text) await onLoadText(text, file.name);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo selecionado.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  if (isLoading) return <PageSkeleton variant="form" />;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {fileError && <div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fileError}</div>}
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
          Arraste ou selecione seu arquivo
        </h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
          Suporta CSV, TXT e TSV
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="px-4 py-2 bg-[#111827] hover:bg-black text-white rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors shadow-sm"
        >
          Escolher Arquivo
        </button>

        {currentTotalRows > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs font-mono text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-200 font-bold">
              ✓ {currentTotalRows} registros carregados no sistema
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
