const fs = require('fs');
let code = fs.readFileSync('src/lib/auth.ts', 'utf8');

const newGetCurrentUser = `
export function getCurrentUser(): User | null {
  try {
    let raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) {
      raw = localStorage.getItem('currentUser');
    }
    if (!raw) return null;
    const u = JSON.parse(raw);
    delete u.password;
    if (u.email === 'matheuslite0333@gmail.com' || u.username === 'matheuslite') {
       u.isAdmin = true;
       u.isApproved = true;
    }
    return u;
  } catch {
    return null;
  }
}
`;

code = code.replace(/export function getCurrentUser\(\): User \| null \{[\s\S]*?catch \{\n    return null;\n  \}\n\}/, newGetCurrentUser.trim());

fs.writeFileSync('src/lib/auth.ts', code);
