const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

// Adicionar onPaste ao bipInput
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

code = code.replace(
  'onChange={(e) => setBipInput(e.target.value)}',
  'onChange={(e) => setBipInput(e.target.value)}' + onPasteCode
);

// Corrigir id gerado no Modo Individual (handleBip)
code = code.replace(
  'id: Date.now().toString(),',
  'id: Date.now().toString() + Math.random().toString(36).substring(2, 9),'
);

// Salvar modoIndividual no localStorage para que nao se perca em refresh
// Procurar o useEffect que carrega
const useEffectCode = `
  // Salvar modo individual no localStorage
  useEffect(() => {
    if (modoIndividual) {
      localStorage.setItem('app_modo_individual_ativo', 'true');
      localStorage.setItem('app_itens_modo_individual', JSON.stringify(itensModoIndividual));
    } else {
      localStorage.removeItem('app_modo_individual_ativo');
      localStorage.removeItem('app_itens_modo_individual');
    }
  }, [modoIndividual, itensModoIndividual]);

  // Carregar modo individual do localStorage
  useEffect(() => {
    const isAtivo = localStorage.getItem('app_modo_individual_ativo');
    if (isAtivo === 'true') {
      setModoIndividual(true);
      const savedItens = localStorage.getItem('app_itens_modo_individual');
      if (savedItens) {
        try {
          setItensModoIndividual(JSON.parse(savedItens));
        } catch (e) { }
      }
    }
  }, []);
`;

// Insert after state declarations
code = code.replace(
  'const [itensModoIndividual, setItensModoIndividual] = useState<ColetaItem[]>([]);',
  'const [itensModoIndividual, setItensModoIndividual] = useState<ColetaItem[]>([]);\n' + useEffectCode
);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
