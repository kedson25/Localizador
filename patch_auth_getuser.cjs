const fs = require('fs');
const file = 'src/lib/auth.ts';
let code = fs.readFileSync(file, 'utf8');

const getUserFunc = `
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as User;
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}
`;

if (!code.includes('getUserById')) {
  code += getUserFunc;
  fs.writeFileSync(file, code);
  console.log('Added getUserById to auth.ts');
}
