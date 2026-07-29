import { CriarUsuarioData, AtualizarUsuarioData, TrocaSenhaData } from '../types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class APIClient {
  private baseURL: string;
  private token: string | null;

  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('access_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('access_token', token);
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('access_token');
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        window.location.href = '/login';
      }
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    // Retornar null para 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  // Auth endpoints
  async login(username: string, password: string) {
    return this.request('/api/auth/login', 'POST', { username, password });
  }

  async register(username: string, email: string, password: string) {
    return this.request('/api/auth/register', 'POST', { username, email, password });
  }

  async getMe() {
    return this.request('/api/auth/me', 'GET');
  }

  async trocarSenha(senhaAtual: string, novaSenha: string) {
    return this.request('/api/auth/trocar-senha', 'POST', {
      senha_atual: senhaAtual,
      nova_senha: novaSenha,
    });
  }

  async logout() {
    return this.request('/api/auth/logout', 'POST');
  }

  // Produtos endpoints
  async listarProdutos(skip = 0, limit = 100, busca?: string) {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (busca) params.append('busca', busca);
    return this.request(`/api/produtos?${params}`, 'GET');
  }

  async obterProduto(id: number) {
    return this.request(`/api/produtos/${id}`, 'GET');
  }

  async criarProduto(data: any) {
    return this.request('/api/produtos', 'POST', data);
  }

  async atualizarProduto(id: number, data: any) {
    return this.request(`/api/produtos/${id}`, 'PUT', data);
  }

  async deletarProduto(id: number) {
    return this.request(`/api/produtos/${id}`, 'DELETE');
  }

  async adicionarEstoque(id: number, quantidade: number) {
    return this.request(`/api/produtos/${id}/estoque/adicionar?quantidade=${quantidade}`, 'PUT');
  }

  async removerEstoque(id: number, quantidade: number) {
    return this.request(`/api/produtos/${id}/estoque/remover?quantidade=${quantidade}`, 'PUT');
  }

  // Vendas endpoints
  async listarVendas(skip = 0, limit = 100, status?: string) {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (status) params.append('status_filter', status);
    return this.request(`/api/vendas?${params}`, 'GET');
  }

  async obterVenda(id: number) {
    return this.request(`/api/vendas/${id}`, 'GET');
  }

  async criarVenda(data: any) {
    return this.request('/api/vendas', 'POST', data);
  }

  async concluirVenda(id: number) {
    return this.request(`/api/vendas/${id}/concluir`, 'PUT');
  }

  async cancelarVenda(id: number) {
    return this.request(`/api/vendas/${id}/cancelar`, 'PUT');
  }

  async excluirVenda(id: number) {
    return this.request(`/api/vendas/${id}`, 'DELETE');
  }

  // Empresas endpoints
  async listarEmpresas(skip = 0, limit = 100) {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    return this.request(`/api/empresas?${params}`, 'GET');
  }

  async obterDadosEmpresa() {
    return this.request('/api/empresas/dados', 'GET');
  }

  async obterEmpresa(id: number) {
    return this.request(`/api/empresas/${id}`, 'GET');
  }

  async criarEmpresa(data: any) {
    return this.request('/api/empresas', 'POST', data);
  }

  async atualizarEmpresa(id: number, data: any) {
    return this.request(`/api/empresas/${id}`, 'PUT', data);
  }

  async deletarEmpresa(id: number) {
    return this.request(`/api/empresas/${id}`, 'DELETE');
  }

  // Clientes endpoints
  async listarClientes(skip = 0, limit = 100, busca?: string) {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (busca) params.append('busca', busca);
    return this.request(`/api/clientes?${params}`, 'GET');
  }

  async obterCliente(id: number) {
    return this.request(`/api/clientes/${id}`, 'GET');
  }

  async criarCliente(data: any) {
    return this.request('/api/clientes', 'POST', data);
  }

  async atualizarCliente(id: number, data: any) {
    return this.request(`/api/clientes/${id}`, 'PUT', data);
  }

  async deletarCliente(id: number) {
    return this.request(`/api/clientes/${id}`, 'DELETE');
  }

  // Usuários endpoints (apenas admin)
  async listarUsuarios(skip = 0, limit = 100) {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    return this.request(`/api/usuarios?${params}`, 'GET');
  }

  async obterUsuario(id: number) {
    return this.request(`/api/usuarios/${id}`, 'GET');
  }

  async criarUsuario(data: CriarUsuarioData) {
    return this.request('/api/usuarios', 'POST', data);
  }

  async atualizarUsuario(id: number, data: AtualizarUsuarioData) {
    return this.request(`/api/usuarios/${id}`, 'PUT', data);
  }

  async deletarUsuario(id: number) {
    return this.request(`/api/usuarios/${id}`, 'DELETE');
  }

  async resetarSenhaUsuario(id: number, novaSenha: string) {
    return this.request(`/api/usuarios/${id}/resetar-senha`, 'POST', { nova_senha: novaSenha });
  }

  async reativarUsuario(id: number) {
    return this.request(`/api/usuarios/${id}/reativar`, 'POST');
  }

  async listarPerfis() {
    return this.request('/api/usuarios/perfil/opcoes', 'GET');
  }

  // Auditoria endpoints (apenas admin)
  async listarLogs(params?: {
    skip?: number;
    limit?: number;
    acao?: string;
    entidade?: string;
    user_id?: number;
    data_inicio?: string;
    data_fim?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params?.acao) queryParams.append('acao', params.acao);
    if (params?.entidade) queryParams.append('entidade', params.entidade);
    if (params?.user_id !== undefined) queryParams.append('user_id', params.user_id.toString());
    if (params?.data_inicio) queryParams.append('data_inicio', params.data_inicio);
    if (params?.data_fim) queryParams.append('data_fim', params.data_fim);
    return this.request(`/api/audit?${queryParams}`, 'GET');
  }

  async listarAcoesAuditoria() {
    return this.request('/api/audit/acoes', 'GET');
  }

  async listarEntidadesAuditoria() {
    return this.request('/api/audit/entidades', 'GET');
  }

  async estatisticasAuditoria() {
    return this.request('/api/audit/estatisticas', 'GET');
  }
}

export const apiClient = new APIClient();
