const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// import getCurrentUser if not imported
if (!code.includes('getCurrentUser')) {
  code = code.replace(/import \{ User \} from '\.\/lib\/auth';/, "import { User, getCurrentUser } from './lib/auth';");
}

code = code.replace(/const \[currentUser, setCurrentUser\] = useState<User \| null>\(\(\) => \{\n    try \{ return JSON.parse\(localStorage\.getItem\('currentUser'\) \|\| 'null'\); \} catch \{ return null; \}\n  \}\);/, `const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser());`);

fs.writeFileSync('src/App.tsx', code);
