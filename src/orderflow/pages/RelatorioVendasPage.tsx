import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  CircleDollarSign,
  Package,
  Percent,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient } from '../services/api';
import { Venda } from '../types';

type PresetPeriodo = '7d' | '30d' | 'mes' | 'custom';

type VendaDetalhada = Venda & {
  itens?: Array<{
    id: number;
    produto_id: number;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    descricao?: string;
    preco_custo?: number;
  }>;
};

const STATUS_CORES: Record<string, string> = {
  concluído: '#16a34a',
  pendente: '#eab308',
  cancelado: '#dc2626',
};

const CHART_PALETTE = ['#0ea5e9', '#14b8a6', '#f97316', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#64748b'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const parseDateSeguro = (valor?: string) => {
  if (!valor) return null;

  // Evita problemas de fuso em datas no formato YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const dataSomente = new Date(`${valor}T12:00:00`);
    return Number.isNaN(dataSomente.getTime()) ? null : dataSomente;
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const normalizarStatus = (status: string) => {
  if (!status) return '';
  const lower = status.toLowerCase();
  if (lower === 'concluido') return 'concluído';
  return lower;
};

const getDataReferenciaVenda = (venda: VendaDetalhada | Venda) => {
  return parseDateSeguro(venda.data_entrega) || parseDateSeguro(venda.data_venda) || new Date(0);
};

export const RelatorioVendasPage: React.FC = () => {
  const navigate = useNavigate();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasDetalhadas, setVendasDetalhadas] = useState<VendaDetalhada[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAplicandoFiltro, setIsAplicandoFiltro] = useState(false);
  const [erro, setErro] = useState('');

  const [presetPeriodo, setPresetPeriodo] = useState<PresetPeriodo>('30d');
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'concluído' | 'pendente' | 'cancelado'>('todos');
  const [operadorFiltro, setOperadorFiltro] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [incluirCanceladasNosIndicadores, setIncluirCanceladasNosIndicadores] = useState(false);

  const [ultimoPeriodoAplicado, setUltimoPeriodoAplicado] = useState({
    inicio: '',
    fim: '',
    preset: '30d' as PresetPeriodo,
  });

  useEffect(() => {
    const { inicio, fim } = calcularPeriodoPorPreset('30d');
    setDataInicio(inicio);
    setDataFim(fim);
    setUltimoPeriodoAplicado({ inicio, fim, preset: '30d' });
    carregarVendas(inicio, fim);
  }, []);

  const operadoresDisponiveis = useMemo(() => {
    const nomes = Array.from(
      new Set(vendas.map((v) => v.usuario_nome).filter((nome): nome is string => Boolean(nome && nome.trim())))
    );
    return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vendas]);

  const calcularPeriodoPorPreset = (preset: PresetPeriodo) => {
    const hoje = new Date();

    if (preset === 'mes') {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio: toInputDate(inicioMes), fim: toInputDate(hoje) };
    }

    if (preset === '7d') {
      const inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - 6);
      return { inicio: toInputDate(inicio), fim: toInputDate(hoje) };
    }

    if (preset === '30d') {
      const inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - 29);
      return { inicio: toInputDate(inicio), fim: toInputDate(hoje) };
    }

    return { inicio: dataInicio, fim: dataFim };
  };

  const carregarVendas = async (inicioFiltro?: string, fimFiltro?: string) => {
    try {
      setErro('');
      setIsLoading(true);
      const data = (await apiClient.listarVendas(0, 2000, undefined, true, true)) as VendaDetalhada[];
      const ordenadas = data.sort((a, b) => getDataReferenciaVenda(b).getTime() - getDataReferenciaVenda(a).getTime());
      setVendas(ordenadas);
      aplicarFiltros(
        ordenadas,
        inicioFiltro ?? dataInicio,
        fimFiltro ?? dataFim,
        statusFiltro,
        operadorFiltro
      );
    } catch (error: any) {
      setErro(error?.message || 'Erro ao carregar dados de vendas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrocarPreset = (preset: PresetPeriodo) => {
    setPresetPeriodo(preset);
    if (preset !== 'custom') {
      const periodo = calcularPeriodoPorPreset(preset);
      setDataInicio(periodo.inicio);
      setDataFim(periodo.fim);
    }
  };

  const aplicarFiltros = (
    base: VendaDetalhada[] = vendas as VendaDetalhada[],
    inicio = dataInicio,
    fim = dataFim,
    status = statusFiltro,
    operador = operadorFiltro
  ) => {
    if (!inicio || !fim) {
      setErro('Informe data inicial e final para aplicar o relatório.');
      return;
    }

    const inicioPeriodo = startOfDay(new Date(`${inicio}T00:00:00`));
    const fimPeriodo = endOfDay(new Date(`${fim}T00:00:00`));

    if (inicioPeriodo.getTime() > fimPeriodo.getTime()) {
      setErro('A data inicial não pode ser maior que a data final.');
      return;
    }

    setErro('');
    setIsAplicandoFiltro(true);

    const vendasFiltradas = base.filter((venda) => {
      const dataReferencia = getDataReferenciaVenda(venda);
      const dataOk = dataReferencia >= inicioPeriodo && dataReferencia <= fimPeriodo;
      const statusVenda = normalizarStatus(venda.status);
      const statusOk = status === 'todos' ? true : statusVenda === status;
      const operadorOk = operador === 'todos' ? true : (venda.usuario_nome || 'Não informado') === operador;
      return dataOk && statusOk && operadorOk;
    });

    setVendasDetalhadas(vendasFiltradas);
    setUltimoPeriodoAplicado({ inicio, fim, preset: presetPeriodo });
    setIsAplicandoFiltro(false);
  };

  const dadosCalculados = useMemo(() => {
    const vendasConsideradas = incluirCanceladasNosIndicadores
      ? vendasDetalhadas
      : vendasDetalhadas.filter((v) => normalizarStatus(v.status) !== 'cancelado');

    const faturamentoTotal = vendasConsideradas.reduce((acc, venda) => acc + Number(venda.valor_total || 0), 0);
    const totalFrete = vendasConsideradas.reduce((acc, venda) => acc + Number(venda.valor_frete || 0), 0);
    const receitaSemFrete = faturamentoTotal - totalFrete;

    const totalCusto = vendasConsideradas.reduce((acc, venda) => {
      const custoVenda = (venda.itens || []).reduce((sum, item) => {
        return sum + Number(item.preco_custo || 0) * Number(item.quantidade || 0);
      }, 0);
      return acc + custoVenda;
    }, 0);

    const lucroBruto = faturamentoTotal - totalCusto;
    const margemLucro = faturamentoTotal > 0 ? (lucroBruto / faturamentoTotal) * 100 : 0;
    const ticketMedio = vendasConsideradas.length > 0 ? faturamentoTotal / vendasConsideradas.length : 0;

    const statusAgg = vendasDetalhadas.reduce(
      (acc, venda) => {
        const key = normalizarStatus(venda.status) || 'outro';
        if (!acc[key]) {
          acc[key] = { status: key, quantidade: 0, valor: 0 };
        }
        acc[key].quantidade += 1;
        acc[key].valor += Number(venda.valor_total || 0);
        return acc;
      },
      {} as Record<string, { status: string; quantidade: number; valor: number }>
    );

    const pagamentoAgg = vendasConsideradas.reduce(
      (acc, venda) => {
        const key = venda.forma_pagamento || 'Não informado';
        if (!acc[key]) {
          acc[key] = { forma: key, quantidade: 0, valor: 0 };
        }
        acc[key].quantidade += 1;
        acc[key].valor += Number(venda.valor_total || 0);
        return acc;
      },
      {} as Record<string, { forma: string; quantidade: number; valor: number }>
    );

    const operadorAgg = vendasConsideradas.reduce(
      (acc, venda) => {
        const key = venda.usuario_nome || 'Não informado';
        if (!acc[key]) {
          acc[key] = { operador: key, vendas: 0, faturamento: 0 };
        }
        acc[key].vendas += 1;
        acc[key].faturamento += Number(venda.valor_total || 0);
        return acc;
      },
      {} as Record<string, { operador: string; vendas: number; faturamento: number }>
    );

    const produtosAgg = vendasConsideradas.reduce(
      (acc, venda) => {
        (venda.itens || []).forEach((item) => {
          const key = item.produto_id;
          if (!acc[key]) {
            acc[key] = {
              produtoId: key,
              descricao: item.descricao || `Produto ${key}`,
              quantidade: 0,
              faturamento: 0,
              custo: 0,
              lucro: 0,
            };
          }

          const quantidade = Number(item.quantidade || 0);
          const faturamentoItem = Number(item.valor_total || 0);
          const custoItem = Number(item.preco_custo || 0) * quantidade;

          acc[key].quantidade += quantidade;
          acc[key].faturamento += faturamentoItem;
          acc[key].custo += custoItem;
          acc[key].lucro += faturamentoItem - custoItem;
        });

        return acc;
      },
      {} as Record<number, {
        produtoId: number;
        descricao: string;
        quantidade: number;
        faturamento: number;
        custo: number;
        lucro: number;
      }>
    );

    const serieDiariaAgg = vendasConsideradas.reduce(
      (acc, venda) => {
        const data = getDataReferenciaVenda(venda);
        const key = toInputDate(data);
        if (!acc[key]) {
          acc[key] = { data: key, faturamento: 0, lucro: 0, vendas: 0 };
        }

        const custoVenda = (venda.itens || []).reduce((sum, item) => {
          return sum + Number(item.preco_custo || 0) * Number(item.quantidade || 0);
        }, 0);

        const faturamentoVenda = Number(venda.valor_total || 0);
        acc[key].faturamento += faturamentoVenda;
        acc[key].lucro += faturamentoVenda - custoVenda;
        acc[key].vendas += 1;
        return acc;
      },
      {} as Record<string, { data: string; faturamento: number; lucro: number; vendas: number }>
    );

    const serieDiaria = Object.values(serieDiariaAgg)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .map((item) => ({
        ...item,
        dataLabel: new Date(`${item.data}T12:00:00`).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }),
      }));

    const topProdutos = Object.values(produtosAgg)
      .sort((a, b) => b.lucro - a.lucro)
      .slice(0, 8);

    const statusData = Object.values(statusAgg).sort((a, b) => b.valor - a.valor);
    const pagamentoData = Object.values(pagamentoAgg).sort((a, b) => b.valor - a.valor).slice(0, 8);
    const rankingOperadores = Object.values(operadorAgg).sort((a, b) => b.faturamento - a.faturamento);

    const vendasCanceladas = vendasDetalhadas.filter((v) => normalizarStatus(v.status) === 'cancelado');
    const valorCancelado = vendasCanceladas.reduce((acc, v) => acc + Number(v.valor_total || 0), 0);
    const clientesUnicos = new Set(
      vendasConsideradas.map((v) => (v.nome_cliente || '').trim()).filter((nome) => Boolean(nome))
    ).size;

    const melhorDia = serieDiaria.reduce(
      (best, current) => (current.faturamento > best.faturamento ? current : best),
      { data: '-', dataLabel: '-', faturamento: 0, lucro: 0, vendas: 0 }
    );

    return {
      faturamentoTotal,
      totalFrete,
      receitaSemFrete,
      totalCusto,
      lucroBruto,
      margemLucro,
      ticketMedio,
      totalVendas: vendasConsideradas.length,
      statusData,
      pagamentoData,
      rankingOperadores,
      topProdutos,
      serieDiaria,
      valorCancelado,
      quantidadeCanceladas: vendasCanceladas.length,
      clientesUnicos,
      melhorDia,
    };
  }, [vendasDetalhadas, incluirCanceladasNosIndicadores]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50 to-emerald-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center gap-3">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Relatório de Vendas</h1>
              <p className="text-sm text-gray-600">
                Faturamento, lucro, desempenho e comparativos do período selecionado.
              </p>
            </div>
          </div>
          <Button onClick={() => carregarVendas(dataInicio, dataFim)} variant="outline" disabled={isLoading || isAplicandoFiltro}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {erro && (
          <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">
            {erro}
          </Card>
        )}

        <Card className="p-5 border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-sky-600" />
              Filtros do Relatório
            </h2>
            <p className="text-xs text-gray-500">
              Período aplicado: {ultimoPeriodoAplicado.inicio || '-'} até {ultimoPeriodoAplicado.fim || '-'}
            </p>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Regra de data: usa <span className="font-semibold">data de entrega</span> quando existir; caso contrário, usa a data de venda.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Período rápido</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant={presetPeriodo === '7d' ? 'default' : 'outline'}
                  className={presetPeriodo === '7d' ? 'bg-sky-600 hover:bg-sky-700' : ''}
                  onClick={() => handleTrocarPreset('7d')}
                >
                  7 dias
                </Button>
                <Button
                  type="button"
                  variant={presetPeriodo === '30d' ? 'default' : 'outline'}
                  className={presetPeriodo === '30d' ? 'bg-sky-600 hover:bg-sky-700' : ''}
                  onClick={() => handleTrocarPreset('30d')}
                >
                  30 dias
                </Button>
                <Button
                  type="button"
                  variant={presetPeriodo === 'mes' ? 'default' : 'outline'}
                  className={presetPeriodo === 'mes' ? 'bg-sky-600 hover:bg-sky-700' : ''}
                  onClick={() => handleTrocarPreset('mes')}
                >
                  Mês atual
                </Button>
                <Button
                  type="button"
                  variant={presetPeriodo === 'custom' ? 'default' : 'outline'}
                  className={presetPeriodo === 'custom' ? 'bg-sky-600 hover:bg-sky-700' : ''}
                  onClick={() => handleTrocarPreset('custom')}
                >
                  Customizado
                </Button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data inicial</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPresetPeriodo('custom');
                }}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data final</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPresetPeriodo('custom');
                }}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value as 'todos' | 'concluído' | 'pendente' | 'cancelado')}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="todos">Todos</option>
                <option value="concluído">Concluídas</option>
                <option value="pendente">Pendentes</option>
                <option value="cancelado">Canceladas</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Operador</label>
              <select
                value={operadorFiltro}
                onChange={(e) => setOperadorFiltro(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="todos">Todos</option>
                {operadoresDisponiveis.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={incluirCanceladasNosIndicadores}
                onChange={(e) => setIncluirCanceladasNosIndicadores(e.target.checked)}
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              Incluir vendas canceladas nos indicadores financeiros
            </label>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const periodo = calcularPeriodoPorPreset('30d');
                  setPresetPeriodo('30d');
                  setDataInicio(periodo.inicio);
                  setDataFim(periodo.fim);
                  setStatusFiltro('todos');
                  setOperadorFiltro('todos');
                  setIncluirCanceladasNosIndicadores(false);
                }}
              >
                Limpar filtros
              </Button>
              <Button
                className="bg-sky-600 hover:bg-sky-700"
                onClick={() => aplicarFiltros()}
                disabled={isLoading || isAplicandoFiltro}
              >
                {isAplicandoFiltro ? 'Aplicando...' : 'Aplicar filtros'}
              </Button>
            </div>
          </div>
        </Card>

        {isLoading || isAplicandoFiltro ? (
          <Card className="p-8 text-center text-gray-500">Carregando relatório...</Card>
        ) : vendasDetalhadas.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhuma venda encontrada para os filtros selecionados.</Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard
                icon={<CircleDollarSign className="w-6 h-6 text-sky-600" />}
                titulo="Faturamento"
                valor={formatCurrency(dadosCalculados.faturamentoTotal)}
                detalhe={`${dadosCalculados.totalVendas} vendas consideradas`}
              />
              <KpiCard
                icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
                titulo="Lucro Bruto"
                valor={formatCurrency(dadosCalculados.lucroBruto)}
                detalhe={`Margem: ${formatPercent(dadosCalculados.margemLucro)}`}
              />
              <KpiCard
                icon={<Package className="w-6 h-6 text-orange-600" />}
                titulo="Custo dos Itens"
                valor={formatCurrency(dadosCalculados.totalCusto)}
                detalhe={`Frete: ${formatCurrency(dadosCalculados.totalFrete)}`}
              />
              <KpiCard
                icon={<Users className="w-6 h-6 text-indigo-600" />}
                titulo="Ticket Médio"
                valor={formatCurrency(dadosCalculados.ticketMedio)}
                detalhe={`${dadosCalculados.clientesUnicos} clientes únicos`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <KpiCard
                icon={<Percent className="w-6 h-6 text-emerald-600" />}
                titulo="Receita sem Frete"
                valor={formatCurrency(dadosCalculados.receitaSemFrete)}
                detalhe={`Melhor dia: ${dadosCalculados.melhorDia.dataLabel}`}
              />
              <KpiCard
                icon={<CalendarRange className="w-6 h-6 text-red-600" />}
                titulo="Valor Cancelado"
                valor={formatCurrency(dadosCalculados.valorCancelado)}
                detalhe={`${dadosCalculados.quantidadeCanceladas} vendas canceladas`}
              />
              <KpiCard
                icon={<TrendingUp className="w-6 h-6 text-sky-600" />}
                titulo="Faturamento do Melhor Dia"
                valor={formatCurrency(dadosCalculados.melhorDia.faturamento)}
                detalhe={`Lucro no dia: ${formatCurrency(dadosCalculados.melhorDia.lucro)}`}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="p-5 border-slate-200">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Evolução Diária (Faturamento x Lucro)</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dadosCalculados.serieDiaria}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dataLabel" />
                      <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatCurrency(Number(value)), name]}
                        labelFormatter={(label) => `Data: ${label}`}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke="#0ea5e9" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#14b8a6" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5 border-slate-200">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Distribuição por Status (Valor)</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dadosCalculados.statusData}
                        dataKey="valor"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        label={({ status, percent }) => `${status} (${((percent || 0) * 100).toFixed(0)}%)`}
                      >
                        {dadosCalculados.statusData.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_CORES[entry.status] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="p-5 border-slate-200">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Top Produtos por Lucro</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosCalculados.topProdutos} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
                      <YAxis type="category" dataKey="descricao" width={160} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Bar dataKey="lucro" name="Lucro" radius={[0, 6, 6, 0]}>
                        {dadosCalculados.topProdutos.map((_, idx) => (
                          <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5 border-slate-200">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Formas de Pagamento</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosCalculados.pagamentoData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="forma" />
                      <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Bar dataKey="valor" name="Faturamento" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="p-5 border-slate-200 overflow-x-auto">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Ranking de Operadores</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="text-left py-2">Operador</th>
                      <th className="text-right py-2">Vendas</th>
                      <th className="text-right py-2">Faturamento</th>
                      <th className="text-right py-2">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosCalculados.rankingOperadores.map((operador) => {
                      const ticket = operador.vendas > 0 ? operador.faturamento / operador.vendas : 0;
                      return (
                        <tr key={operador.operador} className="border-b border-slate-100">
                          <td className="py-2 font-medium text-slate-700">{operador.operador}</td>
                          <td className="py-2 text-right text-slate-700">{operador.vendas}</td>
                          <td className="py-2 text-right text-slate-700">{formatCurrency(operador.faturamento)}</td>
                          <td className="py-2 text-right text-slate-700">{formatCurrency(ticket)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              <Card className="p-5 border-slate-200 overflow-x-auto">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Top Produtos (Detalhado)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="text-left py-2">Produto</th>
                      <th className="text-right py-2">Qtd</th>
                      <th className="text-right py-2">Faturamento</th>
                      <th className="text-right py-2">Lucro</th>
                      <th className="text-right py-2">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosCalculados.topProdutos.map((produto) => {
                      const margem = produto.faturamento > 0 ? (produto.lucro / produto.faturamento) * 100 : 0;
                      return (
                        <tr key={produto.produtoId} className="border-b border-slate-100">
                          <td className="py-2 font-medium text-slate-700">{produto.descricao}</td>
                          <td className="py-2 text-right text-slate-700">{produto.quantidade.toFixed(2)}</td>
                          <td className="py-2 text-right text-slate-700">{formatCurrency(produto.faturamento)}</td>
                          <td className="py-2 text-right text-slate-700">{formatCurrency(produto.lucro)}</td>
                          <td className="py-2 text-right text-slate-700">{formatPercent(margem)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  titulo: string;
  valor: string;
  detalhe: string;
}> = ({ icon, titulo, valor, detalhe }) => (
  <Card className="p-5 border-slate-200 bg-white/95">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm text-slate-600">{titulo}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{valor}</p>
        <p className="text-xs text-slate-500 mt-2">{detalhe}</p>
      </div>
      <div className="p-2 rounded-lg bg-slate-100">{icon}</div>
    </div>
  </Card>
);
