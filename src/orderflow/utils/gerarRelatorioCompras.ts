import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConsolidadoProdutos } from '../types';
import { formatarQuantidade } from './compras';

type DocumentoComTabela = jsPDF & { lastAutoTable?: { finalY: number } };

const moeda = (valor: number) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (valor: string) => new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR');

export interface DadosListaCompras {
  consolidado: ConsolidadoProdutos;
  sugestoes: Record<number, number>;
  diasCobertura: number;
  apenasComSugestao: boolean;
}

/** Lista de compras agrupada por termo: o que saiu no período e quanto comprar. */
export const gerarListaComprasPdf = ({ consolidado, sugestoes, diasCobertura, apenasComSugestao }: DadosListaCompras): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4') as DocumentoComTabela;
  const { periodo } = consolidado;
  doc.setProperties({ title: `Lista de compras ${periodo.data_inicio} a ${periodo.data_fim}`, author: 'Order Flow' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text('Planejamento de Compras', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Saídas de ${data(periodo.data_inicio)} a ${data(periodo.data_fim)} (${periodo.dias} dias, data de entrega ou do pedido) · ` +
      `Sugestão para ${diasCobertura} dia(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`,
    14,
    24,
  );
  if (consolidado.termos.length) doc.text(`Termos: ${consolidado.termos.join(', ')}`, 14, 29);

  let y = consolidado.termos.length ? 34 : 30;
  consolidado.grupos.forEach((grupo) => {
    const itens = grupo.itens.filter((item) => !apenasComSugestao || (sugestoes[item.produto_id] ?? 0) > 0);
    if (!itens.length) return;
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(grupo.termo, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      grupo.subtotais_por_unidade.map((s) => `${formatarQuantidade(s.quantidade, s.unidade)} no período`).join('  ·  '),
      14,
      y + 4.5,
    );

    autoTable(doc, {
      startY: y + 7,
      head: [['Produto', 'Un', 'Saiu', 'Média/dia', 'Estoque', 'Custo atual', 'Comprar']],
      body: itens.map((item) => [
        item.descricao,
        item.unidade_medida,
        formatarQuantidade(item.quantidade),
        formatarQuantidade(item.media_diaria),
        formatarQuantidade(item.estoque_atual),
        moeda(item.preco_custo_atual),
        formatarQuantidade(sugestoes[item.produto_id] ?? 0, item.unidade_medida),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      columnStyles: {
        1: { halign: 'center', cellWidth: 12 },
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 9;
  });

  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Order Flow - Planejamento de Compras | Página ${pagina} de ${paginas}`, 14, 290);
  }
  return doc;
};
