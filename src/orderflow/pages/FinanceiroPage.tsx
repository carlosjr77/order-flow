import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClienteAutocomplete } from '../components/financeiro/ClienteAutocomplete';
import { ExtratoClienteDialog } from '../components/financeiro/ExtratoClienteDialog';
import { FiltrosVendasCard, ValoresFiltro } from '../components/financeiro/FiltrosVendasCard';
import { ClienteResumo, RecebimentoModal } from '../components/financeiro/RecebimentoModal';
import { RelatorioClienteDialog } from '../components/financeiro/RelatorioClienteDialog';
import { apiClient } from '../services/api';
import {
  Cliente,
  FiltrosTitulos,
  PaginaTitulos,
  PaginaVendasSemCliente,
  StatusFinanceiro,
  TituloFinanceiro,
} from '../types';
import {
  COR_STATUS,
  OPCOES_STATUS_FINANCEIRO,
  ROTULO_STATUS,
  formatarData,
  formatarMoeda,
  mensagemErroApi,
} from '../utils/financeiro';

const LIMITE = 50;

const Paginacao: React.FC<{ pagina: number; total: number; limite: number; onMudar: (pagina: number) => void }> = ({
  pagina,
  total,
  limite,
  onMudar,
}) => {
  const paginas = Math.max(Math.ceil(total / limite), 1);
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-slate-600">
      <span>{total} registro(s)</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}>Anterior</Button>
        <span>Página {pagina} de {paginas}</span>
        <Button variant="outline" size="sm" disabled={pagina >= paginas} onClick={() => onMudar(pagina + 1)}>Próxima</Button>
      </div>
    </div>
  );
};

export const FinanceiroPage: React.FC = () => {
  const navigate = useNavigate();

  const [filtros, setFiltros] = useState<FiltrosTitulos>({ pagina: 1, limite: LIMITE });
  const [resultado, setResultado] = useState<PaginaTitulos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [semCliente, setSemCliente] = useState<PaginaVendasSemCliente | null>(null);
  const [paginaSemCliente, setPaginaSemCliente] = useState(1);
  const [textoVinculo, setTextoVinculo] = useState<Record<number, string>>({});
  const [clienteVinculo, setClienteVinculo] = useState<Record<number, Cliente>>({});
  const [vinculando, setVinculando] = useState<number | null>(null);
  const [erroVinculo, setErroVinculo] = useState('');

  const [versao, setVersao] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteModal, setClienteModal] = useState<ClienteResumo | null>(null);
  const [vendaModal, setVendaModal] = useState<number | null>(null);
  const [clienteExtrato, setClienteExtrato] = useState<number | null>(null);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [clienteRelatorio, setClienteRelatorio] = useState<ClienteResumo | null>(null);

  const abrirRelatorio = (cliente: ClienteResumo | null = null) => {
    setClienteRelatorio(cliente);
    setRelatorioAberto(true);
  };

  const atualizar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro('');
    apiClient
      .buscarTitulos(filtros)
      .then((dados) => {
        if (!cancelado) setResultado(dados);
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
  }, [filtros, versao]);

  useEffect(() => {
    let cancelado = false;
    apiClient
      .listarVendasSemCliente(paginaSemCliente, LIMITE)
      .then((dados) => {
        if (!cancelado) setSemCliente(dados);
      })
      .catch((e) => {
        if (!cancelado) setErroVinculo(mensagemErroApi(e));
      });
    return () => {
      cancelado = true;
    };
  }, [paginaSemCliente, versao]);

  const aplicarFiltros = (valores: ValoresFiltro) => {
    setFiltros({
      ...valores,
      status: valores.status as StatusFinanceiro | undefined,
      pagina: 1,
      limite: LIMITE,
    });
  };

  const abrirModal = (cliente: ClienteResumo | null = null, vendaId: number | null = null) => {
    setClienteModal(cliente);
    setVendaModal(vendaId);
    setModalAberto(true);
  };

  const receberTitulo = (titulo: TituloFinanceiro) => {
    if (titulo.cliente_id === null) return;
    abrirModal({ id: titulo.cliente_id, nome: titulo.cliente_nome ?? '' }, titulo.venda_id);
  };

  const vincular = async (vendaId: number) => {
    const cliente = clienteVinculo[vendaId];
    if (!cliente || vinculando !== null) return;
    setVinculando(vendaId);
    setErroVinculo('');
    try {
      await apiClient.vincularVendaCliente(vendaId, cliente.id);
      atualizar();
    } catch (e) {
      setErroVinculo(mensagemErroApi(e));
    } finally {
      setVinculando(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-emerald-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" aria-label="Voltar ao painel" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
              <p className="text-sm text-gray-600">Títulos, recebimentos e extrato por cliente.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => abrirRelatorio()}>
              <FileText className="w-4 h-4 mr-2" />Relatório por cliente
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700" onClick={() => abrirModal()}>
              <Plus className="w-4 h-4 mr-2" />Registrar recebimento
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="titulos">
          <TabsList>
            <TabsTrigger value="titulos">Títulos</TabsTrigger>
            <TabsTrigger value="sem-cliente">Sem cliente{semCliente ? ` (${semCliente.total})` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="titulos" className="space-y-4">
            <FiltrosVendasCard opcoesStatus={OPCOES_STATUS_FINANCEIRO} onAplicar={aplicarFiltros} />

            {erro && <Card role="alert" className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">{erro}</Card>}

            {resultado && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4 border-slate-200">
                  <p className="text-xs text-slate-500">Valor original</p>
                  <p className="text-xl font-bold text-slate-900">{formatarMoeda(resultado.totais.valor_original)}</p>
                </Card>
                <Card className="p-4 border-slate-200">
                  <p className="text-xs text-slate-500">Valor pago</p>
                  <p className="text-xl font-bold text-emerald-700">{formatarMoeda(resultado.totais.valor_pago)}</p>
                </Card>
                <Card className="p-4 border-slate-200">
                  <p className="text-xs text-slate-500">Saldo em aberto</p>
                  <p className="text-xl font-bold text-red-700">{formatarMoeda(resultado.totais.saldo)}</p>
                </Card>
              </div>
            )}

            <Card className="p-5 border-slate-200">
              {carregando && !resultado ? (
                <p className="py-8 text-center text-sm text-slate-500">Carregando títulos...</p>
              ) : !resultado || resultado.itens.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Nenhum título encontrado para os filtros informados.</p>
              ) : (
                <>
                  <div className={`overflow-x-auto ${carregando ? 'opacity-60' : ''}`}>
                    <table className="w-full min-w-[960px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="text-left py-2 pr-3">Cliente</th>
                          <th className="text-left py-2 pr-3">Documento</th>
                          <th className="text-left py-2 pr-3">Nº</th>
                          <th className="text-left py-2 pr-3">Emissão</th>
                          <th className="text-left py-2 pr-3">Vencimento</th>
                          <th className="text-right py-2 pr-3">Original</th>
                          <th className="text-right py-2 pr-3">Pago</th>
                          <th className="text-right py-2 pr-3">Saldo</th>
                          <th className="text-left py-2 pr-3">Status</th>
                          <th className="text-right py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.itens.map((titulo) => (
                          <tr key={titulo.venda_id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-800">{titulo.cliente_nome || 'Não informado'}</td>
                            <td className="py-2 pr-3 text-slate-600">{titulo.cliente_documento || '-'}</td>
                            <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{titulo.descricao}</td>
                            <td className="py-2 pr-3 text-slate-600">{formatarData(titulo.data_emissao)}</td>
                            <td className="py-2 pr-3 text-slate-600">{formatarData(titulo.data_vencimento)}</td>
                            <td className="py-2 pr-3 text-right">{formatarMoeda(titulo.valor_original)}</td>
                            <td className="py-2 pr-3 text-right">{formatarMoeda(titulo.valor_pago)}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{formatarMoeda(titulo.saldo)}</td>
                            <td className="py-2 pr-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${COR_STATUS[titulo.status_financeiro]}`}>
                                {ROTULO_STATUS[titulo.status_financeiro]}
                              </span>
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {titulo.cliente_id === null ? (
                                <span className="text-xs text-amber-700">Vincule na aba "Sem cliente"</span>
                              ) : (
                                <div className="flex justify-end gap-2">
                                  {titulo.saldo > 0 && (
                                    <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={() => receberTitulo(titulo)}>Receber</Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => setClienteExtrato(titulo.cliente_id)}>Ver extrato</Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Paginacao
                    pagina={resultado.pagina}
                    total={resultado.total}
                    limite={resultado.limite}
                    onMudar={(pagina) => setFiltros((atuais) => ({ ...atuais, pagina }))}
                  />
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="sem-cliente">
            <Card className="p-5 border-slate-200">
              <p className="text-sm text-slate-600 mb-4">
                Vendas sem nome de cliente ou com mais de um cadastro de mesmo nome. Elas só entram no extrato depois de vinculadas. As pendentes aparecem primeiro.
              </p>
              {erroVinculo && <p role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{erroVinculo}</p>}
              {!semCliente ? (
                <p className="py-8 text-center text-sm text-slate-500">Carregando vendas...</p>
              ) : semCliente.itens.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Todas as vendas estão vinculadas a um cliente.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="text-left py-2 pr-3">Pedido</th>
                          <th className="text-left py-2 pr-3">Nome na venda</th>
                          <th className="text-left py-2 pr-3">Emissão</th>
                          <th className="text-right py-2 pr-3">Valor</th>
                          <th className="text-left py-2 pr-3">Status</th>
                          <th className="text-left py-2 w-96">Vincular ao cliente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semCliente.itens.map((venda) => (
                          <tr key={venda.venda_id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-800">#{venda.venda_id}</td>
                            <td className="py-2 pr-3 text-slate-600">{venda.nome_cliente || 'Não informado'}</td>
                            <td className="py-2 pr-3 text-slate-600">{formatarData(venda.data_emissao)}</td>
                            <td className="py-2 pr-3 text-right">{formatarMoeda(venda.valor_total)}</td>
                            <td className="py-2 pr-3 text-slate-600">{venda.status}</td>
                            <td className="py-2">
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <ClienteAutocomplete
                                    valor={textoVinculo[venda.venda_id] ?? ''}
                                    placeholder="Buscar cliente"
                                    onValorChange={(texto) => {
                                      setTextoVinculo((atuais) => ({ ...atuais, [venda.venda_id]: texto }));
                                      setClienteVinculo(({ [venda.venda_id]: _removido, ...restantes }) => restantes);
                                    }}
                                    onSelecionar={(cliente) => {
                                      setTextoVinculo((atuais) => ({ ...atuais, [venda.venda_id]: cliente.nome }));
                                      setClienteVinculo((atuais) => ({ ...atuais, [venda.venda_id]: cliente }));
                                    }}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  className="h-10"
                                  disabled={!clienteVinculo[venda.venda_id] || vinculando !== null}
                                  onClick={() => void vincular(venda.venda_id)}
                                >
                                  {vinculando === venda.venda_id ? 'Vinculando...' : 'Vincular'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Paginacao
                    pagina={semCliente.pagina}
                    total={semCliente.total}
                    limite={semCliente.limite}
                    onMudar={setPaginaSemCliente}
                  />
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <RecebimentoModal
        aberto={modalAberto}
        clienteInicial={clienteModal}
        vendaInicialId={vendaModal}
        onFechar={() => setModalAberto(false)}
        onSalvo={(clienteId) => {
          setModalAberto(false);
          atualizar();
          setClienteExtrato(clienteId);
        }}
      />

      <ExtratoClienteDialog
        clienteId={clienteExtrato}
        versao={versao}
        onFechar={() => setClienteExtrato(null)}
        onAlterado={atualizar}
        onReceber={(cliente) => {
          setClienteExtrato(null);
          abrirModal(cliente);
        }}
        onRelatorio={(cliente) => {
          setClienteExtrato(null);
          abrirRelatorio(cliente);
        }}
      />

      <RelatorioClienteDialog
        aberto={relatorioAberto}
        clienteInicial={clienteRelatorio}
        onFechar={() => setRelatorioAberto(false)}
      />
    </div>
  );
};
