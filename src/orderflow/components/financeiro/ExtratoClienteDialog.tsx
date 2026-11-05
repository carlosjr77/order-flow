import React, { useCallback, useEffect, useState } from 'react';
import { Download, MessageCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../services/api';
import { ExtratoCliente } from '../../types';
import {
  COR_STATUS,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  formatarData,
  formatarMoeda,
  mensagemErroApi,
} from '../../utils/financeiro';
import { enviarExtratoWhatsApp, gerarExtratoClientePdf, nomeArquivoExtrato } from '../../utils/gerarExtratoCliente';

interface ExtratoClienteDialogProps {
  clienteId: number | null;
  versao: number;
  onFechar: () => void;
  onAlterado: () => void;
  onReceber: (cliente: { id: number; nome: string }) => void;
}

const Cartao: React.FC<{ titulo: string; valor: string; destaque?: string }> = ({ titulo, valor, destaque = 'text-slate-900' }) => (
  <div className="rounded-md border border-slate-200 p-3">
    <p className="text-xs text-slate-500">{titulo}</p>
    <p className={`text-lg font-bold ${destaque}`}>{valor}</p>
  </div>
);

export const ExtratoClienteDialog: React.FC<ExtratoClienteDialogProps> = ({
  clienteId,
  versao,
  onFechar,
  onAlterado,
  onReceber,
}) => {
  const { isAdmin } = useAuth();
  const [extrato, setExtrato] = useState<ExtratoCliente | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [estornoId, setEstornoId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [estornando, setEstornando] = useState(false);

  const carregar = useCallback(async () => {
    if (clienteId === null) return;
    setCarregando(true);
    setErro('');
    try {
      setExtrato(await apiClient.obterExtratoCliente(clienteId));
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    setExtrato(null);
    setAviso('');
    setEstornoId(null);
    setMotivo('');
    void carregar();
  }, [carregar, versao]);

  const exportarPdf = () => {
    if (!extrato) return;
    gerarExtratoClientePdf(extrato).save(nomeArquivoExtrato(extrato));
  };

  const enviarWhatsApp = async () => {
    if (!extrato) return;
    setErro('');
    try {
      const precisaAnexar = await enviarExtratoWhatsApp(extrato);
      setAviso(precisaAnexar ? 'O PDF foi baixado. Anexe o arquivo na conversa do WhatsApp que foi aberta.' : '');
    } catch (e) {
      setErro(mensagemErroApi(e));
    }
  };

  const confirmarEstorno = async () => {
    if (estornoId === null || !motivo.trim() || estornando) return;
    setEstornando(true);
    setErro('');
    try {
      await apiClient.estornarRecebimento(estornoId, motivo.trim());
      setEstornoId(null);
      setMotivo('');
      await carregar();
      onAlterado();
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setEstornando(false);
    }
  };

  const resumo = extrato?.resumo;

  return (
    <Dialog open={clienteId !== null} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extrato do cliente{extrato ? `: ${extrato.cliente.nome}` : ''}</DialogTitle>
          <DialogDescription>
            {extrato?.cliente.documento ? `CPF/CNPJ: ${extrato.cliente.documento}. ` : ''}Valores calculados no momento da consulta.
          </DialogDescription>
        </DialogHeader>

        {erro && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {aviso && <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-800">{aviso}</p>}
        {carregando && !extrato && <p className="py-8 text-center text-sm text-slate-500">Carregando extrato...</p>}

        {extrato && resumo && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button className="bg-sky-600 hover:bg-sky-700" onClick={() => onReceber({ id: extrato.cliente.id, nome: extrato.cliente.nome })}>
                <Plus className="w-4 h-4 mr-2" />Registrar recebimento
              </Button>
              <Button variant="outline" onClick={exportarPdf}>
                <Download className="w-4 h-4 mr-2" />Exportar PDF
              </Button>
              <Button variant="outline" onClick={() => void enviarWhatsApp()}>
                <MessageCircle className="w-4 h-4 mr-2" />Enviar por WhatsApp
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Cartao titulo="Total bruto de notas" valor={formatarMoeda(resumo.total_bruto)} />
              <Cartao titulo="Em aberto nas notas" valor={formatarMoeda(resumo.total_em_aberto)} />
              <Cartao
                titulo="Total recebido"
                valor={formatarMoeda(resumo.total_recebido)}
              />
              <Cartao titulo="Crédito disponível" valor={formatarMoeda(resumo.credito_disponivel)} destaque="text-emerald-700" />
              {resumo.saldo_liquido < 0 ? (
                <Cartao titulo="Saldo a favor do cliente" valor={formatarMoeda(-resumo.saldo_liquido)} destaque="text-emerald-700" />
              ) : (
                <Cartao titulo="Saldo devedor atual" valor={formatarMoeda(resumo.saldo_liquido)} destaque="text-red-700" />
              )}
            </div>
            <p className="text-xs text-slate-500">
              Dos pagamentos recebidos, {formatarMoeda(resumo.total_recebido_avulso)} foram parciais ou avulsos.
            </p>

            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Notas</h3>
              {extrato.titulos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma nota vinculada a este cliente.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2">Vencimento</th>
                        <th className="text-right px-3 py-2">Valor original</th>
                        <th className="text-right px-3 py-2">Valor pago</th>
                        <th className="text-right px-3 py-2">Saldo</th>
                        <th className="text-left px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extrato.titulos.map((titulo) => (
                        <tr key={titulo.venda_id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{formatarData(titulo.data_emissao)}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{titulo.descricao}</td>
                          <td className="px-3 py-2">{formatarData(titulo.data_vencimento)}</td>
                          <td className="px-3 py-2 text-right">{formatarMoeda(titulo.valor_original)}</td>
                          <td className="px-3 py-2 text-right">{formatarMoeda(titulo.valor_pago)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatarMoeda(titulo.saldo)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${COR_STATUS[titulo.status_financeiro]}`}>
                              {ROTULO_STATUS[titulo.status_financeiro]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Recebimentos</h3>
              {extrato.recebimentos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum recebimento registrado.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Forma</th>
                        <th className="text-left px-3 py-2">Lançamento</th>
                        <th className="text-right px-3 py-2">Valor</th>
                        <th className="text-right px-3 py-2">Disponível</th>
                        <th className="text-left px-3 py-2">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extrato.recebimentos.map((recebimento) => (
                        <React.Fragment key={recebimento.id}>
                          <tr className={`border-t border-slate-100 ${recebimento.estornado_em ? 'text-slate-400' : ''}`}>
                            <td className="px-3 py-2">{formatarData(recebimento.data_pagamento)}</td>
                            <td className="px-3 py-2">{recebimento.forma_pagamento}</td>
                            <td className="px-3 py-2">{ROTULO_ORIGEM[recebimento.origem]}</td>
                            <td className={`px-3 py-2 text-right ${recebimento.estornado_em ? 'line-through' : ''}`}>
                              {formatarMoeda(recebimento.valor_total)}
                            </td>
                            <td className="px-3 py-2 text-right">{formatarMoeda(recebimento.valor_disponivel)}</td>
                            <td className="px-3 py-2">
                              {recebimento.estornado_em ? (
                                <span title={recebimento.motivo_estorno || undefined}>
                                  Estornado: {recebimento.motivo_estorno}
                                </span>
                              ) : isAdmin ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => {
                                    setEstornoId(recebimento.id);
                                    setMotivo('');
                                  }}
                                >
                                  Estornar
                                </Button>
                              ) : (
                                'Ativo'
                              )}
                            </td>
                          </tr>
                          {estornoId === recebimento.id && (
                            <tr className="bg-red-50">
                              <td colSpan={6} className="px-3 py-3">
                                <label htmlFor="motivo-estorno" className="block text-xs font-medium text-red-800 mb-1">
                                  Motivo do estorno de {formatarMoeda(recebimento.valor_total)}. As notas quitadas por este recebimento serão reabertas.
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <Input
                                    id="motivo-estorno"
                                    className="flex-1 min-w-[200px] bg-white"
                                    maxLength={255}
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                  />
                                  <Button variant="outline" disabled={estornando} onClick={() => setEstornoId(null)}>Voltar</Button>
                                  <Button
                                    className="bg-red-600 hover:bg-red-700"
                                    disabled={!motivo.trim() || estornando}
                                    onClick={() => void confirmarEstorno()}
                                  >
                                    {estornando ? 'Estornando...' : 'Confirmar estorno'}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
