const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

// The string we previously replaced:
const onPasteCode = `
                  onPaste={(e) => {
                    const pastedData = e.clipboardData.getData('text');
                    if (pastedData && (pastedData.includes('\\n') || pastedData.includes(','))) {
                      e.preventDefault();
                      setLoteText(pastedData);
                      setShowModalLote(true);
                    }
                  }}
`;

const betterOnPaste = `
                  onPaste={async (e) => {
                    const pastedData = e.clipboardData.getData('text');
                    if (pastedData && (pastedData.includes('\\n') || pastedData.includes(','))) {
                      e.preventDefault();
                      // Pega os codigos
                      const rawCodigos = pastedData.split(/[\\n,;\\t]+/).map(s => s.trim()).filter(Boolean);
                      const cleanCodigos = validateAndCleanIds(rawCodigos);
                      if (cleanCodigos.length > 0) {
                         // Mostra o modal de Verificação em Lote para agilizar!
                         setVerificarLoteText(cleanCodigos.join('\\n'));
                         setShowVerificarLoteModal(true);
                      }
                    }
                  }}
`;

code = code.replace(onPasteCode, betterOnPaste);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
