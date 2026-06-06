import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Venda, DadosEmpresa } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, DownloadCloud, Printer, ShoppingCart, Trash2, CheckSquare2, Square } from 'lucide-react';
import { gerarComprovanteDANFE, gerarListaCompras, consolidarItensVendas } from '../utils/gerarComprovante';

export const VendasPage: React.FC = () => {
  const navigate = useNavigate();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(null);
  const [empresaDados, setEmpresaDados] = useState<DadosEmpresa | null>(null);
  const [selectedVendasIds, setSelectedVendasIds] = useState<number[]>([]);
  const [isGeneratingLista, setIsGeneratingLista] = useState(false);

  // Dados padrão em caso de nenhuma empresa cadastrada
  const dadosEmpresaPadrao: DadosEmpresa = {
    nome: 'Sua Empresa LTDA',
    cnpj: '00.000.000/0000-00',
    endereco: 'Rua Exemplo',
    numero: '123',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01000-000',
  };

  useEffect(() => {
    loadEmpresaDados();
    loadVendas();
  }, []);

  const loadEmpresaDados = async () => {
    try {
      const dados = await apiClient.obterDadosEmpresa();
      if (dados) {
        setEmpresaDados(dados);
      } else {
        setEmpresaDados(null);
      }
    } catch (error) {
      console.error('Erro ao carregar dados da empresa:', error);
      setEmpresaDados(null);
    }
  };

  const loadVendas = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarVendas(0, 1000);
      setVendas(data.sort((a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime()));
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadComprovante = async (venda: Venda) => {
    try {
      // Buscar detalhes completos da venda (com itens completos)
      const vendaDetalhes = await apiClient.obterVenda(venda.id);
      
      // Mapear itens com dados completos
      const documentoItens = vendaDetalhes.itens?.map((item) => ({
        ...item,
        descricao: item.descricao || 'Produto',
        codigo_interno: item.codigo_interno || String(item.produto_id),
        unidade_medida: item.unidade_medida || 'UN',
        ncm: item.ncm || undefined,
      })) || [];

      const dadosComprovante = {
        empresa: empresaDados || dadosEmpresaPadrao,
        venda: vendaDetalhes,
        itens: documentoItens,
        // Não há dados de cliente/entrega no histórico, usa null
        cliente: null,
        entrega: null,
      };

      const pdf = await gerarComprovanteDANFE(dadosComprovante);
      pdf.save(`Pedido_${vendaDetalhes.id}_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
    }
  };

  const concluirVenda = async (vendaId: number) => {
    try {
      await apiClient.concluirVenda(vendaId);
      loadVendas();
    } catch (error) {
      console.error('Erro ao concluir venda:', error);
    }
  };

  const cancelarVenda = async (vendaId: number) => {
    if (confirm('Tem certeza que deseja cancelar esta venda?')) {
      try {
        await apiClient.cancelarVenda(vendaId);
        loadVendas();
      } catch (error) {
        console.error('Erro ao cancelar venda:', error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concluído':
        return 'bg-green-100 text-green-800';
      case 'pendente':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelado':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const toggleSelecaoVenda = (vendaId: number) => {
    setSelectedVendasIds(prev => 
      prev.includes(vendaId) 
        ? prev.filter(id => id !== vendaId)
        : [...prev, vendaId]
    );
  };

  const selecionarTodas = () => {
    if (selectedVendasIds.length === vendas.length) {
      setSelectedVendasIds([]);
    } else {
      setSelectedVendasIds(vendas.map(v => v.id));
    }
  };

  const gerarListaComprasPDF = async () => {
    if (selectedVendasIds.length < 1) {
      alert('Selecione pelo menos uma venda para gerar a lista de compras.');
      return;
    }

    setIsGeneratingLista(true);
    try {
      // Buscar detalhes completos de todas as vendas selecionadas
      const vendasDetalhes = await Promise.all(
        selectedVendasIds.map(id => apiClient.obterVenda(id))
      );

      // Consolidar itens
      const itensConsolidados = consolidarItensVendas(vendasDetalhes);

      const dadosListaCompras = {
        empresa: empresaDados || dadosEmpresaPadrao,
        itens: itensConsolidados,
        vendas_ids: selectedVendasIds,
        data_geracao: new Date(),
        total_vendas: selectedVendasIds.length,
        total_itens: itensConsolidados.length,
      };

      const pdf = await gerarListaCompras(dadosListaCompras);
      pdf.save(`Lista_Compras_${new Date().getTime()}.pdf`);
      
      // Limpar seleção após gerar
      setSelectedVendasIds([]);
    } catch (error) {
      console.error('Erro ao gerar lista de compras:', error);
      alert('Erro ao gerar lista de compras. Tente novamente.');
    } finally {
      setIsGeneratingLista(false);
    }
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
            <h1 className="text-2xl font-bold text-gray-900">Histórico de Vendas</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">
            Carregando vendas...
          </Card>
        ) : vendas.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            Nenhuma venda encontrada
          </Card>
        ) : (
          <>
            {/* Barra de ferramentas com seleção múltipla */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant={selectedVendasIds.length === vendas.length ? 'default' : 'outline'}
                  size="sm"
                  onClick={selecionarTodas}
                  className={selectedVendasIds.length === vendas.length ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {selectedVendasIds.length === vendas.length ? (
                    <CheckSquare2 className="w-4 h-4 mr-1" />
                  ) : (
                    <Square className="w-4 h-4 mr-1" />
                  )}
                  {selectedVendasIds.length === vendas.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </Button>
                {selectedVendasIds.length > 0 && (
                  <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    {selectedVendasIds.length} venda(s) selecionada(s)
                  </span>
                )}
              </div>
              
              {selectedVendasIds.length > 0 && (
                <Button
                  onClick={gerarListaComprasPDF}
                  disabled={isGeneratingLista}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isGeneratingLista ? 'Gerando...' : `Gerar Lista de Compras (${selectedVendasIds.length})`}
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {vendas.map((venda) => (
                <Card 
                  key={venda.id} 
                  className={`p-4 transition-all duration-200 ${
                    selectedVendasIds.includes(venda.id) 
                      ? 'ring-2 ring-emerald-500 bg-emerald-50' 
                      : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Checkbox de seleção */}
                      <button
                        onClick={() => toggleSelecaoVenda(venda.id)}
                        className="mt-1 flex-shrink-0"
                      >
                        {selectedVendasIds.includes(venda.id) ? (
                          <CheckSquare2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                        )}
                      </button>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-lg text-gray-900">Pedido #{venda.id}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(venda.status)}`}>
                            {venda.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          Data: {new Date(venda.data_venda).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {venda.forma_pagamento && (
                          <p className="text-sm text-gray-600">Pagamento: {venda.forma_pagamento}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        R$ {venda.valor_total.toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {venda.itens?.length || 0} itens
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedVenda(venda)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver Detalhes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => downloadComprovante(venda)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <DownloadCloud className="w-4 h-4 mr-1" />
                      Baixar PDF
                    </Button>
                    {venda.status === 'pendente' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => concluirVenda(venda.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Concluir
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => cancelarVenda(venda.id)}
                          variant="outline"
                          className="text-red-600"
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Modal de Detalhes */}
        {selectedVenda && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-96 overflow-y-auto p-6">
              <h2 className="text-xl font-bold mb-4">Detalhes da Venda #{selectedVenda.id}</h2>

              <div className="mb-4 p-4 bg-gray-50 rounded">
                <p className="text-sm"><span className="font-semibold">Data:</span> {new Date(selectedVenda.data_venda).toLocaleDateString('pt-BR')}</p>
                <p className="text-sm"><span className="font-semibold">Status:</span> {selectedVenda.status}</p>
                <p className="text-sm"><span className="font-semibold">Pagamento:</span> {selectedVenda.forma_pagamento || '-'}</p>
                {selectedVenda.valor_frete !== undefined && selectedVenda.valor_frete > 0 && (
                  <p className="text-sm"><span className="font-semibold">Frete:</span> R$ {selectedVenda.valor_frete.toFixed(2)}</p>
                )}
              </div>

              {selectedVenda.itens && selectedVenda.itens.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Itens:</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Produto ID</th>
                        <th className="text-center py-2">Qtd</th>
                        <th className="text-right py-2">Unitário</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVenda.itens.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">{item.produto_id}</td>
                          <td className="text-center py-2">{item.quantidade}</td>
                          <td className="text-right py-2">R$ {item.valor_unitario.toFixed(2)}</td>
                          <td className="text-right py-2">R$ {item.valor_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="p-4 bg-blue-50 rounded mb-4">
                <p className="text-lg font-bold">Total: R$ {selectedVenda.valor_total.toFixed(2)}</p>
              </div>

              {selectedVenda.observacoes && (
                <div className="mb-4">
                  <p className="text-sm"><span className="font-semibold">Observações:</span> {selectedVenda.observacoes}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={() => downloadComprovante(selectedVenda)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir PDF
                </Button>
                <Button
                  onClick={() => setSelectedVenda(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Fechar
                </Button>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};
