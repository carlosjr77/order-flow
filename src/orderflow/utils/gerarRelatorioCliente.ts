import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RelatorioCliente } from '../types';
import { ROTULO_STATUS, formatarData, formatarMoeda } from './financeiro';

type DocumentoComTabela = jsPDF & { lastAutoTable?: { finalY: number } };

const AZUL: [number, number, number] = [2, 132, 199];
const CINZA: [number, number, number] = [100, 116, 139];

export const descreverPeriodo = ({ periodo }: RelatorioCliente): string =>
  `${formatarData(periodo.data_inicio)} a ${formatarData(periodo.data_fim)} (por ${
    periodo.tipo_data === 'vencimento' ? 'vencimento' : 'emissão'
  })`;

export const nomeArquivoRelatorio = (relatorio: RelatorioCliente): string => {
  const nome = relatorio.cliente.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `Relatorio_${nome}_${relatorio.periodo.data_inicio}_a_${relatorio.periodo.data_fim}.pdf`;
};

/** Relatório de notas do cliente no período: cabeçalho, resumo, tabela detalhada e rodapé paginado. */
export const gerarRelatorioClientePdf = (relatorio: RelatorioCliente, nomeEmpresa?: string): jsPDF => {
  const pdf = new jsPDF('p', 'mm', 'a4') as DocumentoComTabela;
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const margem = 14;
  const { cliente, resumo } = relatorio;

  // Cabeçalho
  if (nomeEmpresa) {
    pdf.setFontSize(9);
    pdf.setTextColor(...CINZA);
    pdf.text(nomeEmpresa, margem, 14);
  }
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Relatório de Notas por Cliente', margem, 22);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Cliente: ${cliente.nome}`, margem, 30);
  pdf.text(`CPF/CNPJ: ${cliente.documento || 'Não informado'}`, margem, 35.5);
  pdf.text(`Período: ${descreverPeriodo(relatorio)}`, margem, 41);
  pdf.text(`Data de emissão: ${new Date(relatorio.gerado_em).toLocaleString('pt-BR')}`, margem, 46.5);

  // Resumo em quatro blocos
  const larguraBloco = (largura - margem * 2 - 9) / 4;
  const blocos: Array<[string, string, boolean]> = [
    ['Total de notas', String(resumo.quantidade), false],
    ['Valor total', formatarMoeda(resumo.valor_total), false],
    ['Valor pago', formatarMoeda(resumo.valor_pago), false],
    ['Valor pendente', formatarMoeda(resumo.saldo_pendente), true],
  ];
  blocos.forEach(([titulo, valor, destaque], indice) => {
    const x = margem + indice * (larguraBloco + 3);
    pdf.setDrawColor(203, 213, 225);
    pdf.setFillColor(destaque ? 254 : 248, destaque ? 242 : 250, destaque ? 242 : 252);
    pdf.roundedRect(x, 52, larguraBloco, 17, 1.5, 1.5, 'FD');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...CINZA);
    pdf.text(titulo, x + 3, 57.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(destaque ? 185 : 15, destaque ? 28 : 23, destaque ? 28 : 42);
    pdf.text(valor, x + 3, 65);
    pdf.setFont('helvetica', 'normal');
  });
  pdf.setTextColor(15, 23, 42);

  // Tabela detalhada, com totais na última página
  autoTable(pdf, {
    startY: 75,
    margin: { left: margem, right: margem, bottom: 18 },
    headStyles: { fillColor: AZUL },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 1.8 },
    showFoot: 'lastPage',
    head: [['Nota', 'Emissão', 'Vencimento', 'Status', 'Valor', 'Pago', 'Pendente']],
    body: relatorio.titulos.map((titulo) => [
      titulo.descricao,
      formatarData(titulo.data_emissao),
      formatarData(titulo.data_vencimento),
      ROTULO_STATUS[titulo.status_financeiro],
      formatarMoeda(titulo.valor_original),
      formatarMoeda(titulo.valor_pago),
      formatarMoeda(titulo.saldo),
    ]),
    foot: [[
      `Total (${resumo.quantidade} nota${resumo.quantidade === 1 ? '' : 's'})`,
      '',
      '',
      '',
      formatarMoeda(resumo.valor_total),
      formatarMoeda(resumo.valor_pago),
      formatarMoeda(resumo.saldo_pendente),
    ]],
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
  });

  if (relatorio.titulos.length === 0) {
    pdf.setFontSize(10);
    pdf.setTextColor(...CINZA);
    pdf.text('Nenhuma nota encontrada no período.', margem, (pdf.lastAutoTable?.finalY ?? 90) + 8);
  }

  // Rodapé de todas as páginas
  const totalPaginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    pdf.setPage(pagina);
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margem, altura - 12, largura - margem, altura - 12);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...CINZA);
    pdf.text(
      `${cliente.nome} · ${resumo.quantidade} nota(s) · Total ${formatarMoeda(resumo.valor_total)} · Pendente ${formatarMoeda(resumo.saldo_pendente)}`,
      margem,
      altura - 7
    );
    pdf.text(`Página ${pagina} de ${totalPaginas}`, largura - margem, altura - 7, { align: 'right' });
  }

  return pdf;
};
