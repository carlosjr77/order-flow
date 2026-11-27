import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Produto } from '../types';

export interface LinhaProduto {
  codigo: string;
  nome: string;
}

const TAMANHO_PAGINA_API = 1000;

/** Busca todos os produtos, página por página, sem depender do limite da listagem da tela. */
export const buscarTodosProdutos = async (
  listar: (skip: number, limit: number) => Promise<unknown>
): Promise<Produto[]> => {
  const todos: Produto[] = [];
  for (let skip = 0; ; skip += TAMANHO_PAGINA_API) {
    const pagina = (await listar(skip, TAMANHO_PAGINA_API)) as Produto[];
    todos.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_API) return todos;
  }
};

/** Só código e nome, em ordem alfabética pelo nome. */
export const montarLinhasProdutos = (produtos: Produto[]): LinhaProduto[] =>
  produtos
    .map((produto) => ({
      codigo: String(produto.codigo_interno ?? '').trim(),
      nome: String(produto.descricao ?? '').trim(),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.codigo.localeCompare(b.codigo));

const dataArquivo = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

export const nomeArquivoProdutos = (extensao: 'pdf' | 'xlsx', data = new Date()) =>
  `Produtos_${dataArquivo(data)}.${extensao}`;

export const gerarProdutosPdf = (linhas: LinhaProduto[], nomeEmpresa?: string, data = new Date()): jsPDF => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const margem = 14;

  if (nomeEmpresa) {
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(nomeEmpresa, margem, 14);
  }
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('Lista de Produtos', margem, 22);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`${linhas.length} produto(s) · Gerado em ${data.toLocaleString('pt-BR')}`, margem, 28);

  autoTable(pdf, {
    startY: 33,
    margin: { left: margem, right: margem, bottom: 16 },
    headStyles: { fillColor: [2, 132, 199] },
    styles: { fontSize: 9, cellPadding: 1.6 },
    head: [['Código', 'Produto']],
    body: linhas.map((linha) => [linha.codigo, linha.nome]),
    columnStyles: { 0: { cellWidth: 35 } },
  });

  const totalPaginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    pdf.setPage(pagina);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Página ${pagina} de ${totalPaginas}`, largura - margem, altura - 8, { align: 'right' });
  }
  return pdf;
};

/** Planilha com o código gravado como texto, para o Excel não apagar zeros à esquerda. */
export const gerarProdutosExcel = async (linhas: LinhaProduto[]): Promise<Blob> => {
  // Carregada só ao exportar, para não aumentar o carregamento inicial do sistema.
  const { default: ExcelJS } = await import('exceljs');
  const planilha = new ExcelJS.Workbook();
  const aba = planilha.addWorksheet('Produtos', { views: [{ state: 'frozen', ySplit: 1 }] });
  aba.columns = [
    { header: 'Código', key: 'codigo', width: 18, style: { numFmt: '@' } },
    { header: 'Produto', key: 'nome', width: 60 },
  ];
  aba.getRow(1).font = { bold: true };
  aba.autoFilter = { from: 'A1', to: 'B1' };
  linhas.forEach((linha) => aba.addRow(linha));

  const conteudo = await planilha.xlsx.writeBuffer();
  return new Blob([conteudo], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const baixarArquivo = (conteudo: Blob, nomeArquivo: string) => {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
