const fs = require('fs');
let code = fs.readFileSync('src/components/IdLookup.tsx', 'utf8');
code = code.replace("const [inputText, setInputText] = useState<string>('');", 
`const [inputText, setInputText] = useState<string>(() => {
    return localStorage.getItem('app_idlookup_input') || '';
  });

  useEffect(() => {
    localStorage.setItem('app_idlookup_input', inputText);
  }, [inputText]);`);
fs.writeFileSync('src/components/IdLookup.tsx', code);
