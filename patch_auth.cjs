const fs = require('fs');
const file = 'src/lib/auth.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the isFirstUser logic with strictly false for isAdmin and isApproved
const oldLogic = `    // If it's the very first user in the database, make them Admin and Approved automatically
    const allUsersSnap = await getDocs(usersRef);
    const isFirstUser = allUsersSnap.empty;

    const newUser: User = {
      id: newDocRef.id,
      username,
      email,
      password,
      isAdmin: isFirstUser,
      isApproved: isFirstUser,
      allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload']
    };`;

const newLogic = `    const newUser: User = {
      id: newDocRef.id,
      username,
      email,
      password,
      isAdmin: false,
      isApproved: false,
      allowedGroups: ['consulta', 'remover', 'reporte', 'listas', 'upload']
    };`;

if (code.includes('isAdmin: isFirstUser')) {
  code = code.replace(oldLogic, newLogic);
  fs.writeFileSync(file, code);
  console.log('auth.ts updated to create normal users by default');
} else {
  console.log('Target logic not found in auth.ts');
}
