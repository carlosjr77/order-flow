import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Venda } from '../types';

export type VendaRelatorio = Venda & {
  usuario_nome?: string;
  itens?: Array<{
    id: number;
    produto_id: number;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    descricao?: string;
    codigo_interno?: string;
    unidade_medida?: string;
    preco_custo?: number;
  }>;
};

export interface DadosRelatorioVendasPdf {
  vendas: VendaRelatorio[];
  dataInicio: string;
  dataFim: string;
  status: string;
  operador: string;
  incluirCanceladasNosIndicadores: boolean;
  indicadores: {
    faturamentoTotal: number;
    totalFrete: number;
    receitaSemFrete: number;
    totalCusto: number;
    lucroBruto: number;
    margemLucro: number;
    ticketMedio: number;
    totalVendas: number;
  };
}

type DocumentoComTabela = jsPDF & {
  lastAutoTable?: { finalY: number };
};

const formatarMoeda = (valor: number) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatarData = (valor?: string) => {
  if (!valor) return '-';
  const data = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00`)
    : new Date(valor);
  return Number.isNaN(data.getTime()) ? '-' : data.toLocaleDateString('pt-BR');
};

const normalizarStatus = (status?: string) => {
  if (!status) return '-';
  return status.toLowerCase() === 'concluido' ? 'concluído' : status;
};

const adicionarRodape = (doc: DocumentoComTabela) => {
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Order Flow - Relatório de Vendas | Página ${pagina} de ${paginas}`, 14, 290);
  }
};

export const gerarRelatorioVendasPdf = (dados: DadosRelatorioVendasPdf): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4') as DocumentoComTabela;
  const vendasConsideradas = dados.incluirCanceladasNosIndicadores
    ? dados.vendas
    : dados.vendas.filter((venda) => normalizarStatus(venda.status) !== 'cancelado');

  doc.setProperties({
    title: `Relatório de Vendas ${dados.dataInicio} a ${dados.dataFim}`,
    subject: 'Relatório completo de vendas e itens',
    author: 'Order Flow',
  });
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório Completo de Vendas', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Período: ${formatarData(dados.dataInicio)} a ${formatarData(dados.dataFim)}`, 14, 25);
  doc.text(`Status: ${dados.status} | Operador: ${dados.operador}`, 14, 30);
  doc.text(`Vendas filtradas: ${dados.vendas.length} | Itens detalhados: ${dados.vendas.reduce((total, venda) => total + (venda.itens?.length || 0), 0)}`, 14, 35);

  autoTable(doc, {
    startY: 41,
    head: [['Indicador', 'Valor']],
    body: [
      ['Faturamento das vendas consideradas', formatarMoeda(dados.indicadores.faturamentoTotal)],
      ['Receita sem frete', formatarMoeda(dados.indicadores.receitaSemFrete)],
      ['Frete', formatarMoeda(dados.indicadores.totalFrete)],
      ['Custo dos itens', formatarMoeda(dados.indicadores.totalCusto)],
      ['Lucro bruto', formatarMoeda(dados.indicadores.lucroBruto)],
      ['Margem de lucro', `${dados.indicadores.margemLucro.toFixed(2)}%`],
      ['Ticket médio', formatarMoeda(dados.indicadores.ticketMedio)],
      ['Vendas consideradas', String(dados.indicadores.totalVendas)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [14, 165, 233] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right' } },
  });

  let proximaLinha = (doc.lastAutoTable?.finalY || 41) + 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Resumo por venda', 14, proximaLinha);
  proximaLinha += 4;

  autoTable(doc, {
    startY: proximaLinha,
    head: [['Venda', 'Data', 'Cliente', 'Operador', 'Status', 'Pagamento', 'Itens', 'Total', 'Frete']],
    body: dados.vendas.map((venda) => [
      `#${venda.id}`,
      formatarData(venda.data_entrega || venda.data_venda),
      venda.nome_cliente || 'Consumidor final',
      venda.usuario_nome || 'Não informado',
      normalizarStatus(venda.status),
      venda.forma_pagamento || 'Não informado',
      String(venda.itens?.length || 0),
      formatarMoeda(Number(venda.valor_total || 0)),
      formatarMoeda(Number(venda.valor_frete || 0)),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110] },
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 12 }, 6: { halign: 'right', cellWidth: 11 }, 7: { halign: 'right', cellWidth: 21 }, 8: { halign: 'right', cellWidth: 19 } },
  });

  proximaLinha = (doc.lastAutoTable?.finalY || proximaLinha) + 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Detalhamento de todos os itens vendidos', 14, proximaLinha);
  proximaLinha += 4;

  const linhasItens = dados.vendas.flatMap((venda) => (venda.itens || []).map((item) => [
    `#${venda.id}`,
    formatarData(venda.data_entrega || venda.data_venda),
    item.codigo_interno || String(item.produto_id),
    item.descricao || `Produto ${item.produto_id}`,
    item.unidade_medida || 'UN',
    Number(item.quantidade || 0).toFixed(3),
    formatarMoeda(Number(item.valor_unitario || 0)),
    formatarMoeda(Number(item.valor_total || 0)),
    formatarMoeda(Number(venda.valor_total || 0)),
  ]));

  autoTable(doc, {
    startY: proximaLinha,
    head: [['Venda', 'Data', 'Código', 'Produto', 'Un.', 'Qtd.', 'Unitário', 'Total item', 'Total venda']],
    body: linhasItens.length > 0 ? linhasItens : [['-', '-', '-', 'Nenhum item encontrado', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [234, 88, 12] },
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 17 }, 4: { cellWidth: 9 }, 5: { halign: 'right', cellWidth: 15 }, 6: { halign: 'right', cellWidth: 21 }, 7: { halign: 'right', cellWidth: 21 }, 8: { halign: 'right', cellWidth: 21 } },
  });

  adicionarRodape(doc);
  return doc;
};
