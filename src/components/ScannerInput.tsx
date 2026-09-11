import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Barcode } from 'lucide-react';

export function normalizeScannedCode(value: string): string {
  const normalized = value.trim().replace(/d[çc]?⁴/gi, '4').replace(/d[çc]?4/gi, '4')
    .replace(/^[^0-9a-zA-Z]+/, '');
  return (normalized.match(/(47\d+)/)?.[1] || normalized.replace(/m$/i, '')).toUpperCase();
}

interface ScannerInputProps {
  disabled: boolean;
  onScan: (code: string) => void;
}

// Keyboard events update only this small subtree. Network work never controls it.
export const ScannerInput = React.memo(forwardRef<HTMLInputElement, ScannerInputProps>(function ScannerInput({ disabled, onScan }, forwardedRef) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useImperativeHandle(forwardedRef, () => input.current!, []);
  useEffect(() => {
    if (!disabled) input.current?.focus();
    return () => clearTimeout(focusTimer.current);
  }, [disabled]);

  return (
    <form onSubmit={event => {
      event.preventDefault();
      const code = normalizeScannedCode(input.current?.value || '');
      if (disabled || !code) return;
      if (input.current) input.current.value = '';
      setValue('');
      onScan(code);
    }} className="mt-3">
      <div className="relative flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Barcode className={`h-5 w-5 ${disabled ? 'text-gray-300' : 'text-[#3483FA]'}`} />
        </div>
        <input ref={input} type="text" value={value} onChange={event => setValue(event.target.value)}
          onBlur={event => {
            clearTimeout(focusTimer.current);
            if (!disabled && !event.relatedTarget) {
              focusTimer.current = setTimeout(() => {
                if (document.activeElement === document.body) input.current?.focus();
              }, 150);
            }
          }} disabled={disabled}
          className={`block w-full pl-11 pr-3 py-2.5 border rounded-xl text-lg font-mono font-bold transition-all ${disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'border-[#3483FA]/40 focus:ring-2 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-400'}`}
          placeholder="ID do pacote..." autoFocus />
      </div>
      <button type="submit" disabled={disabled || !value.trim()}
        className="w-full mt-2 py-2.5 bg-[#3483FA] hover:bg-blue-600 disabled:bg-gray-200 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm">
        Registrar Bip
      </button>
    </form>
  );
}));
