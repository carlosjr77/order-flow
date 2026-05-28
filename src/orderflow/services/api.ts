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
      throw new Error(`API Error: ${response.statusText}`);
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
}

export const apiClient = new APIClient();
