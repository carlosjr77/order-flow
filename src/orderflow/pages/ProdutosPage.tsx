import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Edit2, Trash2, Search } from 'lucide-react';

export const ProdutosPage: React.FC = () => {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    codigo_interno: '',
    descricao: '',
    preco_custo: 0,
    preco_venda: 0,
    unidade_medida: 'UN',
    ncm: '',
  });

  useEffect(() => {
    loadProdutos();
  }, [busca]);

  const loadProdutos = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarProdutos(0, 1000, busca || undefined);
      setProdutos(data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSalvarProduto = async () => {
    try {
      if (editingId) {
        await apiClient.atualizarProduto(editingId, formData);
      } else {
        await apiClient.criarProduto(formData);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadProdutos();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
    }
  };

  const handleDeletarProduto = async (id: number) => {
    if (confirm('Tem certeza que deseja deletar este produto?')) {
      try {
        await apiClient.deletarProduto(id);
        loadProdutos();
      } catch (error) {
        console.error('Erro ao deletar produto:', error);
      }
    }
  };

  const handleEditar = (produto: Produto) => {
    setFormData({
      codigo_interno: produto.codigo_interno,
      descricao: produto.descricao,
      preco_custo: produto.preco_custo,
      preco_venda: produto.preco_venda,
      unidade_medida: produto.unidade_medida,
      ncm: produto.ncm || '',
    });
    setEditingId(produto.id);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      codigo_interno: '',
      descricao: '',
      preco_custo: 0,
      preco_venda: 0,
      unidade_medida: 'UN',
      ncm: '',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Gestão de Produtos</h1>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="mb-6 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por código ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Products Table */}
        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">
            Carregando produtos...
          </Card>
        ) : produtos.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            Nenhum produto encontrado
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Estoque</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Preço Custo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Preço Venda</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {produtos.map((produto) => (
                  <tr key={produto.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{produto.codigo_interno}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{produto.descricao}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {produto.estoque_atual} {produto.unidade_medida}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      R$ {produto.preco_custo.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-semibold">
                      R$ {produto.preco_venda.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-center flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditar(produto)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletarProduto(produto.id)}
                      >
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Editar Produto' : 'Novo Produto'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Interno*</label>
                <Input
                  value={formData.codigo_interno}
                  onChange={(e) => setFormData({ ...formData, codigo_interno: e.target.value })}
                  placeholder="EX001"
                  disabled={!!editingId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição*</label>
                <Input
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição do produto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço Custo*</label>
                  <Input
                    type="number"
                    value={formData.preco_custo}
                    onChange={(e) => setFormData({ ...formData, preco_custo: parseFloat(e.target.value) })}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço Venda*</label>
                  <Input
                    type="number"
                    value={formData.preco_venda}
                    onChange={(e) => setFormData({ ...formData, preco_venda: parseFloat(e.target.value) })}
                    step="0.01"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                  <select
                    value={formData.unidade_medida}
                    onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option>UN</option>
                    <option>KG</option>
                    <option>LT</option>
                    <option>CX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NCM</label>
                  <Input
                    value={formData.ncm}
                    onChange={(e) => setFormData({ ...formData, ncm: e.target.value })}
                    placeholder="12345678"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowModal(false); setEditingId(null); }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarProduto}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Salvar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
