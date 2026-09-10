const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    {
      id: 'report',
      path: '/reporte',
      name: 'Reporte WhatsApp',
      tag: 'Comunicação',
      description: 'Gere relatórios textuais formatados por motorista e substatus, ideais para envio rápido em grupos de acompanhamento.',
      icon: MessageSquare,
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }`;

const newTool = `,
    {
      id: 'listas',
      path: '/listas',
      name: 'Listas de Coleta',
      tag: 'Organização & Controle',
      description: 'Configure e gerencie listas de coletas de IDs vinculadas a datas específicas e ciclos operacionais.',
      icon: ListTodo,
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    }`;

if (code.includes(target)) {
  code = code.replace(target, target + newTool);
  fs.writeFileSync(file, code);
  console.log('Success');
} else {
  console.log('Target not found');
}
