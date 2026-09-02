import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto, ItemCarrinho, Venda, DadosEmpresa, Cliente, TabelaPreco } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Trash2, Download, Printer, User, MapPin, AlertCircle, X, Save, Wand2 } from 'lucide-react';
import { gerarComprovanteDANFE } from '../utils/gerarComprovante';
import { useDebounce } from '../hooks/useDebounce';
import { aplicarMascaraCep, aplicarMascaraDocumento, aplicarMascaraMoeda, extrairValorMoeda } from '../utils/formatacao';
import { formatarDocumento, formatarTelefone } from '../utils/validacoes';
import { calcularPrecoVenda } from '../utils/precoDinamico';
import { SugestaoTabelaModal } from '../components/SugestaoTabelaModal';
import { DanfeViewerDialog } from '../components/DanfeViewerDialog';

type ModoPrecoPersonalizado = 'padrao' | 'preco' | 'margem';

type ItemCarrinhoPDV = ItemCarrinho & {
  id: number;
  preco_base: number;
  preco_custo: number;
  modo_preco_personalizado: ModoPrecoPersonalizado;
  preco_personalizado?: number | null;
  margem_personalizada?: number | null;
  enviar_bar?: boolean;
  enviar_cozinha?: boolean;
};

export const PDVPage: React.FC = () => {
  const navigate = useNavigate();
  const { vendaId } = useParams<{ vendaId?: string }>();
  const isModoEdicao = !!vendaId;
  const vendaIdNumerico = vendaId ? parseInt(vendaId, 10) : null;
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPDV[]>([]);
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
  const [showDanfeDialog, setShowDanfeDialog] = useState(false);
  const [isLoadingEdicao, setIsLoadingEdicao] = useState(false);
  const [concluirAoSalvar, setConcluirAoSalvar] = useState(false);
  
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

  // Tabela de Preços selecionada para a venda
  const [tabelasPreco, setTabelasPreco] = useState<TabelaPreco[]>([]);
  const [tabelaPrecoSelecionadaId, setTabelaPrecoSelecionadaId] = useState<number | null>(null);
  const tabelaPrecoSelecionada = tabelasPreco.find((t) => t.id === tabelaPrecoSelecionadaId) || null;
  const [showModalSugestaoTabela, setShowModalSugestaoTabela] = useState(false);

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
  const [dataEntrega, setDataEntrega] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');

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
    loadTabelasPreco();
  }, []);

  // Carregar venda para edição quando estiver em modo de edição
  useEffect(() => {
    if (isModoEdicao && vendaIdNumerico && produtos.length > 0) {
      carregarVendaParaEdicao();
    }
  }, [isModoEdicao, vendaIdNumerico, produtos.length]);

  const carregarVendaParaEdicao = async () => {
    if (!vendaIdNumerico) return;

    setIsLoadingEdicao(true);
    try {
      const venda = await apiClient.obterVenda(vendaIdNumerico) as Venda;

      if (!venda || !venda.itens) {
        setErroMensagem('Venda não encontrada ou sem itens.');
        setShowModalErro(true);
        return;
      }

      // Preencher dados do cliente
      if (venda.nome_cliente) {
        setDadosCliente({ nome: venda.nome_cliente, documento: '' });
        setShowDadosCliente(true);
      }

      // Preencher tabela de preços utilizada na venda
      setTabelaPrecoSelecionadaId(venda.tabela_preco_id ?? null);

      // Preencher forma de pagamento
      setFormaPagamento(venda.forma_pagamento || '');

      // Preencher observações
      setObservacoes(venda.observacoes || '');

      // Preencher frete
      const frete = venda.valor_frete || 0;
      setPrecoFreteFormatado(frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

      // Preencher datas
      if (venda.data_entrega) {
        setDataEntrega(new Date(venda.data_entrega).toISOString().split('T')[0]);
      }
      if (venda.data_vencimento) {
        setDataVencimento(new Date(venda.data_vencimento).toISOString().split('T')[0]);
      }

      // Preencher carrinho com itens da venda
      const itensCarrinho: ItemCarrinhoPDV[] = venda.itens.map((item, index) => {
        const produto = produtos.find((p) => p.id === item.produto_id);
        const precoBase = produto ? getPrecoVendaFinal(produto) : item.valor_unitario;
        const precoCusto = produto ? produto.preco_custo : 0;

        return {
          id: index,
          produto_id: item.produto_id,
          descricao: item.descricao || produto?.descricao || `Produto ${item.produto_id}`,
          codigo_interno: item.codigo_interno || produto?.codigo_interno || '',
          unidade_medida: item.unidade_medida || produto?.unidade_medida || 'UN',
          ncm: item.ncm || produto?.ncm,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          preco_base: precoBase,
          preco_custo: precoCusto,
          modo_preco_personalizado: Math.abs(precoBase - item.valor_unitario) > 0.001 ? 'preco' : 'padrao',
          preco_personalizado: Math.abs(precoBase - item.valor_unitario) > 0.001 ? item.valor_unitario : null,
          margem_personalizada: null,
          enviar_bar: false,
          enviar_cozinha: false,
        };
      });

      setCarrinho(itensCarrinho);
    } catch (error) {
      console.error('Erro ao carregar venda para edição:', error);
      setErroMensagem('Erro ao carregar venda para edição.');
      setShowModalErro(true);
    } finally {
      setIsLoadingEdicao(false);
    }
  };

  // Obter margem geral da empresa (padrão 100% = 1.0)
  const getMargemGeral = () => {
    return empresaDados?.margem_lucro_padrao ?? 1.0;
  };

  // Calcular preço de venda de um produto usando a hierarquia padrão do sistema
  const getPrecoVenda = (produto: Produto): number => {
    return calcularPrecoVenda(
      produto.preco_custo,
      produto.preco_venda,
      produto.margem_lucro,
      getMargemGeral()
    );
  };

  // Calcular preço de venda considerando a Tabela de Preços selecionada na venda
  // 1) Exceção por produto na tabela -> 2) Margem geral da tabela -> 3) Regra padrão do sistema
  const getPrecoVendaFinal = (produto: Produto): number => {
    if (tabelaPrecoSelecionada) {
      const excecao = tabelaPrecoSelecionada.itens.find((item) => item.produto_id === produto.id);
      if (excecao) {
        return Number((produto.preco_custo * (1 + excecao.margem_especifica_percentual / 100)).toFixed(2));
      }
      return Number(
        (produto.preco_custo * (1 + tabelaPrecoSelecionada.margem_geral_percentual / 100)).toFixed(2)
      );
    }
    return getPrecoVenda(produto);
  };

  const loadTabelasPreco = async () => {
    try {
      const data = await apiClient.listarTabelasPreco(0, 200, true) as TabelaPreco[];
      setTabelasPreco(data);
    } catch (error) {
      console.error('Erro ao carregar tabelas de preço:', error);
    }
  };

  // Recalcula os preços dos itens já inseridos no carrinho ao trocar a tabela de preços
  useEffect(() => {
    setCarrinho((itens) =>
      itens.map((item) => {
        const produto = produtos.find((p) => p.id === item.produto_id);
        if (!produto) return item;

        const novoPrecoBase = getPrecoVendaFinal(produto);

        if (item.modo_preco_personalizado === 'padrao') {
          return {
            ...item,
            preco_base: novoPrecoBase,
            valor_unitario: novoPrecoBase,
            valor_total: item.quantidade * novoPrecoBase,
          };
        }

        return { ...item, preco_base: novoPrecoBase };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelaPrecoSelecionadaId, tabelasPreco, produtos]);

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
      const data = await apiClient.listarClientes(0, 100, buscaCliente || undefined) as Cliente[];
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
        const data = await apiClient.listarProdutos(0, 1000, buscaDebounced || undefined) as Produto[];
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
    const precoVenda = getPrecoVendaFinal(produto);
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
      const novoId = carrinho.length > 0 ? Math.max(...carrinho.map((item) => item.id)) + 1 : 0;
      setCarrinho([
        ...carrinho,
        {
          id: novoId,
          produto_id: produto.id,
          descricao: produto.descricao,
          codigo_interno: produto.codigo_interno,
          unidade_medida: produto.unidade_medida,
          ncm: produto.ncm,
          quantidade: 1,
          preco_base: precoVenda,
          preco_custo: produto.preco_custo,
          modo_preco_personalizado: 'padrao',
          preco_personalizado: null,
          margem_personalizada: null,
          valor_unitario: precoVenda,
          valor_total: precoVenda,
        },
      ]);
    }
  };

  const calcularValorUnitarioItem = (
    item: ItemCarrinhoPDV,
    overrides?: Partial<ItemCarrinhoPDV>
  ) => {
    const modo = (overrides?.modo_preco_personalizado ?? item.modo_preco_personalizado) as ModoPrecoPersonalizado;
    const precoPersonalizado = overrides?.preco_personalizado ?? item.preco_personalizado;
    const margemPersonalizada = overrides?.margem_personalizada ?? item.margem_personalizada;

    if (modo === 'preco' && precoPersonalizado !== null && precoPersonalizado !== undefined && precoPersonalizado > 0) {
      return Number(precoPersonalizado.toFixed(2));
    }

    if (modo === 'margem' && margemPersonalizada !== null && margemPersonalizada !== undefined && margemPersonalizada >= 0) {
      return Number((item.preco_custo * (1 + margemPersonalizada / 100)).toFixed(2));
    }

    return Number(item.preco_base.toFixed(2));
  };

  const atualizarPrecoItem = (id: number, changes: Partial<ItemCarrinhoPDV>) => {
    setCarrinho((itens) =>
      itens.map((item) => {
        if (item.id !== id) return item;

        const itemAtualizado = {
          ...item,
          ...changes,
        };

        const valorUnitario = calcularValorUnitarioItem(itemAtualizado, changes);

        return {
          ...itemAtualizado,
          valor_unitario: valorUnitario,
          valor_total: itemAtualizado.quantidade * valorUnitario,
        };
      })
    );
  };

  const removerDoCarrinho = (id: number) => {
    setCarrinho(carrinho.filter((item) => item.id !== id));
  };

  const alternarDestinoItem = (id: number, destino: 'bar' | 'cozinha') => {
    setCarrinho(
      carrinho.map((item) => {
        if (item.id !== id) return item;

        if (destino === 'bar') {
          return { ...item, enviar_bar: !item.enviar_bar };
        }

        return { ...item, enviar_cozinha: !item.enviar_cozinha };
      })
    );
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
      // Incluir nome do cliente no nome do arquivo se disponível
      const nomeCliente = clienteSelecionado?.nome || (showDadosCliente && dadosCliente.nome ? dadosCliente.nome : null);
      const nomeArquivo = nomeCliente 
        ? `${nomeCliente.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getTime()}.pdf`
        : `${new Date().getTime()}.pdf`;
      pdf.save(nomeArquivo);
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

      const destinosPorProduto = new Map(
        carrinho
          .filter((item) => item.quantidade > 0)
          .map((item) => [
            item.produto_id,
            {
              enviar_bar: !!item.enviar_bar,
              enviar_cozinha: !!item.enviar_cozinha,
            },
          ])
      );

      if (itens.length === 0) {
        alert('Adicione produtos com quantidade maior que zero!');
        return;
      }

      const valorFreteNum = extrairValorMoeda(precoFreteFormatado) || 0;
      const nomeCliente = clienteSelecionado?.nome || (showDadosCliente && dadosCliente.nome ? dadosCliente.nome : null);

      let venda: Venda;

      if (isModoEdicao && vendaIdNumerico) {
        // Editar venda existente
        venda = await apiClient.editarVenda(vendaIdNumerico, {
          itens,
          forma_pagamento: formaPagamento,
          observacoes: observacoes || null,
          valor_frete: valorFreteNum,
          nome_cliente: nomeCliente,
          tabela_preco_id: tabelaPrecoSelecionadaId,
          data_entrega: dataEntrega ? dataEntrega : null,
          data_vencimento: dataVencimento ? dataVencimento : null,
          status: concluirAoSalvar ? 'concluído' : undefined,
        }) as Venda;
      } else {
        // Criar nova venda
        venda = await apiClient.criarVenda({
          itens,
          forma_pagamento: formaPagamento,
          observacoes: observacoes || null,
          valor_frete: valorFreteNum,
          nome_cliente: nomeCliente,
          tabela_preco_id: tabelaPrecoSelecionadaId,
          data_entrega: dataEntrega ? dataEntrega : null,
          data_vencimento: dataVencimento ? dataVencimento : null,
        }) as Venda;
      }

      const vendaDetalhes = await apiClient.obterVenda(venda.id) as Venda;
      
      const documentoItens = vendaDetalhes.itens?.map((item) => ({
        ...item,
        descricao: item.descricao || 'Produto',
        codigo_interno: item.codigo_interno || String(item.produto_id),
        unidade_medida: item.unidade_medida || 'UN',
        ncm: item.ncm || undefined,
        enviar_bar: destinosPorProduto.get(item.produto_id)?.enviar_bar || false,
        enviar_cozinha: destinosPorProduto.get(item.produto_id)?.enviar_cozinha || false,
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
      // Incluir nome do cliente no nome do arquivo se disponível
      const nomeArquivo = nomeCliente 
        ? `${nomeCliente.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getTime()}.pdf`
        : `${new Date().getTime()}.pdf`;
      pdf.save(nomeArquivo);

      setVendaFinalizada({
        ...vendaDetalhes,
        itens: documentoItens,
      });
      setShowModalSucesso(true);

      // Resetar todos os campos
      setCarrinho([]);
      setFormaPagamento('');
      setObservacoes('');
      setPrecoFreteFormatado('0,00');
      setDataEntrega('');
      setDataVencimento('');
      setClienteSelecionado(null);
      setBuscaCliente('');
      setDadosCliente({ nome: '', documento: '' });
      setTabelaPrecoSelecionadaId(null);
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
      setConcluirAoSalvar(false);
    } catch (error: any) {
      console.error('Erro ao finalizar venda:', error);
      // Extrair mensagem de erro do backend
      let errorMsg = isModoEdicao ? 'Erro ao salvar edição da venda' : 'Erro ao finalizar venda';
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
            <Button variant="outline" size="sm" onClick={() => navigate('/vendas')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isModoEdicao ? `Editar Pedido #${vendaId}` : 'Frente de Caixa'}
              </h1>
              {isModoEdicao && (
                <p className="text-sm text-amber-600 font-medium">
                  Modo Edição - Altere os itens e dados do pedido
                </p>
              )}
            </div>
          </div>
          {isModoEdicao && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              EDIÇÃO
            </span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {isModoEdicao && isLoadingEdicao && (
              <Card className="mb-6 p-6 text-center text-amber-700 bg-amber-50">
                Carregando dados do pedido para edição...
              </Card>
            )}
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
                  const precoVenda = getPrecoVendaFinal(produto);
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

          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:min-h-0">
            <Card className="h-full min-h-0 overflow-hidden">
              <div className="h-full min-h-0 overflow-y-auto p-6">
                <h2 className="text-lg font-bold mb-4">Carrinho</h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tabela de Preços
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={tabelaPrecoSelecionadaId ?? ''}
                      onChange={(e) =>
                        setTabelaPrecoSelecionadaId(e.target.value ? parseInt(e.target.value, 10) : null)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    >
                      <option value="">Nenhuma (Usar Preço Padrão do Sistema)</option>
                      {tabelasPreco.map((tabela) => (
                        <option key={tabela.id} value={tabela.id}>
                          {tabela.nome}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowModalSugestaoTabela(true)}
                      className="whitespace-nowrap border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      <Wand2 className="w-4 h-4 mr-1" />
                      Sugerir Tabela
                    </Button>
                  </div>
                  {tabelaPrecoSelecionada && (
                    <p className="text-xs text-gray-500 mt-1">
                      Margem geral da tabela: {Number(tabelaPrecoSelecionada.margem_geral_percentual).toFixed(2)}%
                    </p>
                  )}
                </div>

                {carrinho.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {isModoEdicao ? 'Carregando itens do pedido...' : 'Carrinho vazio'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {carrinho.map((item) => (
                      <div key={item.id} className="border-b pb-3 last:border-b-0">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {item.descricao}
                            </p>
                            <p className="text-xs text-gray-500">
                              R$ {item.valor_unitario.toFixed(2)}
                              {item.modo_preco_personalizado !== 'padrao' && (
                                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  personalizado
                                </span>
                              )}
                            </p>
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
                        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Preco para esta venda
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={item.modo_preco_personalizado === 'padrao' ? 'default' : 'outline'}
                              onClick={() =>
                                atualizarPrecoItem(item.id, {
                                  modo_preco_personalizado: 'padrao',
                                  preco_personalizado: null,
                                  margem_personalizada: null,
                                })
                              }
                              className="h-7 px-2 text-xs"
                            >
                              Padrao
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={item.modo_preco_personalizado === 'preco' ? 'default' : 'outline'}
                              onClick={() =>
                                atualizarPrecoItem(item.id, {
                                  modo_preco_personalizado: 'preco',
                                  preco_personalizado: item.valor_unitario > 0 ? item.valor_unitario : item.preco_base,
                                })
                              }
                              className="h-7 px-2 text-xs"
                            >
                              Preco fixo
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={item.modo_preco_personalizado === 'margem' ? 'default' : 'outline'}
                              onClick={() =>
                                atualizarPrecoItem(item.id, {
                                  modo_preco_personalizado: 'margem',
                                  margem_personalizada:
                                    item.margem_personalizada !== null && item.margem_personalizada !== undefined
                                      ? item.margem_personalizada
                                      : 0,
                                })
                              }
                              className="h-7 px-2 text-xs"
                            >
                              Margem %
                            </Button>
                          </div>
                          {item.modo_preco_personalizado === 'preco' && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-slate-600">R$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.preco_personalizado ?? ''}
                                onChange={(e) => {
                                  const valor = e.target.value;
                                  atualizarPrecoItem(item.id, {
                                    preco_personalizado: valor === '' ? null : Number(valor),
                                  });
                                }}
                                className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                                placeholder="0,00"
                              />
                            </div>
                          )}
                          {item.modo_preco_personalizado === 'margem' && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-slate-600">Margem</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.margem_personalizada ?? ''}
                                onChange={(e) => {
                                  const valor = e.target.value;
                                  atualizarPrecoItem(item.id, {
                                    margem_personalizada: valor === '' ? null : Number(valor),
                                  });
                                }}
                                className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                                placeholder="0,00"
                              />
                              <span className="text-xs text-slate-600">%</span>
                            </div>
                          )}
                          <p className="mt-2 text-[11px] text-slate-500">
                            Base: R$ {item.preco_base.toFixed(2)} | Custo: R$ {item.preco_custo.toFixed(2)}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-2">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              Destino para conferencia
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={item.enviar_cozinha ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => alternarDestinoItem(item.id, 'cozinha')}
                                className={`h-7 px-2 text-xs ${item.enviar_cozinha ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
                              >
                                Cozinha
                              </Button>
                              <Button
                                type="button"
                                variant={item.enviar_bar ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => alternarDestinoItem(item.id, 'bar')}
                                className={`h-7 px-2 text-xs ${item.enviar_bar ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600' : 'border-sky-300 text-sky-700 hover:bg-sky-50'}`}
                              >
                                Bar
                              </Button>
                              <span className="ml-auto rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-200">
                                {item.enviar_cozinha && item.enviar_bar
                                  ? 'Vai para Cozinha e Bar'
                                  : item.enviar_cozinha
                                  ? 'Vai para Cozinha'
                                  : item.enviar_bar
                                  ? 'Vai para Bar'
                                  : 'Sem categoria'}
                              </span>
                            </div>
                          </div>
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
                          />
                          <Input
                            placeholder="CPF ou CNPJ"
                            value={dadosCliente.documento}
                            onChange={(e) => {
                              const valor = e.target.value;
                              const formatado = valor ? formatarDocumento(valor) : '';
                              setDadosCliente({ ...dadosCliente, documento: formatado });
                            }}
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
                          />
                          <Input
                            placeholder="Endereço"
                            value={enderecoEntrega.endereco}
                            onChange={(e) => setEnderecoEntrega({...enderecoEntrega, endereco: e.target.value})}
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Número"
                              value={enderecoEntrega.numero}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, numero: e.target.value})}
                            />
                            <Input
                              placeholder="Complemento"
                              value={enderecoEntrega.complemento}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, complemento: e.target.value})}
                            />
                          </div>
                          <Input
                            placeholder="Bairro"
                            value={enderecoEntrega.bairro}
                            onChange={(e) => setEnderecoEntrega({...enderecoEntrega, bairro: e.target.value})}
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Cidade"
                              value={enderecoEntrega.cidade}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, cidade: e.target.value})}
                            />
                            <Input
                              placeholder="UF"
                              value={enderecoEntrega.estado.toUpperCase()}
                              onChange={(e) => setEnderecoEntrega({...enderecoEntrega, estado: e.target.value.toUpperCase().slice(0, 2)})}
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

                    {/* Data de Entrega */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data de Entrega (opcional)
                      </label>
                      <Input
                        type="date"
                        value={dataEntrega}
                        onChange={(e) => setDataEntrega(e.target.value)}
                        className="w-full"
                        placeholder="Selecione a data de entrega"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Deixe vazio para entrega imediata (data de hoje)
                      </p>
                    </div>

                    {/* Data de Vencimento */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data de Vencimento (opcional)
                      </label>
                      <Input
                        type="date"
                        value={dataVencimento}
                        onChange={(e) => setDataVencimento(e.target.value)}
                        className="w-full"
                        placeholder="Selecione a data de vencimento"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Data de vencimento do pedido para o cliente
                      </p>
                    </div>

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

                    {isModoEdicao && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={concluirAoSalvar}
                            onChange={(e) => setConcluirAoSalvar(e.target.checked)}
                            className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                          />
                          <span className="text-sm font-medium text-amber-800">
                            Concluir venda ao salvar edição
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="sticky bottom-0 -mx-6 mt-2 border-t bg-white/95 px-6 pb-2 pt-3 backdrop-blur">
                      <Button
                        onClick={finalizarVenda}
                        disabled={!formaPagamento}
                        className={`w-full py-2 rounded font-semibold mb-2 ${
                          isModoEdicao
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {isModoEdicao ? (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            {concluirAoSalvar ? 'Salvar e Concluir Edição' : 'Salvar Alterações'}
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Finalizar Venda
                          </>
                        )}
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
                    </div>
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
              <Button onClick={() => setShowDanfeDialog(true)} variant="outline" className="w-full">
                <Printer className="w-4 h-4 mr-2" />
                Ver DANFE fiscal
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

      <DanfeViewerDialog open={showDanfeDialog} onOpenChange={setShowDanfeDialog} />

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

      {/* Modal Assistente de Sugestão de Tabela de Preço */}
      {showModalSugestaoTabela && (
        <SugestaoTabelaModal
          tabelasPreco={tabelasPreco}
          onClose={() => setShowModalSugestaoTabela(false)}
          onAplicar={(tabelaId) => {
            setTabelaPrecoSelecionadaId(tabelaId);
            setShowModalSugestaoTabela(false);
          }}
        />
      )}
    </div>
  );
};