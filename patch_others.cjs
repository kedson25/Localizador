const fs = require('fs');

function patchFile(file, stateName, localStorageKey) {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  
  const searchStr = `const [${stateName}, set${stateName.charAt(0).toUpperCase() + stateName.slice(1)}] = useState<string>('');`;
  const replaceStr = `const [${stateName}, set${stateName.charAt(0).toUpperCase() + stateName.slice(1)}] = useState<string>(() => {
    return localStorage.getItem('${localStorageKey}') || '';
  });

  useEffect(() => {
    localStorage.setItem('${localStorageKey}', ${stateName});
  }, [${stateName}]);`;
  
  if (code.includes(searchStr)) {
    code = code.replace(searchStr, replaceStr);
    fs.writeFileSync(file, code);
    console.log('Patched ' + file);
  }
}

patchFile('src/components/IdRemover.tsx', 'removeText', 'app_idremover_input');
patchFile('src/components/WhatsappReport.tsx', 'inputText', 'app_whatsapp_input');
