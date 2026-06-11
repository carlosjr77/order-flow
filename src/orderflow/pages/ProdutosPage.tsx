import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto, DadosEmpresa } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Edit2, Trash2, Search, Settings, Percent } from 'lucide-react';
import { aplicarMascaraMoeda, extrairValorMoeda } from '../utils/formatacao';

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
    margem_lucro: 0,
    unidade_medida: 'UN',
    ncm: '',
    estoque_inicial: 0,
    vender_sem_estoque: true,  // Default: permite vender sem estoque
  });
  
  // Estados para valores formatados (para exibição)
  const [precoCustoFormatado, setPrecoCustoFormatado] = useState('');
  const [precoVendaFormatado, setPrecoVendaFormatado] = useState('');
  const [margemFormatada, setMargemFormatada] = useState('');

  // Estados para configuração de margem geral
  const [empresaDados, setEmpresaDados] = useState<DadosEmpresa | null>(null);
  const [showModalMargem, setShowModalMargem] = useState(false);
  const [margemGeralFormatada, setMargemGeralFormatada] = useState('');

  useEffect(() => {
    loadEmpresaDados();
    loadProdutos();
  }, [busca]);

  const loadEmpresaDados = async () => {
    try {
      const dados = await apiClient.obterDadosEmpresa();
      if (dados) {
        setEmpresaDados(dados as DadosEmpresa);
        const margem = (dados as DadosEmpresa).margem_lucro_padrao ?? 1.0;
        setMargemGeralFormatada((margem * 100).toFixed(0));
      }
    } catch (error) {
      console.error('Erro ao carregar dados da empresa:', error);
    }
  };

  const loadProdutos = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarProdutos(0, 1000, busca || undefined);
      setProdutos(data as Produto[]);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSalvarProduto = async () => {
    try {
      const dadosParaSalvar = {
        ...formData,
        margem_lucro: margemFormatada ? parseFloat(margemFormatada) / 100 : null,
        preco_venda: precoVendaFormatado ? extrairValorMoeda(precoVendaFormatado) : null,
      };
      if (editingId) {
        await apiClient.atualizarProduto(editingId, dadosParaSalvar);
      } else {
        await apiClient.criarProduto(dadosParaSalvar);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadProdutos();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
    }
  };

  const handleSalvarMargemGeral = async () => {
    try {
      console.log('Salvando margem geral...', { empresaDados, margemGeralFormatada });
      if (!empresaDados || !empresaDados.id) {
        console.error('Empresa ou ID não encontrado');
        return;
      }
      const margemDecimal = parseFloat(margemGeralFormatada) / 100;
      console.log('Atualizando empresa com ID:', empresaDados.id, 'margem:', margemDecimal);
      const resultado = await apiClient.atualizarEmpresa(empresaDados.id, {
        margem_lucro_padrao: margemDecimal
      });
      console.log('Resultado:', resultado);
      setShowModalMargem(false);
      loadEmpresaDados();
    } catch (error) {
      console.error('Erro ao salvar margem geral:', error);
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
      preco_venda: produto.preco_venda ?? 0,
      margem_lucro: produto.margem_lucro ?? 0,
      unidade_medida: produto.unidade_medida,
      ncm: produto.ncm || '',
      estoque_inicial: produto.estoque_atual,
      vender_sem_estoque: produto.vender_sem_estoque || false,
    });
    setPrecoCustoFormatado(produto.preco_custo.toFixed(2).replace('.', ','));
    setPrecoVendaFormatado((produto.preco_venda ?? 0).toFixed(2).replace('.', ','));
    setMargemFormatada(produto.margem_lucro ? (produto.margem_lucro * 100).toFixed(0) : '');
    setEditingId(produto.id);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      codigo_interno: '',
      descricao: '',
      preco_custo: 0,
      preco_venda: 0,
      margem_lucro: 0,
      unidade_medida: 'UN',
      ncm: '',
      estoque_inicial: 0,
      vender_sem_estoque: true,  // Default: permite vender sem estoque
    });
    setPrecoCustoFormatado('');
    setPrecoVendaFormatado('');
    setMargemFormatada('');
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModalMargem(true)}
              className="border-emerald-500 text-emerald-600 hover:bg-emerald-50"
            >
              <Percent className="w-4 h-4 mr-1" />
              Margem Geral: {margemGeralFormatada}%
            </Button>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </div>
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
                      {produto.preco_venda !== null && produto.preco_venda !== undefined 
                        ? `R$ ${produto.preco_venda.toFixed(2)}` 
                        : '—'}
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

      {/* Modal Margem Geral */}
      {showModalMargem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Percent className="w-5 h-5 text-emerald-600" />
              Configurar Margem Geral
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Esta margem será usada como padrão para todos os produtos que não tiverem preço de venda cadastrado.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Margem de Lucro (%)</label>
              <div className="relative">
                <Input
                  type="text"
                  value={margemGeralFormatada}
                  onChange={(e) => setMargemGeralFormatada(e.target.value.replace(/\D/g, ''))}
                  placeholder="100"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ex: 100% = preço de custo × 2
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowModalMargem(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarMargemGeral}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                Salvar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Produto */}
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
                    type="text"
                    value={precoCustoFormatado}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setPrecoCustoFormatado(valor);
                      setFormData({ ...formData, preco_custo: extrairValorMoeda(valor) });
                    }}
                    placeholder="0,00"
                    onBlur={() => {
                      const valor = precoCustoFormatado.replace(',', '.');
                      const numerico = parseFloat(valor) || 0;
                      setPrecoCustoFormatado(numerico.toFixed(2).replace('.', ','));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço Venda</label>
                  <Input
                    type="text"
                    value={precoVendaFormatado}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setPrecoVendaFormatado(valor);
                      setFormData({ ...formData, preco_venda: extrairValorMoeda(valor) });
                    }}
                    placeholder="0,00 (ou deixe vazio)"
                    onBlur={() => {
                      if (precoVendaFormatado) {
                        const valor = precoVendaFormatado.replace(',', '.');
                        const numerico = parseFloat(valor) || 0;
                        setPrecoVendaFormatado(numerico.toFixed(2).replace('.', ','));
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1">Deixe vazio para usar margem</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Margem de Lucro (%)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={margemFormatada}
                    onChange={(e) => setMargemFormatada(e.target.value.replace(/\D/g, ''))}
                    placeholder="100"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Usada quando preço de venda não estiver preenchido. Padrão: {margemGeralFormatada}%
                </p>
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

              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Inicial</label>
                  <Input
                    type="number"
                    value={formData.estoque_inicial}
                    onChange={(e) => setFormData({ ...formData, estoque_inicial: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    min="0"
                    step="1"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vender_sem_estoque"
                  checked={formData.vender_sem_estoque}
                  onChange={(e) => setFormData({ ...formData, vender_sem_estoque: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="vender_sem_estoque" className="text-sm font-medium text-gray-700">
                  Permitir venda sem estoque (produto pode ser vendido mesmo com estoque zerado)
                </label>
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
