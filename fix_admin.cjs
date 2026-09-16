const fs = require('fs');

let code = fs.readFileSync('src/lib/auth.ts', 'utf8');

const targetStr = `
export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
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

code = code.replace(/export function getCurrentUser\(\)[\s\S]*?return null;\n  \}\n\}/, targetStr.trim());

const loginTarget = `
    if (!snap.empty) {
      const user = snap.docs[0].data() as User;
      delete user.password;
      
      // Auto-approve and Auto-admin for the master account
      if (user.email === 'matheuslite0333@gmail.com' || user.username === 'matheuslite') {
         user.isApproved = true;
         user.isAdmin = true;
         // Try to update it in the database
         try {
           updateDoc(snap.docs[0].ref, { isApproved: true, isAdmin: true }).catch(() => {});
         } catch(e) {}
      }

      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }

      setCurrentUser(user);
      return { success: true, user };
    }
`;

code = code.replace(/if \(\!snap\.empty\) \{[\s\S]*?return \{ success: true, user \};\n    \}/, loginTarget.trim());

fs.writeFileSync('src/lib/auth.ts', code);
