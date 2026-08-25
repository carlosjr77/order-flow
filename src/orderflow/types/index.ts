// Types for Order Flow Application

export type PerfilUsuario = 'admin' | 'operador';

export interface Usuario {
  id: number;
  username: string;
  email: string;
  nome?: string;
  is_active: boolean;
  perfil: PerfilUsuario;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  usuario: Usuario;
}

export interface Produto {
  id: number;
  codigo_interno: string;
  descricao: string;
  preco_custo: number;
  preco_venda: number | null;  // Pode ser null quando calculado pela margem
  margem_lucro?: number | null;  // Margem de lucro específica do produto (em decimal, ex: 1.0 = 100%)
  estoque_atual: number;
  unidade_medida: string;
  ncm?: string;
  vender_sem_estoque: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemCarrinho {
  produto_id: number;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  codigo_interno?: string;
  unidade_medida?: string;
  ncm?: string;
}

export interface ItemVenda {
  id: number;
  venda_id: number;
  produto_id: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  codigo_interno?: string;
  descricao?: string;
  unidade_medida?: string;
  ncm?: string;
}

export interface Venda {
  id: number;
  usuario_id?: number;
  usuario_nome?: string;
  data_venda: string;
  data_entrega?: string; // Data de entrega (pode ser passado ou futuro)
  data_vencimento?: string; // Data de vencimento do pedido (opcional)
  valor_total: number;
  valor_frete?: number;
  status: 'pendente' | 'concluído' | 'cancelado';
  forma_pagamento?: string;
  observacoes?: string;
  nome_cliente?: string;
  tabela_preco_id?: number | null;
  motivo_cancelamento?: string;
  itens?: ItemVenda[];
  created_at: string;
  updated_at: string;
}

export interface EstatisticasVendas {
  total_vendas: number;
  valor_total: number;
  ticket_medio: number;
  quantidade_itens: number;
}

export interface Cliente {
  id: number;
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  created_at: string;
  updated_at: string;
}

export interface DadosEmpresa {
  id?: number;
  nome: string;
  cnpj: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone?: string;
  email?: string;
  margem_lucro_padrao?: number | null;  // Margem padrão da empresa (1.0 = 100%)
}

export interface AuditLog {
  id: number;
  acao: string;
  entidade: string;
  entidade_id?: string;
  descricao?: string;
  ip_address?: string;
  user_id?: number;
  user_name?: string;
  created_at: string;
}

export interface CriarUsuarioData {
  username: string;
  email: string;
  nome?: string;
  password: string;
  perfil: PerfilUsuario;
}

export interface AtualizarUsuarioData {
  username?: string;
  email?: string;
  nome?: string;
  perfil?: PerfilUsuario;
  is_active?: boolean;
}

export interface TrocaSenhaData {
  senha_atual: string;
  nova_senha: string;
}

export interface TabelaPrecoItem {
  id: number;
  tabela_preco_id: number;
  produto_id: number;
  margem_especifica_percentual: number;
  preco_calculado?: number | null;
  codigo_interno?: string | null;
  descricao?: string | null;
  preco_custo?: number | null;
  created_at: string;
  updated_at: string;
}

export interface TabelaPreco {
  id: number;
  nome: string;
  descricao?: string | null;
  margem_geral_percentual: number;
  ativa: boolean;
  itens: TabelaPrecoItem[];
  created_at: string;
  updated_at: string;
}

export interface ItemComparativoSugestao {
  item_reconhecido: string;
  quantidade: number;
  unidade: string;
  preco_nota: number;
  produto_id?: number | null;
  produto_descricao?: string | null;
  precos_por_tabela: Record<string, number | null>;
  diferenca_valor?: number | null;
  diferenca_percentual?: number | null;
  aviso_unidade?: string | null;
}

export interface TabelaAnalisadaSugestao {
  id: number;
  nome: string;
  erro_percentual?: number | null;
  itens_comparados: number;
}

export interface SugestaoTabelaResponse {
  tabela_sugerida: { id: number; nome: string };
  motivo: string;
  tabelas_analisadas: TabelaAnalisadaSugestao[];
  comparativo: ItemComparativoSugestao[];
}
