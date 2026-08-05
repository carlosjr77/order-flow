import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { AuditLog } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, RefreshCw, Plus, Pencil, Trash2, XCircle, CheckCircle, LogIn, LogOut, Key, UserCog, FileText, AlertCircle } from 'lucide-react';

const acaoConfig: Record<string, { icon: React.ReactNode; label: string; color: string; border: string }> = {
  criar: { icon: <Plus className="w-3.5 h-3.5" />, label: 'Criar', color: 'bg-green-100 text-green-800 border-green-200', border: 'border-l-green-500' },
  editar: { icon: <Pencil className="w-3.5 h-3.5" />, label: 'Editar', color: 'bg-blue-100 text-blue-800 border-blue-200', border: 'border-l-blue-500' },
  excluir: { icon: <Trash2 className="w-3.5 h-3.5" />, label: 'Excluir', color: 'bg-red-100 text-red-800 border-red-200', border: 'border-l-red-500' },
  cancelar: { icon: <XCircle className="w-3.5 h-3.5" />, label: 'Cancelar', color: 'bg-red-100 text-red-800 border-red-200', border: 'border-l-red-500' },
  concluir: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Concluir', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', border: 'border-l-emerald-500' },
  login: { icon: <LogIn className="w-3.5 h-3.5" />, label: 'Login', color: 'bg-purple-100 text-purple-800 border-purple-200', border: 'border-l-purple-500' },
  logout: { icon: <LogOut className="w-3.5 h-3.5" />, label: 'Logout', color: 'bg-purple-100 text-purple-800 border-purple-200', border: 'border-l-purple-500' },
  trocar_senha: { icon: <Key className="w-3.5 h-3.5" />, label: 'Trocar Senha', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', border: 'border-l-yellow-500' },
  resetar_senha: { icon: <Key className="w-3.5 h-3.5" />, label: 'Resetar Senha', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', border: 'border-l-yellow-500' },
};

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

  const getAcaoConfig = (acao: string) => {
    return acaoConfig[acao.toLowerCase()] || {
      icon: <FileText className="w-3.5 h-3.5" />,
      label: acao,
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      border: 'border-l-gray-500',
    };
  };

  const formatarDataHora = (data: string) => {
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderizarDescricao = (log: AuditLog) => {
    if (!log.descricao) return null;

    // Se for edição de venda, renderizar com formatação especial
    if (log.acao.toLowerCase() === 'editar' && log.entidade.toLowerCase() === 'venda') {
      const linhas = log.descricao.split('\n');
      return (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
          {linhas.map((linha, index) => {
            const trimmed = linha.trim();
            if (!trimmed) return null;

            // Linhas de separação
            if (trimmed.startsWith('=')) {
              return <div key={index} className="my-2 border-t-2 border-slate-300" />;
            }

            // Título principal
            if (trimmed.startsWith('EDIÇÃO DA VENDA')) {
              return (
                <h3 key={index} className="text-base font-bold text-slate-800 mb-2">
                  {trimmed}
                </h3>
              );
            }

            // Seções
            if (trimmed.startsWith('📋') || trimmed.startsWith('➕') || trimmed.startsWith('➖') || trimmed.startsWith('✏️')) {
              return (
                <h4 key={index} className="text-sm font-bold text-slate-700 mt-3 mb-2 uppercase tracking-wide">
                  {trimmed}
                </h4>
              );
            }

            // Itens com bullet
            if (trimmed.startsWith('•')) {
              return (
                <div key={index} className="ml-2 text-sm text-slate-800 font-medium mt-1">
                  {trimmed}
                </div>
              );
            }

            // Subitens indentados
            if (trimmed.startsWith('De:') || trimmed.startsWith('Para:') || trimmed.startsWith('-') || trimmed.startsWith('Qtd:')) {
              return (
                <div key={index} className="ml-6 text-sm text-slate-600">
                  {trimmed.startsWith('De:') && <span className="text-red-600 font-medium">{trimmed}</span>}
                  {trimmed.startsWith('Para:') && <span className="text-green-600 font-medium">{trimmed}</span>}
                  {trimmed.startsWith('-') && <span>{trimmed}</span>}
                  {trimmed.startsWith('Qtd:') && <span>{trimmed}</span>}
                </div>
              );
            }

            // Resumo final
            if (trimmed.startsWith('Valor Total Atualizado')) {
              return (
                <div key={index} className="mt-3 text-sm font-bold text-slate-800 bg-blue-50 px-3 py-2 rounded inline-block">
                  {trimmed}
                </div>
              );
            }

            return (
              <div key={index} className="text-sm text-slate-600">
                {trimmed}
              </div>
            );
          })}
        </div>
      );
    }

    // Para outros logs, manter texto simples mas formatar motivos
    return (
      <div className="mt-1 text-sm text-slate-700 leading-relaxed">
        {log.descricao.split('\n').map((linha, index) => {
          const trimmed = linha.trim();
          if (!trimmed) return null;
          return <p key={index}>{trimmed}</p>;
        })}
      </div>
    );
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
          <div className="space-y-4">
            {logs.map((log) => {
              const acaoCfg = getAcaoConfig(log.acao);
              return (
                <Card key={log.id} className={`p-0 overflow-hidden border-l-4 ${acaoCfg.border}`}>
                  {/* Cabeçalho do log */}
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${acaoCfg.color}`}>
                          {acaoCfg.icon}
                          {acaoCfg.label}
                        </span>
                        <span className="text-sm text-slate-600">
                          Entidade: <span className="font-semibold text-slate-800">{log.entidade}</span>
                          {log.entidade_id && (
                            <span className="ml-1 text-slate-500">#{log.entidade_id}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <UserCog className="w-3.5 h-3.5" />
                          <span>{log.user_name || `ID ${log.user_id}`}</span>
                        </div>
                        {log.ip_address && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{log.ip_address}</span>
                          </div>
                        )}
                        <div className="font-medium text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                          {formatarDataHora(log.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo do log */}
                  <div className="px-5 py-4">
                    {renderizarDescricao(log)}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
