const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `  if (location.pathname === '/login' && !isAuthenticated) {
    return <Login onLogin={() => { setIsAuthenticated(true); localStorage.setItem('auth', 'true'); navigate('/'); }} />;
  }`;

if (code.includes(target)) {
  code = code.replace(target, '');
  fs.writeFileSync(file, code);
  console.log('Removed early return');
} else {
  console.log('Early return not found!');
}
