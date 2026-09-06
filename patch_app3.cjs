const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

// Insert early return for Login
const targetHook = `  const showNotification = (msg: string) => {`;
if (code.includes(targetHook) && !code.includes("if (location.pathname === '/login' && !isAuthenticated)")) {
  const earlyReturn = `
  if (location.pathname === '/login' && !isAuthenticated) {
    return <Login onLogin={() => { setIsAuthenticated(true); localStorage.setItem('auth', 'true'); navigate('/'); }} />;
  }
`;
  code = code.replace(targetHook, earlyReturn + '\n' + targetHook);
}

fs.writeFileSync(file, code);
