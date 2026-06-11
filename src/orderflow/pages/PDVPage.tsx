import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto, ItemCarrinho, Venda, DadosEmpresa, Cliente } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Trash2, Download, Printer, User, MapPin, AlertCircle, X } from 'lucide-react';
import { gerarComprovanteDANFE } from '../utils/gerarComprovante';
import { useDebounce } from '../hooks/useDebounce';
import { aplicarMascaraCep, aplicarMascaraDocumento, aplicarMascaraMoeda, extrairValorMoeda } from '../utils/formatacao';
import { formatarDocumento, formatarTelefone } from '../utils/validacoes';
import { calcularPrecoVenda } from '../utils/precoDinamico';

export const PDVPage: React.FC = () => {
  const navigate = useNavigate();
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<(ItemCarrinho & { id: number })[]>([]);
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebounce(busca, 300);
  const [isLoading, setIsLoading] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [empresaDados, setEmpresaDados] = useState<DadosEmpresa | null>(null);
  const [showModalSucesso, setShowModalSucesso] = useState(false);
  const [showModalErro, setShowModalErro] = useState(false);
  const [erroMensagem, setErroMensagem] = useState('');
  const [vendaFinalizada, setVendaFinalizada] = useState<Venda | null>(null);
  
  // Dados do cliente
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [showListaClientes, setShowListaClientes] = useState(false);
  const [showDadosCliente, setShowDadosCliente] = useState(false);
  const [dadosCliente, setDadosCliente] = useState({
    nome: '',
    documento: '',
  });

  // Dados de entrega
  const [showEnderecoEntrega, setShowEnderecoEntrega] = useState(false);
  const [editandoEndereco, setEditandoEndereco] = useState(false);
  const [enderecoEntrega, setEnderecoEntrega] = useState({
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
  });

  const [precoFreteFormatado, setPrecoFreteFormatado] = useState('0,00');
  const [freteFocus, setFreteFocus] = useState(false);

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
  }, []);

  // Obter margem geral da empresa (padrão 100% = 1.0)
  const getMargemGeral = () => {
    return empresaDados?.margem_lucro_padrao ?? 1.0;
  };

  // Calcular preço de venda de um produto usando a hierarquia
  const getPrecoVenda = (produto: Produto): number => {
    return calcularPrecoVenda(
      produto.preco_custo,
      produto.preco_venda,
      produto.margem_lucro,
      getMargemGeral()
    );
  };

  const loadEmpresaDados = async () => {
    try {
      const dados = await apiClient.obterDadosEmpresa();
      if (dados) {
        setEmpresaDados(dados as DadosEmpresa);
      } else {
        setEmpresaDados(null);
      }
    } catch (error) {
      console.error('Erro ao carregar dados da empresa:', error);
      setEmpresaDados(null);
    }
  };

  const loadClientes = async () => {
    try {
      const data = await apiClient.listarClientes(0, 100, buscaCliente || undefined);
      setClientes(data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  useEffect(() => {
    if (showListaClientes) {
      loadClientes();
    }
  }, [buscaCliente, showListaClientes]);

  const selecionarCliente = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setDadosCliente({
      nome: cliente.nome || '',
      documento: cliente.documento || '',
    });
    if (cliente.endereco) {
      setEnderecoEntrega({
        endereco: cliente.endereco || '',
        numero: cliente.numero || '',
        complemento: cliente.complemento || '',
        bairro: cliente.bairro || '',
        cidade: cliente.cidade || '',
        estado: cliente.estado || '',
        cep: cliente.cep || '',
      });
      setShowEnderecoEntrega(true);
    }
    setShowListaClientes(false);
    setShowDadosCliente(true);
  };

  useEffect(() => {
    const carregarProdutos = async () => {
      try {
        setIsLoading(true);
        const data = await apiClient.listarProdutos(0, 1000, buscaDebounced || undefined);
        // Ordenar produtos por ordem alfabética (descricao)
        const produtosOrdenados = [...data].sort((a, b) =>
          a.descricao.localeCompare(b.descricao, 'pt-BR')
        );
        setProdutos(produtosOrdenados);
        // Manter o foco no input de busca após carregar
        setTimeout(() => buscaInputRef.current?.focus(), 0);
      } catch (error) {
        console.error('Erro ao carregar produtos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    carregarProdutos();
  }, [buscaDebounced]);

  const adicionarAoCarrinho = (produto: Produto) => {
    const precoVenda = getPrecoVenda(produto);
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
          codigo_interno: produto.codigo_interno,
          unidade_medida: produto.unidade_medida,
          ncm: produto.ncm,
          quantidade: 1,
          valor_unitario: precoVenda,
          valor_total: precoVenda,
        },
      ]);
    }
  };

  const removerDoCarrinho = (id: number) => {
    setCarrinho(carrinho.filter((item) => item.id !== id));
  };

  const atualizarQuantidade = (id: number, novaQuantidade: number | string) => {
    // Se está vazio (usuário apagando para digitar novo valor)
    if (novaQuantidade === '' || novaQuantidade === null || novaQuantidade === undefined) {
      setCarrinho(
        carrinho.map((item) =>
          item.id === id
            ? {
                ...item,
                quantidade: 0,
                valor_total: 0,
              }
            : item
        )
      );
      return;
    }

    const quantidade = typeof novaQuantidade === 'string' ? parseFloat(novaQuantidade) : novaQuantidade;
    
    // Validação: se não for um número válido
    if (isNaN(quantidade)) {
      return;
    }

    // Se for negativo, não faz nada
    if (quantidade < 0) {
      return;
    }

    // Se for 0, apenas atualiza para 0 (campo fica vazio) sem remover
    if (quantidade === 0) {
      setCarrinho(
        carrinho.map((item) =>
          item.id === id
            ? {
                ...item,
                quantidade: 0,
                valor_total: 0,
              }
            : item
        )
      );
      return;
    }

    // Atualiza com o valor positivo
    setCarrinho(
      carrinho.map((item) =>
        item.id === id
          ? {
              ...item,
              quantidade: quantidade,
              valor_total: quantidade * item.valor_unitario,
            }
          : item
      )
    );
  };

  const calcularSubtotal = () => {
    return carrinho.reduce((total, item) => total + item.valor_total, 0);
  };

  const calcularTotal = () => {
    const frete = extrairValorMoeda(precoFreteFormatado) || 0;
    return calcularSubtotal() + frete;
  };

  const fecharModalSucesso = () => {
    setShowModalSucesso(false);
    setVendaFinalizada(null);
    navigate('/vendas');
  };

  const continuarVendendo = () => {
    setShowModalSucesso(false);
    setVendaFinalizada(null);
  };

  const fecharModalErro = () => {
    setShowModalErro(false);
    setErroMensagem('');
  };

  const imprimirPDFVenda = async () => {
    if (!vendaFinalizada) return;
    
    try {
      const documentoItens = vendaFinalizada.itens?.map((item) => ({
        ...item,
        descricao: item.descricao || 'Produto',
        codigo_interno: item.codigo_interno || String(item.produto_id),
        unidade_medida: item.unidade_medida || 'UN',
        ncm: item.ncm || undefined,
      })) || [];

      // Usar clienteSelecionado se disponível, caso contrário dadosCliente
      const clienteDados = clienteSelecionado 
        ? { nome: clienteSelecionado.nome, documento: clienteSelecionado.documento || '' }
        : (showDadosCliente && dadosCliente.nome ? dadosCliente : null);
      
      const entregaDados = showEnderecoEntrega && enderecoEntrega.endereco ? enderecoEntrega : null;

      const dadosComprovante = {
        empresa: empresaDados || dadosEmpresaPadrao,
        venda: vendaFinalizada,
        itens: documentoItens,
        cliente: clienteDados,
        entrega: entregaDados,
      };

      const pdf = await gerarComprovanteDANFE(dadosComprovante);
      pdf.save(`Pedido_${vendaFinalizada.id}_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
    }
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

    // Validar endereço - se entrega estiver marcada
    if (showEnderecoEntrega) {
      const temEndereco = enderecoEntrega.endereco.trim() && enderecoEntrega.numero.trim();
      if (!temEndereco) {
        alert('Preencha o endereço de entrega!');
        return;
      }
    }

    try {
      // Filtrar itens com quantidade válida (maior que 0)
      const itens = carrinho
        .filter((item) => item.quantidade > 0)
        .map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
        }));

      if (itens.length === 0) {
        alert('Adicione produtos com quantidade maior que zero!');
        return;
      }

      const valorFreteNum = extrairValorMoeda(precoFreteFormatado) || 0;

      const venda: Venda = await apiClient.criarVenda({
        itens,
        forma_pagamento: formaPagamento,
        observacoes: observacoes || null,
        valor_frete: valorFreteNum,
      });

      const vendaDetalhes: Venda = await apiClient.obterVenda(venda.id);
      
      const documentoItens = vendaDetalhes.itens?.map((item) => ({
        ...item,
        descricao: item.descricao || 'Produto',
        codigo_interno: item.codigo_interno || String(item.produto_id),
        unidade_medida: item.unidade_medida || 'UN',
        ncm: item.ncm || undefined,
      })) || [];

      // Usar clienteSelecionado se disponível, caso contrário dadosCliente
      const clienteDados = clienteSelecionado 
        ? { nome: clienteSelecionado.nome, documento: clienteSelecionado.documento || '' }
        : (showDadosCliente && dadosCliente.nome ? dadosCliente : null);
      
      const entregaDados = showEnderecoEntrega && enderecoEntrega.endereco ? enderecoEntrega : null;

      const dadosComprovante = {
        empresa: empresaDados || dadosEmpresaPadrao,
        venda: vendaDetalhes,
        itens: documentoItens,
        cliente: clienteDados,
        entrega: entregaDados,
      };

      const pdf = await gerarComprovanteDANFE(dadosComprovante);
      pdf.save(`Pedido_${venda.id}_${new Date().getTime()}.pdf`);

      setVendaFinalizada(vendaDetalhes);
      setShowModalSucesso(true);

      // Resetar todos os campos
      setCarrinho([]);
      setFormaPagamento('');
      setObservacoes('');
      setPrecoFreteFormatado('0,00');
      setClienteSelecionado(null);
      setBuscaCliente('');
      setDadosCliente({ nome: '', documento: '' });
      setEnderecoEntrega({
        endereco: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        cep: '',
      });
      setShowDadosCliente(false);
      setShowEnderecoEntrega(false);
      setShowListaClientes(false);
    } catch (error: any) {
      console.error('Erro ao finalizar venda:', error);
      // Extrair mensagem de erro do backend
      let errorMsg = 'Erro ao finalizar venda';
      if (error.message) {
        try {
          const jsonError = JSON.parse(error.message);
          if (jsonError.detail) {
            errorMsg = jsonError.detail;
          } else if (jsonError.message) {
            errorMsg = jsonError.message;
          }
        } catch {
          errorMsg = error.message;
        }
      } else if (error.detail) {
        errorMsg = error.detail;
      } else if (error.response?.data) {
        const data = error.response.data;
        if (data.detail) {
          errorMsg = data.detail;
        } else if (data.message) {
          errorMsg = data.message;
        }
      }
      setErroMensagem(errorMsg);
      setShowModalErro(true);
    }
  };

  const buscarCep = async () => {
    const cepLimpo = enderecoEntrega.cep.replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setEnderecoEntrega({
            ...enderecoEntrega,
            endereco: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            estado: data.uf,
          });
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  const totalVenda = calcularTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
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
          <div className="lg:col-span-2">
            <Card className="mb-6 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold flex-1">Buscar Produtos</h2>
                {busca && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBusca('')}
                    className="h-8"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
              <Input
                ref={buscaInputRef}
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
                produtos.map((produto) => {
                  const precoVenda = getPrecoVenda(produto);
                  return (
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
                            R$ {precoVenda.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

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
                            step={item.unidade_medida === 'KG' ? '0.001' : '1'}
                            value={item.quantidade === 0 ? '' : item.quantidade}
                            onChange={(e) => atualizarQuantidade(item.id, e.target.value)}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="0"
                          />
                          <span className="text-xs text-gray-500 min-w-fit">{item.unidade_medida}</span>
                          <p className="text-sm font-semibold text-gray-900">
                            R$ {item.valor_total.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {carrinho.length > 0 && (
                  <>
                    <div className="my-4 pt-4 border-t-2">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-semibold text-gray-700">Subtotal</p>
                        <p className="text-lg font-bold text-gray-900">R$ {calcularSubtotal().toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Botões de opções adicionais */}
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={clienteSelecionado ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowListaClientes(!showListaClientes)}
                        className="flex-1"
                      >
                        <User className="w-4 h-4 mr-1" />
                        {clienteSelecionado ? 'Trocar Cliente' : 'Selecionar Cliente'}
                      </Button>
                      <Button
                        variant={showEnderecoEntrega ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowEnderecoEntrega(!showEnderecoEntrega)}
                        className="flex-1"
                      >
                        <MapPin className="w-4 h-4 mr-1" />
                        Entrega
                      </Button>
                    </div>

                    {/* Seleção de Cliente */}
                    {showListaClientes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded">
                        <Input
                          placeholder="Buscar cliente por nome ou documento..."
                          value={buscaCliente}
                          onChange={(e) => setBuscaCliente(e.target.value)}
                          className="mb-3"
                          size="sm"
                        />
                        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
                          {clientes.length === 0 ? (
                            <p className="p-3 text-sm text-gray-500">Nenhum cliente encontrado</p>
                          ) : (
                            clientes.map((cliente) => (
                              <button
                                key={cliente.id}
                                onClick={() => selecionarCliente(cliente)}
                                className="w-full text-left p-3 border-b hover:bg-blue-50 transition-colors last:border-b-0"
                              >
                                <p className="font-semibold text-gray-900">{cliente.nome}</p>
                                <p className="text-xs text-gray-600">{cliente.documento || ''}</p>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dados do Cliente Selecionado */}
                    {clienteSelecionado && (
                      <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-semibold text-green-800">✓ Cliente Selecionado</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setClienteSelecionado(null);
                              setShowDadosCliente(false);
                            }}
                            className="h-6 px-2 text-xs"
                          >
                            Trocar
                          </Button>
                        </div>
                        <p className="font-bold text-lg text-gray-900 mb-1">{clienteSelecionado.nome}</p>
                        <div className="space-y-1 text-sm text-gray-700">
                          {clienteSelecionado.documento && (
                            <p>
                              <span className="font-medium">CPF/CNPJ:</span> {formatarDocumento(clienteSelecionado.documento)}
                            </p>
                          )}
                          {clienteSelecionado.telefone && (
                            <p>
                              <span className="font-medium">Telefone:</span> {formatarTelefone(clienteSelecionado.telefone)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Cliente Preenchido Manualmente */}
                    {!clienteSelecionado && showDadosCliente && dadosCliente.nome && (
                      <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-semibold text-amber-800">👤 Cliente Preenchido</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowDadosCliente(false);
                              setDadosCliente({ nome: '', documento: '' });
                            }}
                            className="h-6 px-2 text-xs"
                          >
                            Limpar
                          </Button>
                        </div>
                        <p className="font-bold text-lg text-gray-900 mb-1">{dadosCliente.nome}</p>
                        {dadosCliente.documento && (
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">CPF/CNPJ:</span> {formatarDocumento(dadosCliente.documento)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Formulário Cliente Manual */}
                    {!clienteSelecionado && (!showDadosCliente || !dadosCliente.nome) && (
                      <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                        <p className="text-xs font-semibold text-gray-700 mb-3">Preencher Cliente Manualmente</p>
                        <div className="space-y-2">
                          <Input
                            placeholder="Nome do cliente"
                            value={dadosCliente.nome}
                            onChange={(e) => setDadosCliente({ ...dadosCliente, nome: e.target.value })}
                            size="sm"
                          />
                          <Input
                            placeholder="CPF ou CNPJ"
                            value={dadosCliente.documento}
                            onChange={(e) => {
                              const valor = e.target.value;
                              const formatado = valor ? formatarDocumento(valor) : '';
                              setDadosCliente({ ...dadosCliente, documento: formatado });
                            }}
                            size="sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (dadosCliente.nome.trim()) {
                                setShowDadosCliente(true);
                              }
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 h-8"
                          >
                            Usar Este Cliente
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Resumo Endereço de Entrega */}
                    {showEnderecoEntrega && enderecoEntrega.endereco && !editandoEndereco && (
                      <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-semibold text-blue-800">📍 Endereço de Entrega</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditandoEndereco(true)}
                            className="h-6 px-2 text-xs"
                          >
                            Editar
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm text-gray-700">
                          <p className="font-medium">{enderecoEntrega.endereco}, {enderecoEntrega.numero}</p>
                          {enderecoEntrega.complemento && <p>{enderecoEntrega.complemento}</p>}
                          <p>{enderecoEntrega.bairro} - {enderecoEntrega.cidade}/{enderecoEntrega.estado}</p>
                          {enderecoEntrega.cep && <p>CEP: {aplicarMascaraCep(enderecoEntrega.cep)}</p>}
                        </div>
                      </div>
                    )}

                    {/* Endereço de Entrega - Formulário */}
                    {showEnderecoEntrega && (editandoEndereco || !enderecoEntrega.endereco) && (
                      <div className="mb-4 p-3 bg-gray-50 rounded">
                        <div className="space-y-2">
                          <Input
                            placeholder="CEP"
                            value={aplicarMascaraCep(enderecoEntrega.cep)}
                            onChange={(e) => setEnderecoEntrega({...enderecoEntrega, cep: e.target.value.replace(/\D/g, '')})}
                            onBlur={() => {
                              setEnderecoEntrega({...enderecoEntrega, cep: aplicarMascaraCep(enderecoEntrega.cep)});
                              buscarCep();
                            }}
                            size="sm"
                          />
                          <Input
                            placeholder="Endereço"
                            value={enderecoEntrega.endereco}
                            onChange={(e) => setEnderecoEntrega({...enderecoEntrega, endereco: e.target.value})}
                            size="sm"
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Número"
                              value={enderecoEntrega.numero}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, numero: e.target.value})}
                              size="sm"
                            />
                            <Input
                              placeholder="Complemento"
                              value={enderecoEntrega.complemento}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, complemento: e.target.value})}
                              size="sm"
                            />
                          </div>
                          <Input
                            placeholder="Bairro"
                            value={enderecoEntrega.bairro}
                            onChange={(e) => setEnderecoEntrega({...enderecoEntrega, bairro: e.target.value})}
                            size="sm"
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Cidade"
                              value={enderecoEntrega.cidade}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, cidade: e.target.value})}
                              size="sm"
                            />
                            <Input
                              placeholder="UF"
                              value={enderecoEntrega.estado.toUpperCase()}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, estado: e.target.value.toUpperCase().slice(0, 2)})}
                              size="sm"
                            />
                          </div>
                        </div>
                        {editandoEndereco && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditandoEndereco(false)}
                              className="flex-1 h-8"
                            >
                              Pronto
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Frete */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor do Frete (opcional)
                      </label>
                      <Input
                        type="text"
                        value={freteFocus ? precoFreteFormatado : precoFreteFormatado}
                        onChange={(e) => {
                          let valor = e.target.value.replace(/\D/g, '');
                          if (valor) {
                            const num = parseInt(valor, 10) / 100;
                            setPrecoFreteFormatado(num.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                          } else {
                            setPrecoFreteFormatado('0,00');
                          }
                        }}
                        onFocus={() => {
                          setFreteFocus(true);
                          const valorNumerico = extrairValorMoeda(precoFreteFormatado);
                          if (valorNumerico > 0) {
                            setPrecoFreteFormatado(valorNumerico.toFixed(2).replace('.', ','));
                          }
                        }}
                        onBlur={() => {
                          setFreteFocus(false);
                          const formatado = aplicarMascaraMoeda(precoFreteFormatado);
                          setPrecoFreteFormatado(formatado || '0,00');
                        }}
                        placeholder="0,00"
                        className="w-full"
                      />
                    </div>

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

                    <textarea
                      placeholder="Observações (opcional)"
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4"
                      rows={3}
                    />

                    <div className="my-4 p-3 bg-blue-50 rounded">
                      <div className="flex justify-between items-center">
                        <p className="text-base font-bold text-gray-800">Total</p>
                        <p className="text-xl font-bold text-green-600">R$ {calcularTotal().toFixed(2)}</p>
                      </div>
                    </div>

                    <Button
                      onClick={finalizarVenda}
                      disabled={!formaPagamento}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-semibold mb-2"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Finalizar Venda
                    </Button>
                    <Button
                      onClick={() => { 
                        setCarrinho([]); 
                        setFormaPagamento(''); 
                        setPrecoFreteFormatado('0,00');
                        setClienteSelecionado(null);
                        setShowListaClientes(false);
                        setBuscaCliente('');
                      }}
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

      {/* Modal de Sucesso */}
      {showModalSucesso && vendaFinalizada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm p-8 text-center animate-in fade-in zoom-in">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-2">Venda Finalizada!</h2>
            <p className="text-gray-600 mb-6">A venda foi processada com sucesso e o comprovante foi gerado.</p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3 text-left">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Número do Pedido:</span>
                <span className="font-bold text-lg text-gray-900">#{vendaFinalizada.id}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="text-gray-600">Total:</span>
                <span className="font-bold text-xl text-green-600">R$ {vendaFinalizada.valor_total.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="text-gray-600">Forma de Pagamento:</span>
                <span className="font-semibold text-gray-900">{vendaFinalizada.forma_pagamento}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={imprimirPDFVenda} className="w-full bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir / Baixar PDF
              </Button>
              <div className="flex gap-3">
                <Button onClick={continuarVendendo} variant="outline" className="flex-1">
                  Continuar Vendendo
                </Button>
                <Button onClick={fecharModalSucesso} className="flex-1 bg-green-600 hover:bg-green-700">
                  Ir para Vendas
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Erro */}
      {showModalErro && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">Erro na Venda</h2>
            <p className="text-gray-600 mb-6">{erroMensagem}</p>

            <Button onClick={fecharModalErro} className="w-full bg-red-600 hover:bg-red-700">
              Fechar
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};