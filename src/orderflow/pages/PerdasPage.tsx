import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Produto } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Trash2, Download, AlertTriangle, Package } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ItemPerda {
  produto: Produto;
  quantidade: number;
}

export const PerdasPage: React.FC = () => {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState('');
  const [itensPerda, setItensPerda] = useState<ItemPerda[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [todosProdutos, setTodosProdutos] = useState<Produto[]>([]);
  const [quantidadeEditando, setQuantidadeEditando] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    carregarProdutos();
  }, []);

  // Filtrar produtos quando a busca mudar
  useEffect(() => {
    if (todosProdutos.length > 0) {
      filtrarProdutos();
    }
  }, [busca, todosProdutos]);

  const carregarProdutos = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarProdutos(0, 1000);
      const produtosOrdenados = [...data].sort((a, b) =>
        a.descricao.localeCompare(b.descricao, 'pt-BR')
      );
      setTodosProdutos(produtosOrdenados);
      setProdutos(produtosOrdenados);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filtrarProdutos = () => {
    if (!busca || busca.trim() === '') {
      setProdutos(todosProdutos);
    } else {
      const buscaLower = busca.toLowerCase();
      const filtrados = todosProdutos.filter(produto =>
        produto.descricao.toLowerCase().includes(buscaLower) ||
        produto.codigo_interno.toLowerCase().includes(buscaLower)
      );
      setProdutos(filtrados);
    }
  };

  const adicionarItemPerda = (produto: Produto) => {
    const itemExistente = itensPerda.find((item) => item.produto.id === produto.id);
    
    if (itemExistente) {
      setItensPerda(
        itensPerda.map((item) =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        )
      );
    } else {
      setItensPerda([
        ...itensPerda,
        { produto, quantidade: 1 },
      ]);
    }
  };

  const removerItemPerda = (produtoId: number) => {
    setItensPerda(itensPerda.filter((item) => item.produto.id !== produtoId));
  };

  const atualizarQuantidade = (produtoId: number, novaQuantidade: number) => {
    if (novaQuantidade <= 0) {
      removerItemPerda(produtoId);
      return;
    }
    
    // Limpar o estado de edição
    setQuantidadeEditando(prev => {
      const novo = { ...prev };
      delete novo[produtoId];
      return novo;
    });
    
    setItensPerda(
      itensPerda.map((item) =>
        item.produto.id === produtoId
          ? { ...item, quantidade: novaQuantidade }
          : item
      )
    );
  };

  const iniciarEdicaoQuantidade = (produtoId: number, quantidadeAtual: number) => {
    setQuantidadeEditando(prev => ({
      ...prev,
      [produtoId]: String(quantidadeAtual)
    }));
  };

  const handleBlurQuantidade = (produtoId: number) => {
    const valor = quantidadeEditando[produtoId];
    if (valor === '' || valor === undefined) {
      // Se estiver vazio, mantém a quantidade atual
      setQuantidadeEditando(prev => {
        const novo = { ...prev };
        delete novo[produtoId];
        return novo;
      });
    } else {
      const num = parseFloat(valor);
      if (!isNaN(num) && num > 0) {
        atualizarQuantidade(produtoId, num);
      } else {
        // Valor inválido, remove do estado de edição
        setQuantidadeEditando(prev => {
          const novo = { ...prev };
          delete novo[produtoId];
          return novo;
        });
      }
    }
  };

  const calcularTotalPrejuizo = () => {
    return itensPerda.reduce((total, item) => {
      return total + (item.produto.preco_custo * item.quantidade);
    }, 0);
  };

  const calcularTotalDeixouFaturar = () => {
    return itensPerda.reduce((total, item) => {
      const precoVenda = item.produto.preco_venda || 
        (item.produto.preco_custo * (1 + (item.produto.margem_lucro || 0)));
      return total + (precoVenda * item.quantidade);
    }, 0);
  };

  const gerarRelatorioPDF = () => {
    if (itensPerda.length === 0) {
      alert('Adicione pelo menos um item para gerar o relatório.');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const m = 5;
    const w = 200;
    let y = m;

    const dataFormatada = new Date().toLocaleDateString('pt-BR');
    const horaFormatada = new Date().toLocaleTimeString('pt-BR').slice(0, 5);
    const totalPrejuizo = calcularTotalPrejuizo();
    const totalDeixouFaturar = calcularTotalDeixouFaturar();

    // Título
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text('RELATÓRIO DE PERDAS', w / 2, y + 10, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Documento para controle de perdas e prejuízos', w / 2, y + 16, { align: 'center' });
    doc.text(`Gerado em: ${dataFormatada} às ${horaFormatada}`, w / 2, y + 21, { align: 'center' });

    y += 28;

    // Tabela de produtos perdidos
    const tableData = itensPerda.map((item) => {
      const precoVenda = item.produto.preco_venda || 
        (item.produto.preco_custo * (1 + (item.produto.margem_lucro || 0)));
      const custoTotal = item.produto.preco_custo * item.quantidade;
      const vendaTotal = precoVenda * item.quantidade;
      const lucroDeixadoGanhar = vendaTotal - custoTotal;

      return [
        item.produto.codigo_interno,
        item.produto.descricao,
        String(item.quantidade),
        item.produto.unidade_medida,
        `R$ ${item.produto.preco_custo.toFixed(2)}`,
        `R$ ${custoTotal.toFixed(2)}`,
        `R$ ${precoVenda.toFixed(2)}`,
        `R$ ${vendaTotal.toFixed(2)}`,
        `R$ ${lucroDeixadoGanhar.toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['CÓD.', 'PRODUTO', 'QTD', 'UNID.', 'CUSTO UNIT.', 'CUSTO TOTAL', 'VLR UNIT.', 'VLR TOTAL', 'LUCRO NÃO GANHO']],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 7,
        font: 'helvetica',
        lineWidth: 0.2,
        lineColor: [0, 0, 0],
        textColor: [0, 0, 0],
        cellPadding: 1.5,
      },
      headStyles: {
        fillColor: [180, 50, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: w * 0.10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: w * 0.06, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: w * 0.06, halign: 'center' },
        4: { cellWidth: w * 0.10, halign: 'right' },
        5: { cellWidth: w * 0.10, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: w * 0.10, halign: 'right' },
        7: { cellWidth: w * 0.10, halign: 'right', fontStyle: 'bold' },
        8: { cellWidth: w * 0.12, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // Destacar coluna de lucro não ganho
        if (data.section === 'body' && data.column.index === 8) {
          data.cell.styles.fillColor = [255, 230, 230];
          data.cell.styles.textColor = [150, 0, 0];
        }
        // Destacar coluna de custo total
        if (data.section === 'body' && data.column.index === 5) {
          data.cell.styles.fillColor = [255, 240, 240];
        }
      },
      margin: { left: m, right: m },
    });

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 10;

    // Resumo geral
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text('RESUMO GERAL DO PREJUÍZO', m, y);
    y += 5;

    // Caixa de resumo
    const resumoHeight = 25;
    doc.setFillColor(255, 240, 240);
    doc.rect(m, y, w - 2 * m, resumoHeight, 'FD');
    doc.setDrawColor(180, 0, 0);
    doc.rect(m, y, w - 2 * m, resumoHeight);

    y += 6;

    // Total de prejuízo (custo)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL DE PREJUÍZO (CUSTO DOS PRODUTOS):', m + 5, y);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text(`R$ ${totalPrejuizo.toFixed(2)}`, w - m - 5, y, { align: 'right' });

    y += 8;

    // Total que deixou de faturar
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL QUE DEIXOU DE FATURAR (VENDAS NÃO REALIZADAS):', m + 5, y);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text(`R$ ${totalDeixouFaturar.toFixed(2)}`, w - m - 5, y, { align: 'right' });

    y += 8;

    // Lucro que deixou de ganhar
    const lucroDeixadoGanhar = totalDeixouFaturar - totalPrejuizo;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('LUCRO QUE DEIXOU DE GANHAR:', m + 5, y);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150, 0, 0);
    doc.text(`R$ ${lucroDeixadoGanhar.toFixed(2)}`, w - m - 5, y, { align: 'right' });

    y += resumoHeight + 10;

    // Quantidade total de itens perdidos
    const totalItens = itensPerda.reduce((sum, item) => sum + item.quantidade, 0);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Total de itens perdidos: ${totalItens}`, w / 2, y, { align: 'center' });
    y += 5;
    doc.text('Documento gerado pelo sistema Order Flow - Para uso interno', w / 2, y, { align: 'center' });

    doc.save(`Relatorio_Perdas_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h1 className="text-2xl font-bold text-gray-900">Relatório de Perdas</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Produtos */}
          <div className="lg:col-span-2">
            <Card className="mb-6 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold flex-1">Selecionar Produtos</h2>
                {busca && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBusca('')}
                    className="h-8"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
              <Input
                type="text"
                placeholder="Buscar produtos por código ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                disabled={isLoading}
                className="mb-4"
              />

              {isLoading ? (
                <p className="text-gray-500 text-center py-4">Carregando...</p>
              ) : produtos.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhum produto encontrado</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {produtos.map((produto) => {
                    const itemNoCarrinho = itensPerda.find((item) => item.produto.id === produto.id);
                    return (
                      <Card
                        key={produto.id}
                        className={`p-3 cursor-pointer transition-all ${
                          itemNoCarrinho 
                            ? 'bg-red-50 border-red-300 border-2' 
                            : 'hover:shadow-md'
                        }`}
                        onClick={() => adicionarItemPerda(produto)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500">{produto.codigo_interno}</p>
                            <h3 className="font-semibold text-gray-900 truncate">{produto.descricao}</h3>
                            <div className="flex gap-3 mt-2 text-xs">
                              <span className="text-gray-600">
                                Custo: <span className="font-semibold">R$ {produto.preco_custo.toFixed(2)}</span>
                              </span>
                              <span className="text-gray-600">
                                Venda: <span className="font-semibold">R$ {(produto.preco_venda || 0).toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                          {itemNoCarrinho && (
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded">
                              {itemNoCarrinho.quantidade} {produto.unidade_medida}
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Resumo das Perdas */}
          <div>
            <Card className="sticky top-4">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-5 h-5 text-red-600" />
                  <h2 className="text-lg font-bold">Itens com Perda</h2>
                </div>

                {itensPerda.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Nenhum item adicionado</p>
                    <p className="text-xs text-gray-400 mt-1">Clique nos produtos para adicionar</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                      {itensPerda.map((item) => (
                        <div key={item.produto.id} className="border rounded p-3 bg-red-50 border-red-200">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 text-sm">{item.produto.descricao}</p>
                              <p className="text-xs text-gray-500">
                                Custo unit: R$ {item.produto.preco_custo.toFixed(2)} | 
                                Venda: R$ {(item.produto.preco_venda || 0).toFixed(2)}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removerItemPerda(item.produto.id)}
                              className="ml-2"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              min="1"
                              step={item.produto.unidade_medida === 'KG' ? '0.001' : '1'}
                              value={quantidadeEditando[item.produto.id] ?? item.quantidade}
                              onChange={(e) => {
                                const valor = e.target.value;
                                // Permite digitar valores vazios ou números
                                if (valor === '' || /^\d*\.?\d*$/.test(valor)) {
                                  setQuantidadeEditando(prev => ({
                                    ...prev,
                                    [item.produto.id]: valor
                                  }));
                                }
                              }}
                              onFocus={() => iniciarEdicaoQuantidade(item.produto.id, item.quantidade)}
                              onBlur={() => handleBlurQuantidade(item.produto.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleBlurQuantidade(item.produto.id);
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-20 px-2 py-1 border border-red-300 rounded text-sm"
                            />
                            <span className="text-xs text-gray-500">{item.produto.unidade_medida}</span>
                            <span className="text-xs font-semibold text-red-600 ml-auto">
                              Prejuízo: R$ {(item.produto.preco_custo * item.quantidade).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totais */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total Prejuízo (Custo):</span>
                        <span className="text-lg font-bold text-red-600">
                          R$ {calcularTotalPrejuizo().toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Deixou de Faturar (Venda):</span>
                        <span className="text-lg font-bold text-orange-600">
                          R$ {calcularTotalDeixouFaturar().toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-red-100 rounded">
                        <span className="text-sm font-bold text-red-800">Lucro Não Ganho:</span>
                        <span className="text-lg font-bold text-red-800">
                          R$ {(calcularTotalDeixouFaturar() - calcularTotalPrejuizo()).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={gerarRelatorioPDF}
                      className="w-full mt-4 bg-red-600 hover:bg-red-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Gerar Relatório PDF
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