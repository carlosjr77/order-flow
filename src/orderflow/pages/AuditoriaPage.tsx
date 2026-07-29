import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { AuditLog } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, RefreshCw } from 'lucide-react';

export const AuditoriaPage: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [acoes, setAcoes] = useState<string[]>([]);
  const [entidades, setEntidades] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filtros, setFiltros] = useState({
    acao: '',
    entidade: '',
    user_id: '',
    data_inicio: '',
    data_fim: '',
  });

  useEffect(() => {
    loadLogs();
    loadFiltrosOptions();
  }, []);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError('');
      const params: any = { limit: 500 };
      if (filtros.acao) params.acao = filtros.acao;
      if (filtros.entidade) params.entidade = filtros.entidade;
      if (filtros.user_id) params.user_id = parseInt(filtros.user_id);
      if (filtros.data_inicio) params.data_inicio = new Date(filtros.data_inicio).toISOString();
      if (filtros.data_fim) params.data_fim = new Date(filtros.data_fim).toISOString();

      const data = (await apiClient.listarLogs(params)) as AuditLog[];
      setLogs(data);
    } catch (error: any) {
      setError(error?.message || 'Erro ao carregar logs de auditoria');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiltrosOptions = async () => {
    try {
      const [acoesData, entidadesData] = await Promise.all([
        apiClient.listarAcoesAuditoria() as Promise<string[]>,
        apiClient.listarEntidadesAuditoria() as Promise<string[]>,
      ]);
      setAcoes(acoesData);
      setEntidades(entidadesData);
    } catch (error) {
      console.error('Erro ao carregar opções de filtro:', error);
    }
  };

  const handleFiltrar = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const handleLimparFiltros = () => {
    setFiltros({
      acao: '',
      entidade: '',
      user_id: '',
      data_inicio: '',
      data_fim: '',
    });
    setTimeout(loadLogs, 0);
  };

  const getAcaoColor = (acao: string) => {
    switch (acao.toLowerCase()) {
      case 'criar':
        return 'bg-green-100 text-green-800';
      case 'editar':
        return 'bg-blue-100 text-blue-800';
      case 'excluir':
      case 'cancelar':
      case 'desativar':
        return 'bg-red-100 text-red-800';
      case 'login':
      case 'logout':
        return 'bg-purple-100 text-purple-800';
      case 'trocar_senha':
      case 'resetar_senha':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Logs do Sistema</h1>
          </div>
          <Button onClick={loadLogs} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Filtros */}
        <Card className="mb-6 p-4">
          <form onSubmit={handleFiltrar} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ação</label>
              <select
                value={filtros.acao}
                onChange={(e) => setFiltros({ ...filtros, acao: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas</option>
                {acoes.map((acao) => (
                  <option key={acao} value={acao}>{acao}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Entidade</label>
              <select
                value={filtros.entidade}
                onChange={(e) => setFiltros({ ...filtros, entidade: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas</option>
                {entidades.map((entidade) => (
                  <option key={entidade} value={entidade}>{entidade}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ID do Usuário</label>
              <Input
                type="number"
                value={filtros.user_id}
                onChange={(e) => setFiltros({ ...filtros, user_id: e.target.value })}
                placeholder="Ex: 1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data Início</label>
              <Input
                type="datetime-local"
                value={filtros.data_inicio}
                onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                <Search className="w-4 h-4 mr-2" />
                Filtrar
              </Button>
              <Button type="button" variant="outline" onClick={handleLimparFiltros}>
                Limpar
              </Button>
            </div>
          </form>
        </Card>

        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">Carregando logs...</Card>
        ) : logs.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhum log encontrado</Card>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id} className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getAcaoColor(log.acao)}`}>
                          {log.acao}
                        </span>
                        <span className="text-sm text-gray-500">
                          Entidade: <span className="font-medium">{log.entidade}</span>
                          {log.entidade_id && ` #${log.entidade_id}`}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{log.descricao}</p>
                      {log.descricao && log.descricao.includes('Motivo:') && (
                        <p className="mt-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded inline-block">
                          {log.descricao.split('Motivo:')[1]?.trim()}
                        </p>
                      )}
                    </div>
                  <div className="text-right text-xs text-gray-500 md:min-w-[200px]">
                    <p>Usuário: {log.user_name || `ID ${log.user_id}`}</p>
                    {log.ip_address && <p>IP: {log.ip_address}</p>}
                    <p>{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
