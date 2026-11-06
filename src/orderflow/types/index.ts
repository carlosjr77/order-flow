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
  cest?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  aliquota_icms?: number | null;
  aliquota_pis?: number | null;
  aliquota_cofins?: number | null;
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
  cliente_id?: number | null;
  motivo_cancelamento?: string;
  itens?: ItemVenda[];
  valor_pago?: number | null;
  saldo?: number | null;
  status_financeiro?: StatusFinanceiro | null;
  created_at: string;
  updated_at: string;
}

export type StatusFinanceiro = 'aberto' | 'parcial' | 'liquidada';
export type OrigemRecebimento = 'avulso' | 'conclusao' | 'migracao';
export type TipoDataFiltro = 'emissao' | 'vencimento';

export interface TituloFinanceiro {
  venda_id: number;
  numero_nfe: number | null;
  descricao: string;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_documento: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  valor_original: number;
  valor_pago: number;
  saldo: number;
  status_financeiro: StatusFinanceiro;
}

export interface FiltrosTitulos {
  busca?: string;
  cliente_id?: number;
  status?: StatusFinanceiro;
  tipo_data?: TipoDataFiltro;
  data_inicio?: string;
  data_fim?: string;
  pagina?: number;
  limite?: number;
}

export interface FiltrosVendas {
  busca?: string;
  cliente_id?: number;
  status_financeiro?: StatusFinanceiro;
  tipo_data?: TipoDataFiltro;
  data_inicio?: string;
  data_fim?: string;
}

export interface ClienteResolvido {
  id: number;
  nome: string;
  criado: boolean;
}

export interface PaginaTitulos {
  itens: TituloFinanceiro[];
  total: number;
  pagina: number;
  limite: number;
  totais: { valor_original: number; valor_pago: number; saldo: number };
}

export interface AlocacaoRecebimento {
  venda_id: number;
  valor: number;
}

export interface RecebimentoFinanceiro {
  id: number;
  cliente_id: number | null;
  data_pagamento: string;
  forma_pagamento: string;
  valor_total: number;
  origem: OrigemRecebimento;
  observacoes: string | null;
  valor_disponivel: number;
  alocacoes: AlocacaoRecebimento[];
  estornado_em: string | null;
  motivo_estorno: string | null;
}

export interface TituloExtrato {
  venda_id: number;
  numero_nfe: number | null;
  descricao: string;
  data_emissao: string | null;
  data_vencimento: string | null;
  valor_original: number;
  valor_pago: number;
  saldo: number;
  status_financeiro: StatusFinanceiro;
}

export interface RelatorioCliente {
  cliente: { id: number; nome: string; documento: string | null; telefone: string | null };
  periodo: { data_inicio: string; data_fim: string; tipo_data: TipoDataFiltro };
  resumo: { quantidade: number; valor_total: number; valor_pago: number; saldo_pendente: number };
  titulos: TituloExtrato[];
  gerado_em: string;
}

export interface ExtratoCliente {
  cliente: { id: number; nome: string; documento: string | null; telefone: string | null };
  resumo: {
    total_bruto: number;
    total_em_aberto: number;
    total_recebido: number;
    total_recebido_avulso: number;
    credito_disponivel: number;
    saldo_liquido: number;
  };
  titulos: TituloExtrato[];
  recebimentos: RecebimentoFinanceiro[];
  gerado_em: string;
}

export interface NovoRecebimento {
  cliente_id: number;
  data_pagamento: string;
  forma_pagamento: string;
  valor_total: string;
  observacoes?: string | null;
  alocacoes: Array<{ venda_id: number; valor: string }>;
}

export interface VendaSemCliente {
  venda_id: number;
  nome_cliente: string | null;
  data_emissao: string | null;
  valor_total: number;
  status: string;
}

export interface PaginaVendasSemCliente {
  itens: VendaSemCliente[];
  total: number;
  pagina: number;
  limite: number;
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
  inscricao_estadual?: string | null;
  regime_tributario?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | null;
  cfop_dentro_estado?: string | null;
  cfop_fora_estado?: string | null;
  csosn_padrao?: string | null;
  aliquota_icms?: number | null;
  aliquota_pis?: number | null;
  aliquota_cofins?: number | null;
  serie_nfe?: number | null;
  numero_nfe?: number | null;
  ambiente_nfe?: 'homologacao' | 'producao' | null;
  emissao_nfe_habilitada?: boolean;
  codigo_municipio_ibge?: string | null;
  codigo_pais?: string | null;
  chave_pix?: string | null;
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
