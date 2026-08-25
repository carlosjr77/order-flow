import React, { useState } from 'react';
import { apiClient } from '../services/api';
import { SugestaoTabelaResponse, TabelaPreco, Produto } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Wand2, Upload, X, AlertCircle, AlertTriangle, CheckCircle2, FileText, Search } from 'lucide-react';

interface SugestaoTabelaModalProps {
  tabelasPreco: TabelaPreco[];
  onAplicar: (tabelaId: number) => void;
  onClose: () => void;
}

const TIPOS_ACEITOS = '.pdf,.png,.jpg,.jpeg,.webp';

export const SugestaoTabelaModal: React.FC<SugestaoTabelaModalProps> = ({
  tabelasPreco,
  onAplicar,
  onClose,
}) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoColado, setTextoColado] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<SugestaoTabelaResponse | null>(null);

  // Correção manual de itens não localizados
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<Produto[]>([]);
  const [linhaEmCorrecao, setLinhaEmCorrecao] = useState<number | null>(null);
  const [buscaProdutoManual, setBuscaProdutoManual] = useState('');

  const handleAnalisar = async () => {
    if (!arquivo && !textoColado.trim()) {
      setErro('Envie um arquivo ou cole o texto do pedido/nota para análise.');
      return;
    }

    setIsLoading(true);
    setErro('');
    setResultado(null);

    try {
      const formData = new FormData();
      if (arquivo) formData.append('arquivo', arquivo);
      if (textoColado.trim()) formData.append('texto', textoColado.trim());

      const data = (await apiClient.sugerirTabelaPreco(formData)) as SugestaoTabelaResponse;
      setResultado(data);
      const produtos = (await apiClient.listarProdutos(0, 1000)) as Produto[];
      setProdutosDisponiveis(produtos);
    } catch (error: any) {
      let mensagem = 'Erro ao analisar o conteúdo enviado.';
      if (error?.message) {
        try {
          const jsonError = JSON.parse(error.message);
          mensagem = jsonError.detail || jsonError.message || mensagem;
        } catch {
          mensagem = error.message;
        }
      }
      setErro(mensagem);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAplicar = () => {
    if (resultado?.tabela_sugerida) {
      onAplicar(resultado.tabela_sugerida.id);
    }
  };

  const calcularPrecoNaTabela = (produto: Produto, tabelaId: number): number | null => {
    const tabela = tabelasPreco.find((t) => t.id === tabelaId);
    if (!tabela) return null;
    const excecao = tabela.itens.find((i) => i.produto_id === produto.id);
    const margem = excecao ? excecao.margem_especifica_percentual : tabela.margem_geral_percentual;
    return Number((produto.preco_custo * (1 + margem / 100)).toFixed(2));
  };

  const selecionarProdutoManualmente = (index: number, produto: Produto) => {
    if (!resultado) return;

    const precosPorTabela: Record<string, number | null> = {};
    resultado.tabelas_analisadas.forEach((tabela) => {
      precosPorTabela[String(tabela.id)] = calcularPrecoNaTabela(produto, tabela.id);
    });

    const precoSugerido = precosPorTabela[String(resultado.tabela_sugerida.id)];
    const precoNota = resultado.comparativo[index].preco_nota;
    const diferencaValor = precoSugerido !== null && precoSugerido !== undefined ? Number((precoSugerido - precoNota).toFixed(2)) : null;
    const diferencaPercentual = diferencaValor !== null && precoNota ? Number(((diferencaValor / precoNota) * 100).toFixed(2)) : null;

    setResultado({
      ...resultado,
      comparativo: resultado.comparativo.map((item, i) =>
        i === index
          ? {
              ...item,
              produto_id: produto.id,
              produto_descricao: produto.descricao,
              precos_por_tabela: precosPorTabela,
              diferenca_valor: diferencaValor,
              diferenca_percentual: diferencaPercentual,
              aviso_unidade: null,
            }
          : item
      ),
    });
    setLinhaEmCorrecao(null);
    setBuscaProdutoManual('');
  };

  const produtosFiltradosParaCorrecao = produtosDisponiveis.filter((produto) => {
    if (!buscaProdutoManual.trim()) return true;
    const termo = buscaProdutoManual.toLowerCase();
    return (
      produto.descricao.toLowerCase().includes(termo) ||
      produto.codigo_interno.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            Assistente de Sugestão de Tabela
          </h2>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {!resultado && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arquivo (PDF ou imagem da nota/pedido)
              </label>
              <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded p-3 cursor-pointer hover:bg-gray-50">
                <Upload className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {arquivo ? arquivo.name : 'Selecionar arquivo (.pdf, .png, .jpg, .jpeg, .webp)'}
                </span>
                <input
                  type="file"
                  accept={TIPOS_ACEITOS}
                  className="hidden"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                />
              </label>
              {arquivo && (
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  className="text-xs text-red-600 mt-1"
                >
                  Remover arquivo
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ou cole o texto do pedido/nota (ex: lista de WhatsApp)
              </label>
              <Textarea
                value={textoColado}
                onChange={(e) => setTextoColado(e.target.value)}
                placeholder={'Ex:\nCebola 2kg - R$ 8,50\n3x Arroz 5kg R$ 25,00\nTomate 10un 4,20'}
                rows={6}
              />
            </div>

            {erro && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <Button
              onClick={handleAnalisar}
              disabled={isLoading}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              {isLoading ? 'Analisando...' : 'Analisar e Sugerir Tabela'}
            </Button>
          </div>
        )}

        {resultado && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border-2 border-green-300 rounded">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-5 h-5 text-green-700" />
                <p className="text-sm font-semibold text-green-800">Tabela Sugerida</p>
              </div>
              <p className="text-lg font-bold text-gray-900">{resultado.tabela_sugerida.nome}</p>
              <p className="text-sm text-gray-700 mt-2">{resultado.motivo}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Memória de Cálculo
              </p>
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Item Reconhecido</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-700">Unidade</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Preço na Nota</th>
                      {resultado.tabelas_analisadas.map((tabela) => (
                        <th key={tabela.id} className="px-3 py-2 text-right font-medium text-gray-700">
                          Preço {tabela.nome}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Diferença (R$)</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Diferença (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resultado.comparativo.map((item, index) => (
                      <tr
                        key={index}
                        className={item.aviso_unidade ? 'bg-red-50' : !item.produto_id ? 'bg-red-50' : undefined}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{item.item_reconhecido}</p>
                          {item.aviso_unidade ? (
                            <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              {item.aviso_unidade}
                            </p>
                          ) : item.produto_descricao ? (
                            <p className="text-xs text-gray-500">→ {item.produto_descricao}</p>
                          ) : (
                            <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              Item não localizado no cadastro
                            </p>
                          )}

                          {!item.produto_id && (
                            <div className="mt-1">
                              {linhaEmCorrecao === index ? (
                                <div className="border border-gray-200 rounded bg-white shadow-sm p-2 w-64">
                                  <div className="relative mb-2">
                                    <Search className="absolute left-2 top-2 w-3 h-3 text-gray-400" />
                                    <Input
                                      autoFocus
                                      value={buscaProdutoManual}
                                      onChange={(e) => setBuscaProdutoManual(e.target.value)}
                                      placeholder="Buscar produto..."
                                      className="h-7 pl-6 text-xs"
                                    />
                                  </div>
                                  <div className="max-h-32 overflow-y-auto">
                                    {produtosFiltradosParaCorrecao.length === 0 ? (
                                      <p className="text-xs text-gray-500 p-1">Nenhum produto encontrado</p>
                                    ) : (
                                      produtosFiltradosParaCorrecao.slice(0, 20).map((produto) => (
                                        <button
                                          key={produto.id}
                                          type="button"
                                          onClick={() => selecionarProdutoManualmente(index, produto)}
                                          className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                        >
                                          {produto.descricao}{' '}
                                          <span className="text-gray-400">
                                            ({produto.codigo_interno} • {produto.unidade_medida})
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLinhaEmCorrecao(null);
                                      setBuscaProdutoManual('');
                                    }}
                                    className="text-xs text-gray-500 mt-1"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinhaEmCorrecao(index);
                                    setBuscaProdutoManual('');
                                  }}
                                  className="text-xs text-blue-600 underline"
                                >
                                  Selecionar produto manualmente
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">{item.unidade}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          R$ {item.preco_nota.toFixed(2)}
                        </td>
                        {resultado.tabelas_analisadas.map((tabela) => {
                          const preco = item.precos_por_tabela[String(tabela.id)];
                          return (
                            <td key={tabela.id} className="px-3 py-2 text-right text-gray-700">
                              {preco !== null && preco !== undefined ? `R$ ${preco.toFixed(2)}` : '—'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {item.diferenca_valor !== null && item.diferenca_valor !== undefined
                            ? `R$ ${item.diferenca_valor.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {item.diferenca_percentual !== null && item.diferenca_percentual !== undefined
                            ? `${item.diferenca_percentual.toFixed(2)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setResultado(null);
                  setErro('');
                }}
                className="flex-1"
              >
                Analisar Novamente
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleAplicar} className="flex-1 bg-green-600 hover:bg-green-700">
                Aplicar Tabela Sugerida
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
