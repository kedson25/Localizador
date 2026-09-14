import { z } from 'zod';

export const BipRequestSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  codigo: z.string().min(1, 'codigo é obrigatório'),
  saida: z.string().optional(),
  motivo: z.string().optional(),
  rota: z.string().optional(),
  responsavel: z.string().optional(),
  grupoId: z.string().optional(),
});

export type BipRequest = z.infer<typeof BipRequestSchema>;

export const UpdateItemSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  itemId: z.string().min(1, 'itemId ou codigo é obrigatório'),
  changes: z
    .object({
      motivo: z.string().optional(),
      saida: z.string().optional(),
      rota: z.string().optional(),
      validado: z.boolean().optional(),
      responsavel: z.string().optional(),
      grupoId: z.string().optional().nullable(),
    })
    .strict(),
});

export type UpdateItemRequest = z.infer<typeof UpdateItemSchema>;

export const DeleteItemSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  itemId: z.string().min(1, 'itemId é obrigatório'),
});

export const BatchItemSchema = z.object({
  codigo: z.string().min(1, 'Código é obrigatório'),
  rota: z.string().optional(),
  saida: z.string().optional(),
  motivo: z.string().optional(),
  responsavel: z.string().optional(),
  grupoId: z.string().optional(),
  validado: z.boolean().optional(),
  scannedAt: z.string().optional(),
});

export const BatchImportSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  items: z.array(BatchItemSchema).min(1, 'Lote deve conter pelo menos 1 item'),
  overwrite: z.boolean().optional().default(false),
});

export type BatchImportRequest = z.infer<typeof BatchImportSchema>;

export const QueryItemsSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  cursor: z.string().optional(),
  direction: z.enum(['next', 'prev']).optional().default('next'),
  saida: z.string().optional(),
  motivo: z.string().optional(),
  validado: z.enum(['true', 'false']).optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const SearchItemsSchema = z.object({
  listaId: z.string().min(1, 'listaId é obrigatório'),
  q: z.string().min(1, 'Termo de pesquisa obrigatório'),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
});

export const SaveListaMetaSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(1, 'Nome da lista é obrigatório'),
  tipo: z.enum(['comum', 'grupos']).optional().default('comum'),
  rota: z.string().optional().default('Brancas'),
  data: z.string().optional(),
  saidaPadrao: z.string().optional().default('Ciclo 2 - Saída PM'),
  motivoPadrao: z.string().optional().default('Pendente'),
  responsavel: z.string().optional().default('Operador'),
  status: z.enum(['em_andamento', 'finalizada']).optional().default('em_andamento'),
  grupos: z.array(z.any()).optional(),
  grupoAtivoId: z.string().optional(),
  porcentagemAcerto: z.number().optional(),
  fechamentoGaiola: z.string().optional(),
  itensFaltaram: z.number().optional(),
});

export const SignupSchema = z.object({
  username: z.string().min(3, 'Username deve ter pelo menos 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(4, 'Senha deve ter pelo menos 4 caracteres'),
});

export const LoginSchema = z.object({
  emailOrUsername: z.string().min(1, 'Email ou username obrigatório'),
  password: z.string().min(1, 'Senha obrigatória'),
});
