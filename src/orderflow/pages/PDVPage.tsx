import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto, ItemCarrinho, Venda } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react';
import { gerarComprovanteDANFE } from '../utils/gerarComprovante';

export const PDVPage: React.FC = () => {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<(ItemCarrinho & { id: number })[]>([]);
  const [busca, setBusca] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('');
  const [observacoes, setObservacoes] = useState('');

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

  const adicionarAoCarrinho = (produto: Produto) => {
    const itemExistente = carrinho.find((item) => item.produto_id === produto.id);

    if (itemExistente) {
      setCarrinho(
        carrinho.map((item) =>
          item.produto_id === produto.id
            ? {
                ...item,
                quantidade: item.quantidade + 1,
                valor_total: (item.quantidade + 1) * item.valor_unitario,
              }
            : item
        )
      );
    } else {
      setCarrinho([
        ...carrinho,
        {
          id: carrinho.length,
          produto_id: produto.id,
          descricao: produto.descricao,
          quantidade: 1,
          valor_unitario: produto.preco_venda,
          valor_total: produto.preco_venda,
        },
      ]);
    }
  };

  const removerDoCarrinho = (id: number) => {
    setCarrinho(carrinho.filter((item) => item.id !== id));
  };

  const atualizarQuantidade = (id: number, novaQuantidade: number) => {
    if (novaQuantidade <= 0) {
      removerDoCarrinho(id);
      return;
    }

    setCarrinho(
      carrinho.map((item) =>
        item.id === id
          ? {
              ...item,
              quantidade: novaQuantidade,
              valor_total: novaQuantidade * item.valor_unitario,
            }
          : item
      )
    );
  };

  const calcularTotal = () => {
    return carrinho.reduce((total, item) => total + item.valor_total, 0);
  };

  const finalizarVenda = async () => {
    if (carrinho.length === 0) {
      alert('Carrinho vazio!');
      return;
    }

    if (!formaPagamento) {
      alert('Selecione a forma de pagamento');
      return;
    }

    try {
      const itens = carrinho.map((item) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      }));

      const venda: Venda = await apiClient.criarVenda({
        itens,
        forma_pagamento: formaPagamento,
        observacoes: observacoes || null,
      });

      // Gerar comprovante PDF
      const vendaDetalhes: Venda = await apiClient.obterVenda(venda.id);
      const documentoItens = vendaDetalhes.itens?.map((item) => ({
        ...item,
        descricao: carrinho.find((c) => c.produto_id === item.produto_id)?.descricao || 'Produto',
      })) || [];

      const dadosComprovante = {
        empresa: {
          nome: 'Sua Empresa LTDA',
          cnpj: '00.000.000/0000-00',
          endereco: 'Rua Exemplo',
          numero: '123',
          bairro: 'Centro',
          cidade: 'São Paulo',
          estado: 'SP',
          cep: '01000-000',
        },
        venda: vendaDetalhes,
        itens: documentoItens,
      };

      const pdf = gerarComprovanteDANFE(dadosComprovante);
      pdf.save(`Pedido_${venda.id}_${new Date().getTime()}.pdf`);

      // Limpar carrinho
      setCarrinho([]);
      setFormaPagamento('');
      setObservacoes('');

      alert('Venda finalizada com sucesso!');
      navigate('/vendas');
    } catch (error) {
      console.error('Erro ao finalizar venda:', error);
      alert('Erro ao finalizar venda');
    }
  };

  const totalVenda = calcularTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Frente de Caixa</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Produtos */}
          <div className="lg:col-span-2">
            <Card className="mb-6 p-6">
              <h2 className="text-lg font-bold mb-4">Buscar Produtos</h2>
              <Input
                type="text"
                placeholder="Código ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                disabled={isLoading}
              />
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLoading ? (
                <p className="text-gray-500">Carregando...</p>
              ) : produtos.length === 0 ? (
                <p className="text-gray-500">Nenhum produto encontrado</p>
              ) : (
                produtos.map((produto) => (
                  <Card
                    key={produto.id}
                    className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => adicionarAoCarrinho(produto)}
                  >
                    <p className="text-sm font-medium text-gray-500">{produto.codigo_interno}</p>
                    <h3 className="font-bold text-gray-900 truncate">{produto.descricao}</h3>
                    <div className="flex justify-between items-center mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Estoque</p>
                        <p className="text-lg font-bold text-green-600">
                          {produto.estoque_atual} {produto.unidade_medida}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Preço</p>
                        <p className="text-lg font-bold text-blue-600">
                          R$ {produto.preco_venda.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Carrinho */}
          <div>
            <Card className="sticky top-4">
              <div className="p-6">
                <h2 className="text-lg font-bold mb-4">Carrinho</h2>

                {carrinho.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Carrinho vazio</p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {carrinho.map((item) => (
                      <div key={item.id} className="border-b pb-3 last:border-b-0">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {item.descricao}
                            </p>
                            <p className="text-xs text-gray-500">R$ {item.valor_unitario.toFixed(2)}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removerDoCarrinho(item.id)}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => atualizarQuantidade(item.id, parseInt(e.target.value))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <p className="text-sm font-semibold text-gray-900">
                            R$ {item.valor_total.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                {carrinho.length > 0 && (
                  <>
                    <div className="my-4 pt-4 border-t-2">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-semibold text-gray-700">Subtotal</p>
                        <p className="text-lg font-bold text-gray-900">R$ {totalVenda.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Forma de Pagamento
                      </label>
                      <select
                        value={formaPagamento}
                        onChange={(e) => setFormaPagamento(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      >
                        <option value="">Selecione...</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Débito">Débito</option>
                        <option value="Crédito">Crédito</option>
                        <option value="PIX">PIX</option>
                      </select>
                    </div>

                    {/* Observações */}
                    <textarea
                      placeholder="Observações (opcional)"
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4"
                      rows={3}
                    />

                    {/* Buttons */}
                    <Button
                      onClick={finalizarVenda}
                      disabled={!formaPagamento}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-semibold mb-2"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Finalizar Venda
                    </Button>
                    <Button
                      onClick={() => { setCarrinho([]); setFormaPagamento(''); }}
                      variant="outline"
                      className="w-full"
                    >
                      Limpar Carrinho
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};
