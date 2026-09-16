const fs = require('fs');

// Fix auth.ts
let authCode = fs.readFileSync('src/lib/auth.ts', 'utf8');

const setCurrentUserFix = `
export function setCurrentUser(user: User | null) {
  try {
    if (!user) {
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem('currentUser');
      return;
    }
`;
authCode = authCode.replace(/export function setCurrentUser\(user: User \| null\) \{\n  try \{\n    if \(\!user\) \{\n      localStorage\.removeItem\(CURRENT_USER_KEY\);\n      return;\n    \}/, setCurrentUserFix.trim());

// Also let's export a logout function just in case
if (!authCode.includes('export function logoutUser')) {
  authCode += `\nexport function logoutUser() { setCurrentUser(null); window.location.reload(); }\n`;
}

fs.writeFileSync('src/lib/auth.ts', authCode);

// Fix ToolsHub.tsx
let toolsHubCode = fs.readFileSync('src/components/ToolsHub.tsx', 'utf8');
toolsHubCode = toolsHubCode.replace(/localStorage\.removeItem\('currentUser'\); window\.location\.reload\(\);/g, "import('../lib/auth').then(m => m.logoutUser());");
fs.writeFileSync('src/components/ToolsHub.tsx', toolsHubCode);

