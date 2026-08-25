import React, { useState } from 'react';
import { apiClient } from '../services/api';
import { SugestaoTabelaResponse, TabelaPreco } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Upload, X, AlertCircle, CheckCircle2, FileText } from 'lucide-react';

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
                      <tr key={index} className={!item.produto_id ? 'bg-amber-50' : undefined}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{item.item_reconhecido}</p>
                          <p className="text-xs text-gray-500">
                            {item.produto_descricao
                              ? `→ ${item.produto_descricao}`
                              : 'Produto não encontrado no catálogo'}
                          </p>
                        </td>
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
