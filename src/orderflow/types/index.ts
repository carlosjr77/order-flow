// Types for Order Flow Application

export interface Usuario {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
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
  preco_venda: number;
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
  data_venda: string;
  valor_total: number;
  valor_frete?: number;
  status: 'pendente' | 'concluído' | 'cancelado';
  forma_pagamento?: string;
  observacoes?: string;
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

export interface DadosEmpresa {
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
}
