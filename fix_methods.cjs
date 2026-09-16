const fs = require('fs');

let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const handleBipStart = code.indexOf('const handleBip =');
const handleBipEnd = code.indexOf('const handleToggleLock =') > -1 ? code.indexOf('const handleToggleLock =') : code.indexOf('const removeScan =');

const removeScanStart = code.indexOf('const removeScan =');
const removeScanEnd = code.indexOf('const clearScans =');

const handleBipReplacement = `
  const handleBip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim() || isLocked) return;
    
    const cleanInput = cleanTrackingId(bipInput);
    if (!cleanInput) {
      setBipInput('');
      return;
    }

    const key = codeKey(bipInput);
    const alreadyScanned = scanByCode.get(key);
    
    if (alreadyScanned) {
      setLastScanResult({ status: alreadyScanned.status === 'found' ? 'success' : 'error', message: 'O pacote já foi bipado anteriormente!' });
      setBipInput('');
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }

    const foundRow = rowByCode.get(key);
    
    setBipInput('');
    setTimeout(() => inputRef.current?.focus(), 10);
    
    await runOperation(async () => {
      const newScan: Omit<RefugoScan, 'firestoreId'> = {
        id: foundRow?.id || cleanInput,
        normalizedId: key,
        rota: foundRow?.rota || '',
        scannedAt: new Date().toLocaleString('pt-BR'),
        timestamp: Date.now(),
        status: foundRow ? 'found' : 'not_found',
        foundBy: currentUser?.username || 'Operador'
      };

      await addRefugoScan(newScan);

      if (foundRow) {
        setLastScanResult({ status: 'success', message: 'Pacote localizado!' });
        
        // Voice alert
        const isM = /M$/i.test(foundRow.id);
        const prefix = isM ? 'M ' : '';
        const utterance = \`\${prefix}\${foundRow.saida || 'Rota não encontrada'}\`;
        
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const message = new SpeechSynthesisUtterance(utterance);
          message.lang = 'pt-BR';
          message.rate = 1.2;
          window.speechSynthesis.speak(message);
        }
      } else {
        setLastScanResult({ status: 'error', message: \`Bipado: \${cleanInput}\` });
      }
      setPage(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    });
  };

  const removeScan = async (scan: RefugoScan) => {
    const targetId = scan.normalizedId || codeKey(scan.id);
    await runOperation(async () => {
      await deleteRefugoScan(targetId);
    });
  };
`;

code = code.substring(0, handleBipStart) + handleBipReplacement + code.substring(removeScanEnd);

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
