import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { TabelaPreco, TabelaPrecoItem, Produto } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Edit2, Trash2, Search, X, Tag } from 'lucide-react';

type ExcecaoForm = {
  produto_id: number;
  codigo_interno: string;
  descricao: string;
  preco_custo: number;
  margem_especifica_percentual: number;
};

export const TabelasPrecoPage: React.FC = () => {
  const navigate = useNavigate();
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [margemGeral, setMargemGeral] = useState('0');
  const [ativa, setAtiva] = useState(true);
  const [excecoes, setExcecoes] = useState<ExcecaoForm[]>([]);
  const [filtroExcecoes, setFiltroExcecoes] = useState('');

  // Busca de produtos para adicionar exceção
  const [buscaProduto, setBuscaProduto] = useState('');
  const [produtosEncontrados, setProdutosEncontrados] = useState<Produto[]>([]);
  const [showBuscaProduto, setShowBuscaProduto] = useState(false);

  useEffect(() => {
    loadTabelas();
  }, [busca]);

  const loadTabelas = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarTabelasPreco(0, 200, false, busca || undefined) as TabelaPreco[];
      setTabelas(data);
    } catch (error) {
      console.error('Erro ao carregar tabelas de preço:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const buscar = async () => {
      if (!showBuscaProduto) return;
      try {
        const data = await apiClient.listarProdutos(0, 50, buscaProduto || undefined) as Produto[];
        setProdutosEncontrados(data);
      } catch (error) {
        console.error('Erro ao buscar produtos:', error);
      }
    };
    buscar();
  }, [buscaProduto, showBuscaProduto]);

  const resetForm = () => {
    setNome('');
    setDescricao('');
    setMargemGeral('0');
    setAtiva(true);
    setExcecoes([]);
    setFiltroExcecoes('');
    setBuscaProduto('');
    setShowBuscaProduto(false);
  };

  const handleNovo = () => {
    resetForm();
    setEditingId(null);
    setShowModal(true);
  };

  const handleEditar = async (tabela: TabelaPreco) => {
    resetForm();
    setEditingId(tabela.id);
    setNome(tabela.nome);
    setDescricao(tabela.descricao || '');
    setMargemGeral(String(tabela.margem_geral_percentual));
    setAtiva(tabela.ativa);
    setExcecoes(
      tabela.itens.map((item: TabelaPrecoItem) => ({
        produto_id: item.produto_id,
        codigo_interno: item.codigo_interno || '',
        descricao: item.descricao || `Produto ${item.produto_id}`,
        preco_custo: item.preco_custo || 0,
        margem_especifica_percentual: item.margem_especifica_percentual,
      }))
    );
    setShowModal(true);
  };

  const handleDeletar = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta tabela de preço?')) return;
    try {
      await apiClient.deletarTabelaPreco(id);
      loadTabelas();
    } catch (error) {
      console.error('Erro ao deletar tabela de preço:', error);
      alert('Erro ao deletar tabela de preço. Verifique se ela não está em uso.');
    }
  };

  const adicionarExcecao = (produto: Produto) => {
    if (excecoes.some((e) => e.produto_id === produto.id)) {
      setShowBuscaProduto(false);
      setBuscaProduto('');
      return;
    }
    setExcecoes([
      ...excecoes,
      {
        produto_id: produto.id,
        codigo_interno: produto.codigo_interno,
        descricao: produto.descricao,
        preco_custo: produto.preco_custo,
        margem_especifica_percentual: 0,
      },
    ]);
    setShowBuscaProduto(false);
    setBuscaProduto('');
  };

  const atualizarMargemExcecao = (produtoId: number, valor: string) => {
    const numero = parseFloat(valor.replace(',', '.'));
    setExcecoes(
      excecoes.map((e) =>
        e.produto_id === produtoId
          ? { ...e, margem_especifica_percentual: isNaN(numero) ? 0 : numero }
          : e
      )
    );
  };

  const removerExcecao = (produtoId: number) => {
    setExcecoes(excecoes.filter((e) => e.produto_id !== produtoId));
  };

  const calcularPrecoFinal = (precoCusto: number, margem: number) => {
    return precoCusto * (1 + (margem || 0) / 100);
  };

  const excecoesFiltradas = useMemo(() => {
    if (!filtroExcecoes.trim()) return excecoes;
    const termo = filtroExcecoes.toLowerCase();
    return excecoes.filter(
      (e) =>
        e.descricao.toLowerCase().includes(termo) ||
        e.codigo_interno.toLowerCase().includes(termo)
    );
  }, [excecoes, filtroExcecoes]);

  const handleSalvar = async () => {
    if (!nome.trim()) {
      alert('Informe o nome da tabela de preço');
      return;
    }

    const dados = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      margem_geral_percentual: parseFloat(margemGeral.replace(',', '.')) || 0,
      ativa,
      itens: excecoes.map((e) => ({
        produto_id: e.produto_id,
        margem_especifica_percentual: e.margem_especifica_percentual,
      })),
    };

    try {
      if (editingId) {
        await apiClient.atualizarTabelaPreco(editingId, dados);
      } else {
        await apiClient.criarTabelaPreco(dados);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadTabelas();
    } catch (error) {
      console.error('Erro ao salvar tabela de preço:', error);
      alert('Erro ao salvar tabela de preço.');
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
            <h1 className="text-2xl font-bold text-gray-900">Tabelas de Preço</h1>
          </div>
          <Button onClick={handleNovo} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Nova Tabela de Preço
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nome da tabela..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">Carregando tabelas de preço...</Card>
        ) : tabelas.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhuma tabela de preço cadastrada</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Margem Geral</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Exceções</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tabelas.map((tabela) => (
                  <tr key={tabela.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-blue-500" />
                      {tabela.nome}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{tabela.descricao || '—'}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-semibold">
                      {Number(tabela.margem_geral_percentual).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-600">{tabela.itens.length}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          tabela.ativa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {tabela.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center flex justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditar(tabela)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeletar(tabela.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>

      {/* Modal Tabela de Preço */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Editar Tabela de Preço' : 'Nova Tabela de Preço'}
            </h2>

            {/* Cabeçalho */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Tabela*</label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Tabela A - Atacado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Margem Geral (%)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={margemGeral}
                    onChange={(e) => setMargemGeral(e.target.value.replace(/[^0-9.,-]/g, ''))}
                    placeholder="20,00"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descrição opcional da tabela"
                />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  id="tabela_ativa"
                  checked={ativa}
                  onChange={(e) => setAtiva(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="tabela_ativa" className="text-sm font-medium text-gray-700">
                  Tabela ativa
                </label>
              </div>
            </div>

            {/* Exceções por produto */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Exceções por Produto</h3>
                <Button
                  size="sm"
                  onClick={() => setShowBuscaProduto(!showBuscaProduto)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Exceção por Produto
                </Button>
              </div>

              {showBuscaProduto && (
                <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                  <Input
                    autoFocus
                    placeholder="Buscar produto por código ou descrição..."
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    className="mb-3"
                  />
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-white">
                    {produtosEncontrados.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500">Nenhum produto encontrado</p>
                    ) : (
                      produtosEncontrados.map((produto) => (
                        <button
                          key={produto.id}
                          onClick={() => adicionarExcecao(produto)}
                          className="w-full text-left p-3 border-b hover:bg-blue-50 transition-colors last:border-b-0"
                        >
                          <p className="font-semibold text-gray-900">{produto.descricao}</p>
                          <p className="text-xs text-gray-600">
                            {produto.codigo_interno} • Custo: R$ {produto.preco_custo.toFixed(2)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {excecoes.length > 0 && (
                <div className="mb-3 relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Filtrar exceções adicionadas..."
                    value={filtroExcecoes}
                    onChange={(e) => setFiltroExcecoes(e.target.value)}
                    className="pl-10"
                  />
                </div>
              )}

              {excecoes.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">
                  Nenhuma exceção cadastrada. Todos os produtos usarão a margem geral da tabela.
                </p>
              ) : (
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Produto</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-700">Custo</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-700">Margem Padrão</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-700">Margem Específica</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-700">Preço Final</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-700">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {excecoesFiltradas.map((excecao) => (
                        <tr key={excecao.produto_id}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{excecao.descricao}</p>
                            <p className="text-xs text-gray-500">{excecao.codigo_interno}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            R$ {excecao.preco_custo.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {parseFloat(margemGeral.replace(',', '.')) || 0}%
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="relative inline-block">
                              <input
                                type="text"
                                value={excecao.margem_especifica_percentual}
                                onChange={(e) => atualizarMargemExcecao(excecao.produto_id, e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                              />
                              <span className="ml-1 text-gray-500">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            R${' '}
                            {calcularPrecoFinal(
                              excecao.preco_custo,
                              excecao.margem_especifica_percentual
                            ).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removerExcecao(excecao.produto_id)}
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  resetForm();
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvar} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Salvar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
