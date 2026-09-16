const fs = require('fs');
let code = fs.readFileSync('src/lib/auth.ts', 'utf8');

// Fix signup logic
code = code.replace(/isApproved: false,/, 'isApproved: true,');
code = code.replace(/'Cadastro realizado! Aguarde aprovação de um Administrador\.'/g, "'Cadastro realizado com sucesso!'");

// Remove login block
const blockToRemove = `
      if (!user.isApproved) {
        return { success: false, message: 'Acesso pendente de aprovação por um Administrador.' };
      }
`;
code = code.replace(blockToRemove.trim(), '');

// Just to be safe, also replace any remaining variants of it:
code = code.replace(/if \(!user\.isApproved\) \{\s*return \{ success: false, message: 'Acesso pendente de aprovação por um Administrador\.' \};\s*\}/, '');

fs.writeFileSync('src/lib/auth.ts', code);
