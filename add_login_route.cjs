const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `{/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />`;

const newRoutes = `{/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={() => { setIsAuthenticated(true); localStorage.setItem('auth', 'true'); navigate('/'); }} />
            } />`;

if (code.includes(target)) {
  code = code.replace(target, newRoutes);
  fs.writeFileSync(file, code);
  console.log('Added login route');
} else {
  console.log('Target not found!');
}
