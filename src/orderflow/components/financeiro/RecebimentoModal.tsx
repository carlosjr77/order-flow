import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiClient } from '../../services/api';
import { Cliente, ExtratoCliente } from '../../types';
import {
  Distribuicao,
  FORMAS_RECEBIMENTO,
  centavosParaTexto,
  dataDeHoje,
  formatarCentavos,
  formatarData,
  formatarMoeda,
  mensagemErroApi,
  paraCentavos,
  resumirDistribuicao,
  sugerirDistribuicao,
  textoParaCentavos,
} from '../../utils/financeiro';
import { ClienteAutocomplete } from './ClienteAutocomplete';

export interface ClienteResumo {
  id: number;
  nome: string;
}

interface RecebimentoModalProps {
  aberto: boolean;
  clienteInicial?: ClienteResumo | null;
  vendaInicialId?: number | null;
  onFechar: () => void;
  onSalvo: (clienteId: number) => void;
}

const paraValoresTexto = (distribuicao: Distribuicao): Record<number, string> =>
  Object.fromEntries(
    Object.entries(distribuicao).map(([id, centavos]) => [id, centavosParaTexto(centavos).replace('.', ',')])
  );

const CLASSE_SELECT =
  'w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

export const RecebimentoModal: React.FC<RecebimentoModalProps> = ({
  aberto,
  clienteInicial,
  vendaInicialId,
  onFechar,
  onSalvo,
}) => {
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [textoCliente, setTextoCliente] = useState('');
  const [extrato, setExtrato] = useState<ExtratoCliente | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [data, setData] = useState(dataDeHoje());
  const [forma, setForma] = useState<string>(FORMAS_RECEBIMENTO[0]);
  const [valorTexto, setValorTexto] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [valores, setValores] = useState<Record<number, string>>({});
  const [editadoManual, setEditadoManual] = useState(false);
  const [creditoId, setCreditoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setCliente(clienteInicial ?? null);
    setTextoCliente(clienteInicial?.nome ?? '');
    setData(dataDeHoje());
    setForma(FORMAS_RECEBIMENTO[0]);
    setValorTexto('');
    setObservacoes('');
    setValores({});
    setEditadoManual(false);
    setCreditoId(null);
    setErro('');
    setExtrato(null);
  }, [aberto, clienteInicial]);

  useEffect(() => {
    if (!aberto || !cliente) {
      setExtrato(null);
      return;
    }
    let cancelado = false;
    setExtrato(null);
    setCarregando(true);
    setErro('');
    apiClient
      .obterExtratoCliente(cliente.id)
      .then((dados) => {
        if (cancelado) return;
        setExtrato(dados);
        const titulo = dados.titulos.find((t) => t.venda_id === vendaInicialId && t.saldo > 0);
        if (titulo && clienteInicial?.id === cliente.id) {
          const texto = centavosParaTexto(paraCentavos(titulo.saldo)).replace('.', ',');
          setValorTexto(texto);
          setValores({ [titulo.venda_id]: texto });
          setEditadoManual(true);
        }
      })
      .catch((e) => {
        if (!cancelado) setErro(mensagemErroApi(e));
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, cliente, clienteInicial, vendaInicialId]);

  const titulos = useMemo(() => (extrato?.titulos ?? []).filter((t) => t.saldo > 0), [extrato]);
  const creditos = useMemo(() => (extrato?.recebimentos ?? []).filter((r) => r.valor_disponivel > 0), [extrato]);
  const creditoSelecionado = creditos.find((r) => r.id === creditoId) ?? null;

  const valorCentavos = creditoSelecionado
    ? paraCentavos(creditoSelecionado.valor_disponivel)
    : textoParaCentavos(valorTexto) ?? 0;

  useEffect(() => {
    if (!editadoManual) setValores(paraValoresTexto(sugerirDistribuicao(titulos, valorCentavos)));
  }, [titulos, valorCentavos, editadoManual]);

  const { distribuicao, invalidas } = useMemo(() => {
    const resultado: Distribuicao = {};
    const notasInvalidas = new Set<number>();
    titulos.forEach((titulo) => {
      const texto = (valores[titulo.venda_id] ?? '').trim();
      if (!texto) return;
      const centavos = textoParaCentavos(texto);
      if (centavos === null || centavos > paraCentavos(titulo.saldo)) {
        notasInvalidas.add(titulo.venda_id);
      } else if (centavos > 0) {
        resultado[titulo.venda_id] = centavos;
      }
    });
    return { distribuicao: resultado, invalidas: notasInvalidas };
  }, [titulos, valores]);

  const resumo = resumirDistribuicao(valorCentavos, distribuicao);
  const alocacoes = Object.entries(distribuicao).map(([id, centavos]) => ({
    venda_id: Number(id),
    valor: centavosParaTexto(centavos),
  }));

  const problema = (() => {
    if (!cliente) return 'Selecione o cliente.';
    if (valorCentavos <= 0) return 'Informe o valor recebido.';
    if (invalidas.size > 0) return 'Há nota com valor inválido ou maior que o saldo.';
    if (resumo.excedente > 0) return 'O valor distribuído é maior que o valor recebido.';
    if (creditoSelecionado && alocacoes.length === 0) return 'Informe em quais notas usar o crédito.';
    return '';
  })();

  const usarNomeDigitado = async () => {
    const nome = textoCliente.trim();
    if (cliente || nome.length < 2 || resolvendo) return;
    setResolvendo(true);
    setErro('');
    try {
      const resolvido = await apiClient.resolverCliente(nome);
      setTextoCliente(resolvido.nome);
      setCliente({ id: resolvido.id, nome: resolvido.nome });
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setResolvendo(false);
    }
  };

  const salvar = async () => {
    if (problema || !cliente || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      if (creditoSelecionado) {
        await apiClient.alocarRecebimento(creditoSelecionado.id, alocacoes);
      } else {
        await apiClient.registrarRecebimento({
          cliente_id: cliente.id,
          data_pagamento: data,
          forma_pagamento: forma,
          valor_total: centavosParaTexto(valorCentavos),
          observacoes: observacoes.trim() || null,
          alocacoes,
        });
      }
      onSalvo(cliente.id);
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && !salvando && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>
            Distribua o valor entre as notas. O que não for distribuído fica como crédito do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="recebimento-cliente" className="block text-xs font-medium text-gray-700 mb-1">Cliente</label>
            <ClienteAutocomplete
              id="recebimento-cliente"
              valor={textoCliente}
              onValorChange={(texto) => {
                setTextoCliente(texto);
                setCliente(null);
                setCreditoId(null);
                setValores({});
                setEditadoManual(false);
              }}
              onSelecionar={(selecionado: Cliente) => {
                setTextoCliente(selecionado.nome);
                setCliente({ id: selecionado.id, nome: selecionado.nome });
                setCreditoId(null);
                setValores({});
                setEditadoManual(false);
              }}
              onEnter={() => void usarNomeDigitado()}
            />
            {!cliente && textoCliente.trim().length >= 2 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={resolvendo}
                onClick={() => void usarNomeDigitado()}
              >
                {resolvendo ? 'Verificando...' : `Usar "${textoCliente.trim()}" (cadastra se ainda não existir)`}
              </Button>
            )}
          </div>

          {creditos.length > 0 && (
            <div>
              <label htmlFor="recebimento-origem" className="block text-xs font-medium text-gray-700 mb-1">Origem do valor</label>
              <select
                id="recebimento-origem"
                className={CLASSE_SELECT}
                value={creditoId ?? ''}
                onChange={(e) => {
                  setCreditoId(e.target.value ? Number(e.target.value) : null);
                  setEditadoManual(false);
                }}
              >
                <option value="">Novo recebimento</option>
                {creditos.map((credito) => (
                  <option key={credito.id} value={credito.id}>
                    Usar crédito de {formatarMoeda(credito.valor_disponivel)} ({credito.forma_pagamento}, {formatarData(credito.data_pagamento)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!creditoSelecionado && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="recebimento-data" className="block text-xs font-medium text-gray-700 mb-1">Data do pagamento</label>
                <Input id="recebimento-data" type="date" max={dataDeHoje()} value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div>
                <label htmlFor="recebimento-forma" className="block text-xs font-medium text-gray-700 mb-1">Forma</label>
                <select id="recebimento-forma" className={CLASSE_SELECT} value={forma} onChange={(e) => setForma(e.target.value)}>
                  {FORMAS_RECEBIMENTO.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="recebimento-valor" className="block text-xs font-medium text-gray-700 mb-1">Valor recebido (R$)</label>
                <Input
                  id="recebimento-valor"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="recebimento-obs" className="block text-xs font-medium text-gray-700 mb-1">Observações (opcional)</label>
                <Input id="recebimento-obs" maxLength={255} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>
            </div>
          )}

          {cliente && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-slate-800">Notas com saldo</h3>
                <Button type="button" variant="outline" size="sm" disabled={titulos.length === 0} onClick={() => setEditadoManual(false)}>
                  Sugerir pelo vencimento mais antigo
                </Button>
              </div>
              {carregando || (!extrato && !erro) ? (
                <p className="text-sm text-slate-500 py-4 text-center">Carregando notas...</p>
              ) : titulos.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Este cliente não tem notas com saldo. O valor ficará como crédito.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2">Nota</th>
                        <th className="text-left px-3 py-2">Vencimento</th>
                        <th className="text-right px-3 py-2">Saldo</th>
                        <th className="text-right px-3 py-2 w-36">Valor a abater</th>
                      </tr>
                    </thead>
                    <tbody>
                      {titulos.map((titulo) => (
                        <tr key={titulo.venda_id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{titulo.descricao}</td>
                          <td className="px-3 py-2 text-slate-600">{formatarData(titulo.data_vencimento)}</td>
                          <td className="px-3 py-2 text-right">{formatarMoeda(titulo.saldo)}</td>
                          <td className="px-3 py-2">
                            <Input
                              aria-label={`Valor a abater em ${titulo.descricao}`}
                              inputMode="decimal"
                              className={`text-right ${invalidas.has(titulo.venda_id) ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                              value={valores[titulo.venda_id] ?? ''}
                              onChange={(e) => {
                                setEditadoManual(true);
                                setValores((atuais) => ({ ...atuais, [titulo.venda_id]: e.target.value }));
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Recebido</p>
              <p className="font-semibold text-slate-900">{formatarCentavos(valorCentavos)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Distribuído</p>
              <p className={`font-semibold ${resumo.excedente > 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatarCentavos(resumo.alocado)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{creditoSelecionado ? 'Crédito restante' : 'Vira crédito'}</p>
              <p className="font-semibold text-emerald-700">{formatarCentavos(resumo.credito)}</p>
            </div>
          </div>

          {erro && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          {!erro && problema && (cliente || valorTexto) && <p className="text-sm text-amber-700">{problema}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>Cancelar</Button>
            <Button type="button" className="bg-sky-600 hover:bg-sky-700" disabled={Boolean(problema) || salvando || carregando} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : 'Salvar recebimento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
