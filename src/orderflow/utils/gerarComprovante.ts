import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Venda, ItemVenda } from '../types';

export interface DadosComprovante {
  empresa: {
    nome: string;
    cnpj: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    telefone?: string;
  };
  venda: Venda;
  // Permitindo index signature flexível caso os dados venham do backend com formatos variados
  itens: (ItemVenda & { descricao?: string; ncm?: string; codigo_interno?: string; unidade_medida?: string; produto?: any })[];
  // Dados opcionais do cliente
  cliente?: {
    nome: string;
    documento: string;
  } | null;
  // Dados opcionais de entrega
  entrega?: {
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  } | null;
}

// Formatação auxiliar
const fmtMoney = (valor: number | string) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const gerarComprovanteDANFE = (dados: DadosComprovante): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const m = 5; // Margem padrão (5mm)
  const w = 200; // Largura utilizável (210 - 5 - 5)
  let y = m;

  const numPedido = String(dados.venda.id).padStart(9, "0");
  const dataVenda = new Date(dados.venda.data_venda);
  const dataFormatada = dataVenda.toLocaleDateString("pt-BR");
  const horaFormatada = dataVenda.toLocaleTimeString("pt-BR").slice(0, 5);

  // ==========================================
  // FUNÇÕES UTILITÁRIAS DE DESENHO
  // ==========================================
  
  // Desenha uma caixa no estilo DANFE
  const drawDanfeBox = (x: number, y: number, width: number, height: number, label: string, value: string, align: 'left'|'center'|'right' = 'left') => {
    doc.setDrawColor(0, 0, 0);
    doc.rect(x, y, width, height);
    
    // Label (tamanho pequeno)
    if (label) {
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(label, x + 1, y + 2.5);
    }
    
    // Valor (maior e negrito)
    if (value) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      
      let textX = x + 1;
      if (align === 'center') textX = x + (width / 2);
      if (align === 'right') textX = x + width - 1;
      
      doc.text(value, textX, y + height - 1.5, { align: align === 'left' ? undefined : align });
    }
  };

  const drawSectionTitle = (title: string, yPos: number) => {
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(title, m, yPos);
  };

  // ==================== CANHOTO ====================
  doc.rect(m, y, w * 0.85, 12); // Área recebedor
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`RECEBEMOS DE ${dados.empresa.nome.toUpperCase()} OS PRODUTOS/SERVIÇOS CONSTANTES NO PEDIDO INDICADO AO LADO`, m + 1, y + 3.5);
  
  doc.line(m, y + 8, m + w * 0.85, y + 8); // Linha divisória
  doc.line(m + (w * 0.85) / 3, y + 8, m + (w * 0.85) / 3, y + 12); // Divisória vertical
  doc.text("DATA DE RECEBIMENTO", m + 1, y + 11);
  doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", m + (w * 0.85) / 3 + 1, y + 11);

  doc.rect(m + w * 0.85, y, w * 0.15, 12); // Área N Pedido
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("PEDIDO", m + w * 0.85 + (w * 0.15) / 2, y + 5, { align: 'center' });
  doc.text(`Nº ${numPedido}`, m + w * 0.85 + (w * 0.15) / 2, y + 10, { align: 'center' });

  y += 12; // Avança o tamanho do canhoto
  y += 2;  // Margem de respiro
  
  doc.setLineDashPattern([1, 1], 0);
  doc.line(m, y, m + w, y);
  doc.setLineDashPattern([], 0);
  
  y += 2;  // Margem de respiro

  // ==================== CABEÇALHO (EMITENTE) ====================
  const headerHeight = 30;
  
  // 1. Bloco Empresa (45%)
  doc.rect(m, y, w * 0.45, headerHeight);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(dados.empresa.nome.toUpperCase(), m + (w * 0.45)/2, y + 8, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.empresa.endereco}, ${dados.empresa.numero} - ${dados.empresa.bairro}`, m + (w * 0.45)/2, y + 13, { align: 'center' });
  doc.text(`${dados.empresa.cidade}/${dados.empresa.estado} - CEP: ${dados.empresa.cep}`, m + (w * 0.45)/2, y + 17, { align: 'center' });
  if (dados.empresa.telefone) {
    doc.text(`Telefone: ${dados.empresa.telefone}`, m + (w * 0.45)/2, y + 21, { align: 'center' });
  }

  // 2. Bloco Central (15%)
  doc.rect(m + w * 0.45, y, w * 0.15, headerHeight);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text("PEDIDO", m + w * 0.45 + (w * 0.15)/2, y + 6, { align: 'center' });
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
  doc.text("Documento Auxiliar\nde Venda", m + w * 0.45 + (w * 0.15)/2, y + 11, { align: 'center' });
  // Quadrado "1"
  doc.rect(m + w * 0.45 + (w * 0.15)/2 - 5, y + 15, 10, 5);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text("1", m + w * 0.45 + (w * 0.15)/2, y + 18.5, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`Nº ${numPedido}`, m + w * 0.45 + (w * 0.15)/2, y + 24, { align: 'center' });
  doc.text("SÉRIE: 1", m + w * 0.45 + (w * 0.15)/2, y + 28, { align: 'center' });

  // 3. Bloco Código Barras (40%)
  doc.rect(m + w * 0.60, y, w * 0.40, headerHeight);
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text("CONTROLE INTERNO DO SISTEMA", m + w * 0.60 + 1, y + 2.5);
  // Simulação barras (Apenas visual texto)
  doc.setFontSize(20);
  doc.text("|||||||| |||||| |||||||| ||||", m + w * 0.60 + (w * 0.40)/2, y + 14, { align: 'center' });
  doc.setFontSize(7);
  doc.text("Consulte a validade deste pedido com o setor de vendas.", m + w * 0.60 + (w * 0.40)/2, y + 20, { align: 'center' });
  doc.line(m + w * 0.60, y + 24, m + w, y + 24);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text("SEM VALOR FISCAL", m + w * 0.60 + (w * 0.40)/2, y + 28, { align: 'center' });

  y += headerHeight; // Aqui não tem gap propositalmente, as caixas são coladas

  // Natureza e CNPJ
  drawDanfeBox(m, y, w * 0.60, 7, "NATUREZA DA OPERAÇÃO", "VENDA DE MERCADORIAS / SERVIÇOS");
  drawDanfeBox(m + w * 0.60, y, w * 0.40, 7, "CNPJ DO EMITENTE", dados.empresa.cnpj);
  
  y += 7; // Altura da caixa anterior

  // ==================== DESTINATÁRIO ====================
  y += 2; // Margem de respiro para descolar da caixa superior
  drawSectionTitle("DESTINATÁRIO/REMETENTE", y + 2.5);
  y += 3.5; // Espaço do texto do título até a caixa
  
  // Usar dados do cliente se preenchido, senão consumidor final
  const nomeCliente = dados.cliente?.nome || "CONSUMIDOR FINAL";
  const documentoCliente = dados.cliente?.documento || "000.000.000-00";
  
  drawDanfeBox(m, y, w * 0.65, 7, "NOME/RAZÃO SOCIAL", nomeCliente);
  drawDanfeBox(m + w * 0.65, y, w * 0.20, 7, "CNPJ/CPF", documentoCliente);
  drawDanfeBox(m + w * 0.85, y, w * 0.15, 7, "DATA DA EMISSÃO", dataFormatada, 'right');
  y += 7;
  
  // Usar endereço de entrega se preenchido, senão traços
  const enderecoEntrega = dados.entrega?.endereco || "-";
  const numeroEntrega = dados.entrega?.numero || "-";
  const complementoEntrega = dados.entrega?.complemento ? ` - ${dados.entrega.complemento}` : "";
  const bairroEntrega = dados.entrega?.bairro || "-";
  const cidadeEntrega = dados.entrega?.cidade || "-";
  const estadoEntrega = dados.entrega?.estado || "-";
  const cepEntrega = dados.entrega?.cep || "-";
  
  // Linha 1: Endereço, Bairro, CEP
  drawDanfeBox(m, y, w * 0.45, 7, "ENDEREÇO", `${enderecoEntrega}, ${numeroEntrega}${complementoEntrega}`);
  drawDanfeBox(m + w * 0.45, y, w * 0.25, 7, "BAIRRO/DISTRITO", bairroEntrega);
  drawDanfeBox(m + w * 0.70, y, w * 0.15, 7, "CEP", cepEntrega);
  drawDanfeBox(m + w * 0.85, y, w * 0.15, 7, "HORA DE SAÍDA", horaFormatada, 'right');
  y += 7;
  
  // Linha 2: Cidade, Estado
  drawDanfeBox(m, y, w * 0.50, 7, "CIDADE", cidadeEntrega);
  drawDanfeBox(m + w * 0.50, y, w * 0.10, 7, "ESTADO", estadoEntrega);
  drawDanfeBox(m + w * 0.60, y, w * 0.40, 7, "INSCRIÇÃO ESTADUAL", "-");
  y += 7;

  // ==================== PAGAMENTO ====================
  y += 2; 
  drawSectionTitle("PAGAMENTO", y + 2.5);
  y += 3.5; 
  
  drawDanfeBox(m, y, w * 0.25, 7, "FORMA DE PAGAMENTO", dados.venda.forma_pagamento || "A COMBINAR");
  drawDanfeBox(m + w * 0.25, y, w * 0.25, 7, "STATUS", dados.venda.status ? String(dados.venda.status).toUpperCase() : "-");
  doc.rect(m + w * 0.50, y, w * 0.50, 7); // Complemento vazio
  y += 7;

  // ==================== CÁLCULO ====================
  y += 2; 
  drawSectionTitle("CÁLCULO DO PEDIDO", y + 2.5);
  y += 3.5; 
  
  const valorFrete = dados.venda.valor_frete || 0;
  drawDanfeBox(m, y, w * 0.20, 7, "VALOR DO FRETE", fmtMoney(valorFrete), 'right');
  drawDanfeBox(m + w * 0.20, y, w * 0.20, 7, "VALOR DO DESCONTO", "0,00", 'right');
  drawDanfeBox(m + w * 0.40, y, w * 0.20, 7, "OUTRAS DESPESAS", "0,00", 'right');
  
  // Fundo cinza para o total
  doc.setFillColor(240, 240, 240);
  doc.rect(m + w * 0.60, y, w * 0.40, 7, 'FD');
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.text("VALOR TOTAL DOS PRODUTOS", m + w * 0.60 + 1, y + 2.5);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text(fmtMoney(dados.venda.valor_total), m + w - 1, y + 5.5, { align: 'right' });
  y += 7;

  drawDanfeBox(m, y, w * 0.60, 7, "OBSERVAÇÕES DE IMPOSTOS", "Isento de tributação fiscal. Documento para simples conferência.");
  
  doc.setFillColor(220, 220, 220);
  doc.rect(m + w * 0.60, y, w * 0.40, 7, 'FD');
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.text("VALOR TOTAL DO PEDIDO", m + w * 0.60 + 1, y + 2.5);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(fmtMoney(dados.venda.valor_total), m + w - 1, y + 5.5, { align: 'right' });
  y += 7;

  // ==================== ITENS DA VENDA (TABELA) ====================
  y += 2; 
  drawSectionTitle("DADOS DO PRODUTO/SERVIÇO", y + 2.5);
  y += 3.5;

  // MAPEAMENTO INTELIGENTE (Fallback para dados faltantes)
  const tableData = dados.itens.map((it) => {
    // Tenta pegar o código interno, se não existir, pega o ID do produto, se não, traço.
    const codigo = it.codigo_interno || (it.produto_id ? String(it.produto_id) : "-");
    
    // Tenta pegar a descrição nativa do ItemVenda, ou procura dentro do objeto 'produto' aninhado
    const descricao = it.descricao || it.produto?.descricao || "Produto sem descrição";

    return [
      codigo,
      descricao,
      it.ncm || "-",
      it.unidade_medida || "UN",
      Number(it.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      fmtMoney(it.valor_unitario),
      fmtMoney(it.valor_total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['CÓD. PROD.', 'DESCRIÇÃO DO PRODUTO/SERVIÇO', 'NCM/SH', 'UNID', 'QTD', 'VLR. UNIT.', 'VLR. TOTAL']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 1,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.12 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: w * 0.10, halign: 'center' },
      3: { cellWidth: w * 0.06, halign: 'center' },
      4: { cellWidth: w * 0.08, halign: 'right' },
      5: { cellWidth: w * 0.12, halign: 'right' },
      6: { cellWidth: w * 0.14, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: m, right: m },
  });

  // @ts-ignore - plugin adiciona lastAutoTable no doc
  y = doc.lastAutoTable.finalY + 4;

  // ==================== DADOS ADICIONAIS ====================
  // Checa se precisa quebrar página para os dados adicionais (precisamos de uns 30mm)
  if (y + 30 > 297 - m) {
    doc.addPage();
    y = m;
  }

  drawSectionTitle("DADOS ADICIONAIS", y + 2.5);
  y += 3.5;
  
  doc.rect(m, y, w * 0.70, 25);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text("INFORMAÇÕES COMPLEMENTARES", m + 1, y + 2.5);
  doc.setFontSize(7);
  doc.text("Venda registrada através do sistema de gestão.", m + 1, y + 6);
  doc.text("Documento emitido para controle interno e auxílio logístico.", m + 1, y + 9);
  doc.setFont('helvetica', 'bold');
  doc.text("NÃO GERA DIREITO A CRÉDITO FISCAL. NÃO SUBSTITUI A NOTA FISCAL.", m + 1, y + 14);

  // Observações dinâmicas
  if (dados.venda.observacoes) {
      doc.setFont('helvetica', 'normal');
      const textLines = doc.splitTextToSize(`Obs: ${dados.venda.observacoes}`, w * 0.68);
      doc.text(textLines, m + 1, y + 18);
  }

  doc.rect(m + w * 0.70, y, w * 0.30, 25);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text("RESERVADO AO CONTROLE INTERNO", m + w * 0.70 + 1, y + 2.5);

  return doc;
};