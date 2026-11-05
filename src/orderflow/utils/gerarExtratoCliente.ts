import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExtratoCliente } from '../types';
import {
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  formatarData,
  formatarMoeda,
  montarMensagemWhatsApp,
  montarUrlWhatsApp,
} from './financeiro';

type DocumentoComTabela = jsPDF & { lastAutoTable?: { finalY: number } };

export const nomeArquivoExtrato = (extrato: ExtratoCliente): string => {
  const nome = extrato.cliente.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_');
  return `Extrato_${nome}_${extrato.gerado_em.slice(0, 10)}.pdf`;
};

export const gerarExtratoClientePdf = (extrato: ExtratoCliente): jsPDF => {
  const pdf = new jsPDF() as DocumentoComTabela;
  const { cliente, resumo } = extrato;

  pdf.setFontSize(16);
  pdf.text('Extrato Financeiro do Cliente', 14, 16);
  pdf.setFontSize(10);
  pdf.text(`Cliente: ${cliente.nome}`, 14, 24);
  pdf.text(`CPF/CNPJ: ${cliente.documento || '-'}`, 14, 30);
  pdf.text(`Gerado em: ${new Date(extrato.gerado_em).toLocaleString('pt-BR')}`, 14, 36);

  autoTable(pdf, {
    startY: 42,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    head: [['Resumo', 'Valor']],
    body: [
      ['Total bruto de notas', formatarMoeda(resumo.total_bruto)],
      ['Total em aberto nas notas', formatarMoeda(resumo.total_em_aberto)],
      ['Total de pagamentos', formatarMoeda(resumo.total_recebido)],
      ['Pagamentos parciais/avulsos', formatarMoeda(resumo.total_recebido_avulso)],
      ['Crédito disponível', formatarMoeda(resumo.credito_disponivel)],
      resumo.saldo_liquido < 0
        ? ['Saldo a favor do cliente', formatarMoeda(-resumo.saldo_liquido)]
        : ['Saldo devedor atual', formatarMoeda(resumo.saldo_liquido)],
    ],
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY ?? 80) + 8,
    headStyles: { fillColor: [2, 132, 199] },
    styles: { fontSize: 8 },
    head: [['Data', 'Descrição', 'Vencimento', 'Valor original', 'Valor pago', 'Saldo', 'Status']],
    body: extrato.titulos.map((titulo) => [
      formatarData(titulo.data_emissao),
      titulo.descricao,
      formatarData(titulo.data_vencimento),
      formatarMoeda(titulo.valor_original),
      formatarMoeda(titulo.valor_pago),
      formatarMoeda(titulo.saldo),
      ROTULO_STATUS[titulo.status_financeiro],
    ]),
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY ?? 120) + 8,
    headStyles: { fillColor: [100, 116, 139] },
    styles: { fontSize: 8 },
    head: [['Data', 'Forma', 'Lançamento', 'Valor', 'Disponível', 'Situação']],
    body: extrato.recebimentos.map((recebimento) => [
      formatarData(recebimento.data_pagamento),
      recebimento.forma_pagamento,
      ROTULO_ORIGEM[recebimento.origem],
      formatarMoeda(recebimento.valor_total),
      formatarMoeda(recebimento.valor_disponivel),
      recebimento.estornado_em ? 'Estornado' : 'Ativo',
    ]),
  });

  return pdf;
};

const eDispositivoDeToque = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * Celular: compartilhamento nativo com o PDF anexado.
 * Computador: baixa o PDF e abre o WhatsApp com o resumo, pois wa.me não aceita anexos.
 * Retorna true quando o usuário ainda precisa anexar o arquivo manualmente.
 */
export const enviarExtratoWhatsApp = async (extrato: ExtratoCliente): Promise<boolean> => {
  const pdf = gerarExtratoClientePdf(extrato);
  const nomeArquivo = nomeArquivoExtrato(extrato);
  const texto = montarMensagemWhatsApp(extrato);
  const arquivo = new File([pdf.output('blob')], nomeArquivo, { type: 'application/pdf' });

  if (eDispositivoDeToque() && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: texto });
    } catch (erro) {
      if ((erro as Error).name !== 'AbortError') throw erro;
    }
    return false;
  }

  pdf.save(nomeArquivo);
  window.open(montarUrlWhatsApp(extrato.cliente.telefone, texto), '_blank', 'noopener');
  return true;
};
