const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// import getCurrentUser if not imported
if (!code.includes('getCurrentUser')) {
  code = code.replace(/import \{ User \} from '\.\/lib\/auth';/, "import { User, getCurrentUser } from './lib/auth';");
}

code = code.replace(/<Login onLogin=\{\(user\) => \{ setCurrentUser\(user\); localStorage\.setItem\('currentUser', JSON\.stringify\(user\)\); navigate\('\/'\); \}\} \/>/, `<Login onLogin={(user) => { setCurrentUser(user); navigate('/'); }} />`);

fs.writeFileSync('src/App.tsx', code);
