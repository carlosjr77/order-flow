import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Pencil, Save, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustoProdutoDialog, ProdutoCusto } from '../components/compras/CustoProdutoDialog';
import { DebitosClientesCard } from '../components/compras/DebitosClientesCard';
import { ExtratoClienteDialog } from '../components/financeiro/ExtratoClienteDialog';
import { apiClient } from '../services/api';
import { ConsolidadoProdutos, OrigemCusto, ProdutoAgrupadoItem, ProdutosAgrupados } from '../types';
import {
  OPCOES_PERIODO,
  PresetPeriodoCompras,
  ROTULO_ORIGEM_CUSTO,
  baixarArquivo,
  calcularSugestao,
  formatarQuantidade,
  gerarCsvCompras,
  periodoDoPreset,
  textoParaQuantidade,
} from '../utils/compras';
import { formatarData, formatarMoeda, mensagemErroApi, textoParaCentavos } from '../utils/financeiro';
import { gerarListaComprasPdf } from '../utils/gerarRelatorioCompras';

const CORES_UNIDADE: Record<string, string> = {
  KG: 'bg-emerald-100 text-emerald-800',
  SC: 'bg-amber-100 text-amber-800',
  CX: 'bg-sky-100 text-sky-800',
  UN: 'bg-violet-100 text-violet-800',
};

const SeloUnidade: React.FC<{ unidade: string }> = ({ unidade }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${CORES_UNIDADE[unidade] ?? 'bg-slate-100 text-slate-700'}`}>
    {unidade}
  </span>
);

const Indicador: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="rounded-lg bg-white p-3 shadow-sm">
    <p className="text-xs text-slate-500">{rotulo}</p>
    <p className="text-lg font-bold text-slate-900">{valor}</p>
  </div>
);

const Termos: React.FC<{ valor: string; onMudar: (v: string) => void; onEnter: () => void; id: string }> = ({ valor, onMudar, onEnter, id }) => (
  <label className="text-sm block" htmlFor={id}>
    <span className="block font-medium text-slate-700 mb-1">Produtos (separe por vírgula)</span>
    <Input
      id={id}
      placeholder="Ex.: laranja, limão, tomate"
      value={valor}
      maxLength={300}
      onChange={(e) => onMudar(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
    />
  </label>
);

// ---------------------------------------------------------------- aba 1: consolidado do período

const AbaConsolidado: React.FC<{ onEditarCusto: (p: ProdutoCusto) => void; versao: number }> = ({ onEditarCusto, versao }) => {
  const inicial = periodoDoPreset('7d');
  const [termo, setTermo] = useState('');
  const [preset, setPreset] = useState<PresetPeriodoCompras>('7d');
  const [dataInicio, setDataInicio] = useState(inicial.inicio);
  const [dataFim, setDataFim] = useState(inicial.fim);
  const [tabelaId, setTabelaId] = useState('');
  const [incluirCanceladas, setIncluirCanceladas] = useState(false);
  const [tabelas, setTabelas] = useState<{ id: number; nome: string }[]>([]);
  const [diasCobertura, setDiasCobertura] = useState('7');
  const [descontarEstoque, setDescontarEstoque] = useState(true);
  const [ajustes, setAjustes] = useState<Record<number, string>>({});
  const [dados, setDados] = useState<ConsolidadoProdutos | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [apenasComSugestao, setApenasComSugestao] = useState(false);

  useEffect(() => {
    apiClient.listarTabelasPreco(0, 100, true).then((t) => setTabelas(t as { id: number; nome: string }[])).catch(() => setTabelas([]));
  }, []);

  const mudarPreset = (valor: PresetPeriodoCompras) => {
    setPreset(valor);
    if (valor !== 'personalizado') {
      const p = periodoDoPreset(valor);
      setDataInicio(p.inicio);
      setDataFim(p.fim);
    }
  };

  const consultar = async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await apiClient.consolidadoProdutos({
        data_inicio: dataInicio,
        data_fim: dataFim,
        termo,
        tabela_preco_id: tabelaId ? Number(tabelaId) : undefined,
        incluir_canceladas: incluirCanceladas,
      }));
      setAjustes({});
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setCarregando(false);
    }
  };

  // Recarrega com os mesmos filtros quando um custo é alterado
  useEffect(() => {
    if (versao > 0 && dados) consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  const dias = Math.max(textoParaQuantidade(diasCobertura) ?? 0, 0);
  const sugestoes = useMemo(() => {
    const mapa: Record<number, number> = {};
    dados?.grupos.forEach((g) => g.itens.forEach((item) => {
      const ajuste = ajustes[item.produto_id];
      const manual = ajuste !== undefined ? textoParaQuantidade(ajuste) : null;
      mapa[item.produto_id] = manual ?? calcularSugestao(item, dias, descontarEstoque);
    }));
    return mapa;
  }, [dados, ajustes, dias, descontarEstoque]);

  const nomeArquivo = (ext: string) => `lista-compras-${dataInicio}-a-${dataFim}.${ext}`;

  return (
    <div className="space-y-4">
      <Card className="p-4 border-0 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <Termos id="termo-consolidado" valor={termo} onMudar={setTermo} onEnter={consultar} />
          </div>
          <label className="text-sm md:col-span-2">
            <span className="block font-medium text-slate-700 mb-1">Período</span>
            <select className="w-full h-10 px-3 border border-slate-300 rounded-md bg-white" value={preset} onChange={(e) => mudarPreset(e.target.value as PresetPeriodoCompras)}>
              {OPCOES_PERIODO.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block font-medium text-slate-700 mb-1">De</span>
            <Input type="date" value={dataInicio} onChange={(e) => { setPreset('personalizado'); setDataInicio(e.target.value); }} />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block font-medium text-slate-700 mb-1">Até</span>
            <Input type="date" value={dataFim} onChange={(e) => { setPreset('personalizado'); setDataFim(e.target.value); }} />
          </label>
          <div className="md:col-span-2">
            <Button className="w-full bg-teal-700 hover:bg-teal-800" disabled={carregando} onClick={consultar}>
              <Search className="w-4 h-4 mr-2" />{carregando ? 'Consultando...' : 'Consultar'}
            </Button>
          </div>
          <label className="text-sm md:col-span-3">
            <span className="block font-medium text-slate-700 mb-1">Tabela de preço (opcional)</span>
            <select className="w-full h-10 px-3 border border-slate-300 rounded-md bg-white" value={tabelaId} onChange={(e) => setTabelaId(e.target.value)}>
              <option value="">Todas</option>
              {tabelas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-4 h-10">
            <input type="checkbox" checked={incluirCanceladas} onChange={(e) => setIncluirCanceladas(e.target.checked)} />
            Incluir pedidos cancelados
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Usa a data de entrega do pedido e, quando não houver, a data do pedido (igual ao Relatório de Vendas).
          Deixe os produtos em branco para ver tudo o que saiu.
        </p>
      </Card>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Indicador rotulo="Pedidos no período" valor={String(dados.totais.pedidos)} />
            <Indicador rotulo="Produtos diferentes" valor={String(dados.totais.produtos)} />
            <Indicador rotulo="Faturamento" valor={formatarMoeda(dados.totais.faturamento)} />
            <Indicador rotulo="Custo" valor={formatarMoeda(dados.totais.custo)} />
            <Indicador rotulo="Lucro bruto" valor={formatarMoeda(dados.totais.lucro)} />
          </div>

          <Card className="p-4 border-0 shadow-sm flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="block font-medium text-slate-700 mb-1">Comprar para quantos dias?</span>
              <Input className="w-28" inputMode="numeric" value={diasCobertura} onChange={(e) => setDiasCobertura(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 h-10">
              <input type="checkbox" checked={descontarEstoque} onChange={(e) => setDescontarEstoque(e.target.checked)} />
              Descontar o estoque atual
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 h-10">
              <input type="checkbox" checked={apenasComSugestao} onChange={(e) => setApenasComSugestao(e.target.checked)} />
              No PDF, só itens a comprar
            </label>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => baixarArquivo(gerarCsvCompras(dados, sugestoes), nomeArquivo('csv'))}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />Planilha (CSV)
              </Button>
              <Button
                className="bg-teal-700 hover:bg-teal-800"
                onClick={() => gerarListaComprasPdf({ consolidado: dados, sugestoes, diasCobertura: dias, apenasComSugestao }).save(nomeArquivo('pdf'))}
              >
                <Download className="w-4 h-4 mr-2" />Lista de compras (PDF)
              </Button>
            </div>
            <p className="w-full text-xs text-slate-500">
              Sugestão = média por dia × dias {descontarEstoque ? '− estoque atual' : ''}. Saca, caixa e unidade são arredondadas para cima.
              Você pode digitar outro valor na coluna “Comprar”.
            </p>
          </Card>

          {dados.termos_sem_resultado.length > 0 && (
            <p className="text-sm text-amber-700">Sem saídas no período para: {dados.termos_sem_resultado.join(', ')}.</p>
          )}
          {dados.grupos.length === 0 && <p className="text-sm text-slate-600">Nenhuma saída encontrada nesse período.</p>}

          {dados.grupos.map((grupo) => (
            <Card key={grupo.termo} className="p-4 border-0 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 className="text-lg font-bold text-slate-900 capitalize">{grupo.termo}</h3>
                <div className="flex flex-wrap gap-2">
                  {grupo.subtotais_por_unidade.map((s) => (
                    <span key={s.unidade} className="text-sm text-slate-700 bg-slate-50 rounded px-2 py-1">
                      <SeloUnidade unidade={s.unidade} /> <strong>{formatarQuantidade(s.quantidade)}</strong> no período ·{' '}
                      {formatarQuantidade(s.media_diaria)}/dia
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500 border-b">
                      <th className="py-2 pr-2">Produto</th>
                      <th className="py-2 px-2">Un</th>
                      <th className="py-2 px-2 text-right">Saiu</th>
                      <th className="py-2 px-2 text-right">Média/dia</th>
                      <th className="py-2 px-2 text-right">Pedidos</th>
                      <th className="py-2 px-2 text-right">Estoque</th>
                      <th className="py-2 px-2 text-right">Custo atual</th>
                      <th className="py-2 px-2 text-right">Comprar</th>
                      <th className="py-2 pl-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.itens.map((item) => (
                      <tr key={item.produto_id} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          <p className="font-medium text-slate-900">{item.descricao}</p>
                          <p className="text-xs text-slate-500">
                            {item.codigo_interno}
                            {item.ultima_saida ? ` · última saída ${formatarData(item.ultima_saida)}` : ''}
                          </p>
                        </td>
                        <td className="py-2 px-2"><SeloUnidade unidade={item.unidade_medida} /></td>
                        <td className="py-2 px-2 text-right font-semibold">{formatarQuantidade(item.quantidade)}</td>
                        <td className="py-2 px-2 text-right">{formatarQuantidade(item.media_diaria)}</td>
                        <td className="py-2 px-2 text-right">{item.pedidos}</td>
                        <td className="py-2 px-2 text-right">{formatarQuantidade(item.estoque_atual)}</td>
                        <td className="py-2 px-2 text-right">{formatarMoeda(item.preco_custo_atual)}</td>
                        <td className="py-2 px-2 text-right">
                          <Input
                            aria-label={`Quantidade a comprar de ${item.descricao}`}
                            className="w-24 ml-auto text-right h-8"
                            inputMode="decimal"
                            value={ajustes[item.produto_id] ?? formatarQuantidade(sugestoes[item.produto_id] ?? 0)}
                            onChange={(e) => setAjustes({ ...ajustes, [item.produto_id]: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Atualizar custo"
                            onClick={() => onEditarCusto({
                              produto_id: item.produto_id,
                              descricao: item.descricao,
                              unidade_medida: item.unidade_medida,
                              preco_custo: item.preco_custo_atual,
                            })}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- aba 2: variações e preços

const AbaVariacoes: React.FC<{ onEditarCusto: (p: ProdutoCusto) => void; versao: number }> = ({ onEditarCusto, versao }) => {
  const [termo, setTermo] = useState('');
  const [dados, setDados] = useState<ProdutosAgrupados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const buscar = async () => {
    if (termo.trim().length < 2) {
      setErro('Digite ao menos 2 letras.');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      setDados(await apiClient.listarProdutosAgrupados(termo));
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (versao > 0 && dados) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  const tabelas = useMemo(() => {
    const nomes = new Map<number, string>();
    dados?.grupos.forEach((g) => g.itens.forEach((i) => i.precos_tabelas.forEach((p) => nomes.set(p.tabela_preco_id, p.tabela_nome))));
    return Array.from(nomes, ([id, nome]) => ({ id, nome }));
  }, [dados]);

  return (
    <div className="space-y-4">
      <Card className="p-4 border-0 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1"><Termos id="termo-variacoes" valor={termo} onMudar={setTermo} onEnter={buscar} /></div>
          <Button className="bg-teal-700 hover:bg-teal-800" disabled={carregando} onClick={buscar}>
            <Search className="w-4 h-4 mr-2" />{carregando ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Mostra todas as variações cadastradas (KG, saca, caixa, unidade) e o preço de venda em cada tabela ativa.
          Não diferencia acentos: “limao” encontra “Limão”.
        </p>
      </Card>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {dados?.termos_sem_resultado.length ? (
        <p className="text-sm text-amber-700">Nenhum produto cadastrado para: {dados.termos_sem_resultado.join(', ')}.</p>
      ) : null}
      {dados?.limite_atingido && <p className="text-sm text-amber-700">Muitos resultados: refine o termo para ver todos.</p>}

      {dados?.grupos.map((grupo) => (
        <Card key={grupo.termo} className="p-4 border-0 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="text-lg font-bold text-slate-900 capitalize">{grupo.termo}</h3>
            <div className="flex flex-wrap gap-2 text-sm text-slate-700">
              {grupo.unidades.map((u) => (
                <span key={u.unidade} className="bg-slate-50 rounded px-2 py-1">
                  <SeloUnidade unidade={u.unidade} /> {u.produtos} produto(s) · estoque {formatarQuantidade(u.estoque)}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b">
                  <th className="py-2 pr-2">Produto</th>
                  <th className="py-2 px-2">Un</th>
                  <th className="py-2 px-2 text-right">Estoque</th>
                  <th className="py-2 px-2 text-right">Custo</th>
                  {tabelas.map((t) => <th key={t.id} className="py-2 px-2 text-right">{t.nome}</th>)}
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {grupo.itens.map((item: ProdutoAgrupadoItem) => (
                  <tr key={item.produto_id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <p className="font-medium text-slate-900">{item.descricao}</p>
                      <p className="text-xs text-slate-500">{item.codigo_interno}</p>
                    </td>
                    <td className="py-2 px-2"><SeloUnidade unidade={item.unidade_medida} /></td>
                    <td className="py-2 px-2 text-right">{formatarQuantidade(item.estoque_atual)}</td>
                    <td className="py-2 px-2 text-right font-semibold">{formatarMoeda(item.preco_custo)}</td>
                    {tabelas.map((t) => {
                      const preco = item.precos_tabelas.find((p) => p.tabela_preco_id === t.id);
                      return (
                        <td key={t.id} className="py-2 px-2 text-right" title={preco ? `Margem ${preco.margem_percentual}%${preco.excecao ? ' (exceção do produto)' : ''}` : ''}>
                          {preco ? formatarMoeda(preco.preco) : '-'}
                          {preco?.excecao && <span className="ml-1 text-[10px] text-orange-600 align-super">exc</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2 text-right">
                      <Button variant="ghost" size="sm" title="Atualizar custo" onClick={() => onEditarCusto(item)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- aba 3: custos em lote

const AbaCustosLote: React.FC<{ onSalvo: () => void }> = ({ onSalvo }) => {
  const [termo, setTermo] = useState('');
  const [produtos, setProdutos] = useState<ProdutoAgrupadoItem[]>([]);
  const [novos, setNovos] = useState<Record<number, string>>({});
  const [origem, setOrigem] = useState<OrigemCusto>('ceasa_sem_nf');
  const [observacao, setObservacao] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  const buscar = async (manterMensagem = false) => {
    if (termo.trim().length < 2) {
      setErro('Digite ao menos 2 letras.');
      return;
    }
    setCarregando(true);
    setErro('');
    if (!manterMensagem) setMensagem('');
    try {
      const dados = await apiClient.listarProdutosAgrupados(termo);
      const unicos = new Map<number, ProdutoAgrupadoItem>();
      dados.grupos.forEach((g) => g.itens.forEach((i) => unicos.set(i.produto_id, i)));
      setProdutos(Array.from(unicos.values()));
      setNovos({});
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setCarregando(false);
    }
  };

  const alterados = produtos
    .map((p) => {
      const texto = novos[p.produto_id];
      if (texto === undefined || !texto.trim()) return null;
      const centavos = textoParaCentavos(texto);
      return { produto: p, centavos };
    })
    .filter((x): x is { produto: ProdutoAgrupadoItem; centavos: number | null } => x !== null);
  const invalidos = alterados.filter((a) => a.centavos === null);

  const salvar = async () => {
    if (!alterados.length || invalidos.length) return;
    setSalvando(true);
    setErro('');
    try {
      const resultado = await apiClient.atualizarCustosEmLote(
        alterados.map((a) => ({ produto_id: a.produto.produto_id, preco_custo: (a.centavos as number) / 100 })),
        origem,
        observacao.trim(),
      );
      onSalvo();
      await buscar(true);
      setMensagem(`${resultado.alterados} custo(s) atualizado(s)${resultado.sem_alteracao ? `, ${resultado.sem_alteracao} já estava(m) com o mesmo valor` : ''}.`);
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border-0 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1"><Termos id="termo-lote" valor={termo} onMudar={setTermo} onEnter={buscar} /></div>
          <Button variant="outline" disabled={carregando} onClick={() => buscar()}>
            <Search className="w-4 h-4 mr-2" />{carregando ? 'Buscando...' : 'Buscar produtos'}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Use depois da compra, quando ainda não chegou a nota: digite o valor pago por unidade de cada produto e salve tudo de uma vez.
          Cada alteração fica no histórico e na auditoria.
        </p>
      </Card>

      {produtos.length > 0 && (
        <Card className="p-4 border-0 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b">
                  <th className="py-2 pr-2">Produto</th>
                  <th className="py-2 px-2">Un</th>
                  <th className="py-2 px-2 text-right">Custo atual</th>
                  <th className="py-2 px-2 text-right">Novo custo (R$)</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => {
                  const texto = novos[p.produto_id] ?? '';
                  const invalido = texto.trim() !== '' && textoParaCentavos(texto) === null;
                  return (
                    <tr key={p.produto_id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-slate-900">{p.descricao}</p>
                        <p className="text-xs text-slate-500">{p.codigo_interno}</p>
                      </td>
                      <td className="py-2 px-2"><SeloUnidade unidade={p.unidade_medida} /></td>
                      <td className="py-2 px-2 text-right">{formatarMoeda(p.preco_custo)}</td>
                      <td className="py-2 px-2 text-right">
                        <Input
                          aria-label={`Novo custo de ${p.descricao}`}
                          className={`w-28 ml-auto text-right h-8 ${invalido ? 'border-red-500' : ''}`}
                          inputMode="decimal"
                          placeholder={p.preco_custo.toFixed(2).replace('.', ',')}
                          value={texto}
                          onChange={(e) => setNovos({ ...novos, [p.produto_id]: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <label className="text-sm md:col-span-3">
              <span className="block font-medium text-slate-700 mb-1">Origem</span>
              <select className="w-full h-10 px-3 border border-slate-300 rounded-md bg-white" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemCusto)}>
                {(Object.keys(ROTULO_ORIGEM_CUSTO) as OrigemCusto[]).map((o) => <option key={o} value={o}>{ROTULO_ORIGEM_CUSTO[o]}</option>)}
              </select>
            </label>
            <label className="text-sm md:col-span-6">
              <span className="block font-medium text-slate-700 mb-1">Observação (vale para todos)</span>
              <Input maxLength={255} placeholder="Ex.: CEASA 22/11, fornecedor Box 12" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            <div className="md:col-span-3">
              <Button className="w-full bg-teal-700 hover:bg-teal-800" disabled={salvando || !alterados.length || invalidos.length > 0} onClick={salvar}>
                <Save className="w-4 h-4 mr-2" />{salvando ? 'Salvando...' : `Salvar ${alterados.length || ''} custo(s)`}
              </Button>
            </div>
          </div>
          {invalidos.length > 0 && <p className="text-sm text-red-600 mt-2">Corrija os valores em vermelho (ex.: 3,50).</p>}
        </Card>
      )}
      {mensagem && <p className="text-sm text-emerald-700">{mensagem}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
};

// ---------------------------------------------------------------- página

export const ComprasPage: React.FC = () => {
  const navigate = useNavigate();
  const [produtoCusto, setProdutoCusto] = useState<ProdutoCusto | null>(null);
  const [versao, setVersao] = useState(0);
  const [clienteExtrato, setClienteExtrato] = useState<number | null>(null);
  const atualizar = () => setVersao((v) => v + 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-emerald-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center gap-4">
          <Button variant="outline" size="sm" aria-label="Voltar ao painel" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Planejamento de Compras</h1>
            <p className="text-sm text-gray-600">O que saiu no período, variações por unidade e tabela, custos e débitos.</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 min-w-0">
          <Tabs defaultValue="consolidado">
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="consolidado">Consolidado do período</TabsTrigger>
              <TabsTrigger value="variacoes">Variações e preços</TabsTrigger>
              <TabsTrigger value="custos">Atualizar custos</TabsTrigger>
            </TabsList>
            <TabsContent value="consolidado"><AbaConsolidado onEditarCusto={setProdutoCusto} versao={versao} /></TabsContent>
            <TabsContent value="variacoes"><AbaVariacoes onEditarCusto={setProdutoCusto} versao={versao} /></TabsContent>
            <TabsContent value="custos"><AbaCustosLote onSalvo={atualizar} /></TabsContent>
          </Tabs>
        </div>
        <aside className="lg:col-span-1">
          <DebitosClientesCard versao={versao} onAbrirCliente={setClienteExtrato} onAbrirFinanceiro={() => navigate('/financeiro')} />
        </aside>
      </main>

      <CustoProdutoDialog produto={produtoCusto} onFechar={() => setProdutoCusto(null)} onSalvo={atualizar} />
      <ExtratoClienteDialog
        clienteId={clienteExtrato}
        versao={versao}
        onFechar={() => setClienteExtrato(null)}
        onAlterado={atualizar}
        onReceber={() => navigate('/financeiro')}
        onRelatorio={() => navigate('/financeiro')}
      />
    </div>
  );
};
