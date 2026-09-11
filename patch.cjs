const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldArray = `  const backlogTools = [
    {
      id: 'lookup',
      path: '/consulta',
      name: 'Buscar grupos',
      tag: 'Busca em Massa',
      description: 'Cruze uma lista de pacotes com a base CSV para identificar motivos, saídas, ciclos e agrupar ocorrências automaticamente.',
      icon: Search,
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      id: 'remove',
      path: '/remover',
      name: 'Remover IDs',
      tag: 'Expurgo & Filtro',
      description: 'Subtraia pacotes já resolvidos ou divergências da base ativa. Exporte a nova lista filtrada ou copie apenas os IDs restantes.',
      icon: Trash2,
      iconColor: 'text-red-600',
      badgeBg: 'bg-red-50 text-red-700 border-red-200',
    },
    {
      id: 'report',
      path: '/reporte',
      name: 'Reporte WhatsApp',
      tag: 'Comunicação',
      description: 'Gere relatórios textuais formatados por motorista e substatus, ideais para envio rápido em grupos de acompanhamento.',
      icon: MessageSquare,
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      id: 'listas',
      path: '/listas',
      name: 'Listas de Coleta',
      tag: 'Organização & Controle',
      description: 'Configure e gerencie listas de coletas de IDs vinculadas a datas específicas e ciclos operacionais.',
      icon: ListTodo,
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    }
  ];`;

const newArray = `  const backlogTools = [
    {
      id: 'listas',
      path: '/listas',
      name: 'Listas de Coleta',
      tag: 'Organização & Controle',
      description: 'Configure e gerencie listas de coletas de IDs vinculadas a datas específicas e ciclos operacionais.',
      icon: ListTodo,
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      id: 'lookup',
      path: '/consulta',
      name: 'Buscar grupos',
      tag: 'Busca em Massa',
      description: 'Cruze uma lista de pacotes com a base CSV para identificar motivos, saídas, ciclos e agrupar ocorrências automaticamente.',
      icon: Search,
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      id: 'remove',
      path: '/remover',
      name: 'Remover IDs',
      tag: 'Expurgo & Filtro',
      description: 'Subtraia pacotes já resolvidos ou divergências da base ativa. Exporte a nova lista filtrada ou copie apenas os IDs restantes.',
      icon: Trash2,
      iconColor: 'text-red-600',
      badgeBg: 'bg-red-50 text-red-700 border-red-200',
    },
    {
      id: 'report',
      path: '/reporte',
      name: 'Reporte WhatsApp',
      tag: 'Comunicação',
      description: 'Gere relatórios textuais formatados por motorista e substatus, ideais para envio rápido em grupos de acompanhamento.',
      icon: MessageSquare,
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
  ];`;

if (code.includes(oldArray)) {
  code = code.replace(oldArray, newArray);
  fs.writeFileSync(file, code);
  console.log('Success Reordering ToolsHub array');
} else {
  console.log('Target not found in ToolsHub');
}
