import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Venda, ItemVenda } from '../types';
import logoOk from '../../assets/logo-ok.png';

export interface ItemListaCompras {
  codigo: string;
  descricao: string;
  quantidade_total: number;
  unidade_medida: string;
  vendas_origem: number[]; // IDs das vendas que originaram este item
}

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
  itens: (ItemVenda & {
    descricao?: string;
    ncm?: string;
    codigo_interno?: string;
    unidade_medida?: string;
    produto?: any;
    enviar_bar?: boolean;
    enviar_cozinha?: boolean;
  })[];
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

const TIMEZONE_BR = 'America/Sao_Paulo';

const formatarDataHoraBrasil = (valor: string | Date) => {
  const data = valor instanceof Date ? valor : new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return { data: '-', hora: '-' };
  }

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE_BR,
  }).format(data);

  const horaFormatada = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE_BR,
  }).format(data);

  return { data: dataFormatada, hora: horaFormatada };
};

const formatarDataSomenteBrasil = (valor: string) => {
  if (!valor) return '-';

  // Se veio no formato YYYY-MM-DD (sem hora), evita qualquer conversão de fuso.
  const ehSomenteData = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  if (ehSomenteData) {
    const [ano, mes, dia] = valor.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return valor;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE_BR,
  }).format(data);
};

export const gerarComprovanteDANFE = async (dados: DadosComprovante): Promise<jsPDF> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const m = 5; // Margem padrão (5mm)
  const w = 200; // Largura utilizável (210 - 5 - 5)
  let y = m;

  const numPedido = String(dados.venda.id).padStart(9, "0");
  const dataHoraVenda = formatarDataHoraBrasil(dados.venda.data_venda);
  const dataFormatada = dataHoraVenda.data;
  const horaFormatada = dataHoraVenda.hora;
  
  // Data de entrega (se disponível, senão usa data da venda)
  const dataEntregaFormatada = dados.venda.data_entrega 
    ? formatarDataSomenteBrasil(dados.venda.data_entrega)
    : dataFormatada;
  
  // Data de vencimento (se preenchida)
  const dataVencimentoFormatada = dados.venda.data_vencimento
    ? formatarDataSomenteBrasil(dados.venda.data_vencimento)
    : null;

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

  // 3. Bloco Logo (40%)
  doc.rect(m + w * 0.60, y, w * 0.40, headerHeight);
  
  try {
    // Usar a logo importada diretamente - centralizada no bloco
    const logoWidth = 25;
    const logoHeight = 25;
    const logoX = m + w * 0.60 + (w * 0.40 - logoWidth) / 2;
    const logoY = y + (headerHeight - logoHeight) / 2;
    doc.addImage(logoOk, 'PNG', logoX, logoY, logoWidth, logoHeight);
  } catch (error) {
    console.error('Erro ao adicionar imagem ao PDF:', error);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text("✓ OK", m + w * 0.60 + (w * 0.40)/2, y + (headerHeight / 2) + 2, { align: 'center' });
  }
  
  // doc.line(m + w * 0.60, y + 24, m + w, y + 24);

  y += headerHeight; // Aqui não tem gap propositalmente, as caixas são coladas

  // Natureza e CNPJ
  drawDanfeBox(m, y, w * 0.60, 7, "NATUREZA DA OPERAÇÃO", "VENDA DE MERCADORIAS / SERVIÇOS");
  drawDanfeBox(m + w * 0.60, y, w * 0.40, 7, "CNPJ DO EMITENTE", dados.empresa.cnpj);
  
  y += 7; // Altura da caixa anterior

  // ==================== DESTINATÁRIO ====================
  y += 2; // Margem de respiro para descolar da caixa superior
  drawSectionTitle("DESTINATÁRIO/REMETENTE", y + 2.5);
  y += 3.5; // Espaço do texto do título até a caixa
  
  // Usar dados do cliente se preenchido, ou do venda.nome_cliente, senão consumidor final
  const nomeCliente = dados.cliente?.nome || dados.venda.nome_cliente || "CONSUMIDOR FINAL";
  const documentoCliente = dados.cliente?.documento || "000.000.000-00";
  
  drawDanfeBox(m, y, w * 0.50, 7, "NOME/RAZÃO SOCIAL", nomeCliente);
  drawDanfeBox(m + w * 0.50, y, w * 0.20, 7, "CNPJ/CPF", documentoCliente);
  drawDanfeBox(m + w * 0.70, y, w * 0.15, 7, "DATA DA EMISSÃO", dataFormatada, 'right');
  drawDanfeBox(m + w * 0.85, y, w * 0.15, 7, "DATA DE ENTREGA", dataEntregaFormatada, 'right');
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
  if (dataVencimentoFormatada) {
    drawDanfeBox(m + w * 0.50, y, w * 0.25, 7, "DATA DE VENCIMENTO", dataVencimentoFormatada, 'right');
    doc.rect(m + w * 0.75, y, w * 0.25, 7); // Complemento vazio
  } else {
    doc.rect(m + w * 0.50, y, w * 0.50, 7); // Complemento vazio
  }
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

  const montarLinhasTabela = (itens: DadosComprovante['itens']) => {
    return itens.map((it) => {
      const codigo = it.codigo_interno || (it.produto_id ? String(it.produto_id) : '-');
      const descricao = it.descricao || it.produto?.descricao || 'Produto sem descrição';

      return [
        codigo,
        descricao,
        it.ncm || '-',
        it.unidade_medida || 'UN',
        Number(it.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        fmtMoney(it.valor_unitario),
        fmtMoney(it.valor_total),
      ];
    });
  };

  const renderizarTabelaItens = (tituloSecao: string, itensSecao: DadosComprovante['itens']) => {
    if (itensSecao.length === 0) return;

    if (y + 8 > 297 - m) {
      doc.addPage();
      y = m;
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(tituloSecao, m, y + 2.5);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['CÓD. PROD.', 'DESCRIÇÃO DO PRODUTO/SERVIÇO', 'NCM/SH', 'UNID', 'QTD', 'VLR. UNIT.', 'VLR. TOTAL']],
      body: montarLinhasTabela(itensSecao),
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
    y = doc.lastAutoTable.finalY + 3;
  };

  const possuiCategorizacao = dados.itens.some((it) => it.enviar_bar || it.enviar_cozinha);

  if (!possuiCategorizacao) {
    autoTable(doc, {
      startY: y,
      head: [['CÓD. PROD.', 'DESCRIÇÃO DO PRODUTO/SERVIÇO', 'NCM/SH', 'UNID', 'QTD', 'VLR. UNIT.', 'VLR. TOTAL']],
      body: montarLinhasTabela(dados.itens),
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
  } else {
    const itensCozinha = dados.itens.filter((it) => it.enviar_cozinha);
    const itensBar = dados.itens.filter((it) => it.enviar_bar);
    const itensSemCategoria = dados.itens.filter((it) => !it.enviar_bar && !it.enviar_cozinha);

    renderizarTabelaItens('SEÇÃO COZINHA', itensCozinha);
    renderizarTabelaItens('SEÇÃO BAR', itensBar);
    renderizarTabelaItens('SEÇÃO ITENS SEM CATEGORIA', itensSemCategoria);

    y += 1;
  }

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

export interface DadosListaCompras {
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
  itens: ItemListaCompras[];
  vendas_ids: number[];
  data_geracao: Date;
  total_vendas: number;
  total_itens: number;
}

/**
 * Gera um PDF de lista de compras baseado em múltiplas vendas selecionadas.
 * Este documento é para controle interno e para levar para fazer as compras.
 * Layout parecido com o DANFE, mas simplificado para lista de compras.
 */
export const gerarListaCompras = async (dados: DadosListaCompras): Promise<jsPDF> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const m = 5; // Margem padrão (5mm)
  const w = 200; // Largura utilizável (210 - 5 - 5)
  let y = m;

  const dataFormatada = dados.data_geracao.toLocaleDateString('pt-BR');
  const horaFormatada = dados.data_geracao.toLocaleTimeString('pt-BR').slice(0, 5);

  // ==========================================
  // FUNÇÕES UTILITÁRIAS DE DESENHO
  // ==========================================
  
  const drawDanfeBox = (x: number, y: number, width: number, height: number, label: string, value: string, align: 'left'|'center'|'right' = 'left') => {
    doc.setDrawColor(0, 0, 0);
    doc.rect(x, y, width, height);
    
    if (label) {
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(label, x + 1, y + 2.5);
    }
    
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

  // ==================== CABEÇALHO ====================
  const headerHeight = 25;
  
  // Bloco Empresa (50%)
  doc.rect(m, y, w * 0.50, headerHeight);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(dados.empresa.nome.toUpperCase(), m + (w * 0.50)/2, y + 7, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.empresa.endereco}, ${dados.empresa.numero} - ${dados.empresa.bairro}`, m + (w * 0.50)/2, y + 12, { align: 'center' });
  doc.text(`${dados.empresa.cidade}/${dados.empresa.estado} - CEP: ${dados.empresa.cep}`, m + (w * 0.50)/2, y + 16, { align: 'center' });
  if (dados.empresa.telefone) {
    doc.text(`Telefone: ${dados.empresa.telefone}`, m + (w * 0.50)/2, y + 20, { align: 'center' });
  }

  // Bloco Título (50%)
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTA DE COMPRAS', m + w * 0.50 + (w * 0.50)/2, y + 8, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento para controle interno', m + w * 0.50 + (w * 0.50)/2, y + 13, { align: 'center' });
  doc.text('e aquisição de mercadorias', m + w * 0.50 + (w * 0.50)/2, y + 17, { align: 'center' });
  
  // Fundo verde claro para destacar
  doc.setFillColor(220, 255, 220);
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight, 'FD');
  doc.setDrawColor(0, 0, 0);
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 100, 0);
  doc.text('LISTA DE COMPRAS', m + w * 0.50 + (w * 0.50)/2, y + 8, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Documento para controle interno', m + w * 0.50 + (w * 0.50)/2, y + 13, { align: 'center' });
  doc.text('e aquisição de mercadorias', m + w * 0.50 + (w * 0.50)/2, y + 17, { align: 'center' });

  y += headerHeight;
  y += 2;

  // ==================== INFORMAÇÕES GERAIS ====================
  drawSectionTitle('INFORMAÇÕES GERAIS', y + 2.5);
  y += 3.5;

  const vendasStr = dados.vendas_ids.length <= 10 
    ? dados.vendas_ids.map(id => `#${id}`).join(', ')
    : `${dados.vendas_ids.slice(0, 10).map(id => `#${id}`).join(', ')}... e mais ${dados.vendas_ids.length - 10} vendas`;

  drawDanfeBox(m, y, w * 0.30, 7, 'DATA DE EMISSÃO', dataFormatada);
  drawDanfeBox(m + w * 0.30, y, w * 0.20, 7, 'HORA', horaFormatada);
  drawDanfeBox(m + w * 0.50, y, w * 0.25, 7, 'TOTAL DE VENDAS', String(dados.total_vendas));
  drawDanfeBox(m + w * 0.75, y, w * 0.25, 7, 'TOTAL DE ITENS', String(dados.total_itens), 'right');
  y += 7;

  drawDanfeBox(m, y, w * 0.80, 7, 'VENDAS SELECIONADAS', vendasStr);
  drawDanfeBox(m + w * 0.80, y, w * 0.20, 7, 'CNPJ', dados.empresa.cnpj);
  y += 7;

  // ==================== RESUMO ====================
  y += 2;
  drawSectionTitle('RESUMO DA LISTA', y + 2.5);
  y += 3.5;

  // Tabela de resumo com totais
  const resumoData = [
    ['Total de Vendas', String(dados.total_vendas), '-'],
    ['Total de Itens Únicos', String(dados.total_itens), '-'],
    ['Data de Geração', dataFormatada, horaFormatada],
  ];

  autoTable(doc, {
    startY: y,
    head: [['DESCRIÇÃO', 'QUANTIDADE', 'OBSERVAÇÃO']],
    body: resumoData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [100, 180, 100],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.50 },
      1: { cellWidth: w * 0.20, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: w * 0.30, halign: 'center' },
    },
    margin: { left: m, right: m },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // ==================== LISTA DE PRODUTOS ====================
  drawSectionTitle('PRODUTOS PARA COMPRAR', y + 2.5);
  y += 3.5;

  const tableData = dados.itens.map((item) => [
    item.codigo,
    item.descricao,
    item.unidade_medida,
    { content: Number(item.quantidade_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fontSize: 9 } },
    item.vendas_origem.length <= 3 
      ? item.vendas_origem.map(id => `#${id}`).join(', ')
      : `${item.vendas_origem.slice(0, 3).map(id => `#${id}`).join(', ')}... +${item.vendas_origem.length - 3}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['CÓD.', 'DESCRIÇÃO DO PRODUTO', 'UNID.', 'QTD. TOTAL', 'VENDAS ORIGEM']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.12, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: w * 0.08, halign: 'center' },
      3: { cellWidth: w * 0.12, halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 220] },
      4: { cellWidth: w * 0.18, halign: 'center', fontSize: 6.5 },
    },
    margin: { left: m, right: m },
    didParseCell: (data) => {
      // Destacar a coluna de quantidade total
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.fillColor = [255, 255, 220];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // ==================== DADOS ADICIONAIS ====================
  if (y + 25 > 297 - m) {
    doc.addPage();
    y = m;
  }

  drawSectionTitle('OBSERVAÇÕES', y + 2.5);
  y += 3.5;
  
  doc.setFillColor(255, 255, 240);
  doc.rect(m, y, w, 20, 'FD');
  doc.setDrawColor(0, 0, 0);
  doc.rect(m, y, w, 20);
  
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('DOCUMENTO PARA USO INTERNO - LISTA DE COMPRAS', m + 1, y + 4);
  doc.text('Utilize esta lista para conferência e aquisição dos produtos necessários.', m + 1, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTE DOCUMENTO NÃO SUBSTITUI A NOTA FISCAL.', m + 1, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${dataFormatada} às ${horaFormatada}`, m + 1, y + 17);

  y += 22;

  // ==================== RODAPÉ ====================
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('Documento gerado pelo sistema Order Flow - Para uso interno', m + w / 2, 290, { align: 'center' });

  return doc;
};

/**
 * Função utilitária para consolidar itens de múltiplas vendas
 * Agrupa produtos iguais e soma as quantidades
 */
export function consolidarItensVendas(
  vendas: Array<{ id: number; itens?: Array<{ produto_id: number; quantidade: number; descricao?: string; codigo_interno?: string; unidade_medida?: string }> }>
): ItemListaCompras[] {
  const mapaItens = new Map<number, ItemListaCompras>();

  vendas.forEach(venda => {
    if (!venda.itens) return;
    
    venda.itens.forEach(item => {
      const produtoId = item.produto_id;
      const existing = mapaItens.get(produtoId);
      
      if (existing) {
        existing.quantidade_total += item.quantidade;
        if (!existing.vendas_origem.includes(venda.id)) {
          existing.vendas_origem.push(venda.id);
        }
      } else {
        mapaItens.set(produtoId, {
          codigo: item.codigo_interno || String(produtoId),
          descricao: item.descricao || `Produto ${produtoId}`,
          quantidade_total: item.quantidade,
          unidade_medida: item.unidade_medida || 'UN',
          vendas_origem: [venda.id],
        });
      }
    });
  });

  return Array.from(mapaItens.values()).sort((a, b) => a.descricao.localeCompare(b.descricao));
}

/**
 * Interface para o relatorio financeiro
 */
export interface DadosRelatorioFinanceiro {
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
  vendas: Array<{
    id: number;
    data_venda: string;
    status: string;
    forma_pagamento: string;
    valor_total: number;
    valor_frete?: number;
    itens?: Array<{
      produto_id: number;
      quantidade: number;
      valor_unitario: number;
      valor_total: number;
      descricao?: string;
      preco_custo?: number;
      codigo_interno?: string;
    }>;
  }>;
  produtos_consolidados?: Array<{
    codigo: string;
    descricao: string;
    quantidade_total: number;
    preco_custo_medio: number;
    preco_venda_medio: number;
    custo_total: number;
    venda_total: number;
    lucro_total: number;
  }>;
  data_inicio: Date;
  data_fim: Date;
  data_geracao: Date;
  total_vendas: number;
  total_bruto: number;
  total_frete: number;
  total_liquido: number;
  total_custo: number;
  total_lucro: number;
  margem_percentual: number;
  resumo_por_status: {
    concluido: { quantidade: number; valor: number; lucro: number };
    pendente: { quantidade: number; valor: number; lucro: number };
    cancelado: { quantidade: number; valor: number; lucro: number };
  };
  resumo_por_pagamento: Array<{
    forma: string;
    quantidade: number;
    valor: number;
    lucro: number;
  }>;
}

/**
 * Gera um PDF de relatorio financeiro baseado em multiplas vendas selecionadas.
 * Este documento apresenta um resumo financeiro detalhado das vendas com dashboard completo.
 */
export const gerarRelatorioFinanceiro = async (dados: DadosRelatorioFinanceiro): Promise<jsPDF> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const m = 5; // Margem padrao (5mm)
  const w = 200; // Largura utilizavel (210 - 5 - 5)
  let y = m;

  const dataInicioFormatada = dados.data_inicio.toLocaleDateString('pt-BR');
  const dataFimFormatada = dados.data_fim.toLocaleDateString('pt-BR');
  const dataGeracaoFormatada = dados.data_geracao.toLocaleDateString('pt-BR');
  const horaGeracaoFormatada = dados.data_geracao.toLocaleTimeString('pt-BR').slice(0, 5);
  const margemStr = dados.margem_percentual.toFixed(2).replace('.', ',') + '%';

  // Funcoes utilitarias de desenho
  const drawDanfeBox = (x: number, yPos: number, width: number, height: number, label: string, value: string, align: 'left'|'center'|'right' = 'left', isHighlighted = false) => {
    doc.setDrawColor(0, 0, 0);
    if (isHighlighted) {
      doc.setFillColor(220, 255, 220);
      doc.rect(x, yPos, width, height, 'FD');
    } else {
      doc.rect(x, yPos, width, height);
    }
    
    if (label) {
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(label, x + 1, yPos + 2.5);
    }
    
    if (value) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      
      let textX = x + 1;
      if (align === 'center') textX = x + (width / 2);
      if (align === 'right') textX = x + width - 1;
      
      doc.text(value, textX, yPos + height - 1.5, { align: align === 'left' ? undefined : align });
    }
  };

  const drawSectionTitle = (title: string, yPos: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(title, m, yPos);
  };

  // ==================== CABECALHO ====================
  const headerHeight = 25;
  
  // Bloco Empresa (50%)
  doc.rect(m, y, w * 0.50, headerHeight);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(dados.empresa.nome.toUpperCase(), m + (w * 0.50)/2, y + 7, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.empresa.endereco}, ${dados.empresa.numero} - ${dados.empresa.bairro}`, m + (w * 0.50)/2, y + 12, { align: 'center' });
  doc.text(`${dados.empresa.cidade}/${dados.empresa.estado} - CEP: ${dados.empresa.cep}`, m + (w * 0.50)/2, y + 16, { align: 'center' });
  if (dados.empresa.telefone) {
    doc.text(`Telefone: ${dados.empresa.telefone}`, m + (w * 0.50)/2, y + 20, { align: 'center' });
  }

  // Bloco Titulo (50%)
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight);
  
  // Fundo azul claro para destacar
  doc.setFillColor(220, 230, 255);
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight, 'FD');
  doc.setDrawColor(0, 0, 0);
  doc.rect(m + w * 0.50, y, w * 0.50, headerHeight);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 50, 150);
  doc.text('RELATÓRIO FINANCEIRO', m + w * 0.50 + (w * 0.50)/2, y + 10, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Dashboard de Vendas e Lucratividade', m + w * 0.50 + (w * 0.50)/2, y + 16, { align: 'center' });
  doc.text(`Período: ${dataInicioFormatada} a ${dataFimFormatada}`, m + w * 0.50 + (w * 0.50)/2, y + 21, { align: 'center' });

  y += headerHeight;
  y += 3;

  // ==================== DASHBOARD PRINCIPAL ====================
  drawSectionTitle('DASHBOARD FINANCEIRO', y + 3);
  y += 5;

  // Linha 1 - Indicadores principais
  const indicatorHeight = 12;
  
  // Total Vendas
  doc.setFillColor(230, 240, 255);
  doc.rect(m, y, w * 0.25, indicatorHeight, 'FD');
  doc.rect(m, y, w * 0.25, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL DE VENDAS', m + (w * 0.25)/2, y + 3, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 50, 150);
  doc.text(String(dados.total_vendas), m + (w * 0.25)/2, y + 8, { align: 'center' });

  // Total Bruto
  doc.setFillColor(255, 255, 220);
  doc.rect(m + w * 0.25, y, w * 0.25, indicatorHeight, 'FD');
  doc.rect(m + w * 0.25, y, w * 0.25, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL BRUTO', m + w * 0.25 + (w * 0.25)/2, y + 3, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 100, 0);
  doc.text(fmtMoney(dados.total_bruto), m + w * 0.25 + (w * 0.25)/2, y + 8, { align: 'center' });

  // Total Custo
  doc.setFillColor(255, 230, 230);
  doc.rect(m + w * 0.50, y, w * 0.25, indicatorHeight, 'FD');
  doc.rect(m + w * 0.50, y, w * 0.25, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL CUSTO', m + w * 0.50 + (w * 0.25)/2, y + 3, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 0, 0);
  doc.text(fmtMoney(dados.total_custo), m + w * 0.50 + (w * 0.25)/2, y + 8, { align: 'center' });

  // Total Lucro
  doc.setFillColor(220, 255, 220);
  doc.rect(m + w * 0.75, y, w * 0.25, indicatorHeight, 'FD');
  doc.rect(m + w * 0.75, y, w * 0.25, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL LUCRO', m + w * 0.75 + (w * 0.25)/2, y + 3, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 150, 0);
  doc.text(fmtMoney(dados.total_lucro), m + w * 0.75 + (w * 0.25)/2, y + 8, { align: 'center' });

  y += indicatorHeight + 2;

  // Linha 2 - Indicadores secundarios
  // Margem
  doc.setFillColor(240, 230, 255);
  doc.rect(m, y, w * 0.33, indicatorHeight, 'FD');
  doc.rect(m, y, w * 0.33, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('MARGEM DE LUCRO', m + (w * 0.33)/2, y + 3, { align: 'center' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 0, 150);
  doc.text(margemStr, m + (w * 0.33)/2, y + 8, { align: 'center' });

  // Total Frete
  doc.setFillColor(230, 245, 255);
  doc.rect(m + w * 0.33, y, w * 0.34, indicatorHeight, 'FD');
  doc.rect(m + w * 0.33, y, w * 0.34, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL FRETE', m + w * 0.33 + (w * 0.34)/2, y + 3, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 80, 150);
  doc.text(fmtMoney(dados.total_frete), m + w * 0.33 + (w * 0.34)/2, y + 8, { align: 'center' });

  // Total Liquido
  doc.setFillColor(220, 255, 220);
  doc.rect(m + w * 0.67, y, w * 0.33, indicatorHeight, 'FD');
  doc.rect(m + w * 0.67, y, w * 0.33, indicatorHeight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL LÍQUIDO', m + w * 0.67 + (w * 0.33)/2, y + 3, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 150, 0);
  doc.text(fmtMoney(dados.total_liquido), m + w * 0.67 + (w * 0.33)/2, y + 8, { align: 'center' });

  y += indicatorHeight + 5;

  // ==================== RESUMO POR STATUS ====================
  drawSectionTitle('RESUMO POR STATUS', y + 3);
  y += 5;

  const statusData = [
    ['Concluídas', String(dados.resumo_por_status.concluido.quantidade), fmtMoney(dados.resumo_por_status.concluido.valor), fmtMoney(dados.resumo_por_status.concluido.lucro)],
    ['Pendentes', String(dados.resumo_por_status.pendente.quantidade), fmtMoney(dados.resumo_por_status.pendente.valor), fmtMoney(dados.resumo_por_status.pendente.lucro)],
    ['Canceladas', String(dados.resumo_por_status.cancelado.quantidade), fmtMoney(dados.resumo_por_status.cancelado.valor), fmtMoney(dados.resumo_por_status.cancelado.lucro)],
    ['TOTAL', String(dados.total_vendas), fmtMoney(dados.total_bruto), fmtMoney(dados.total_lucro)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['STATUS', 'QUANTIDADE', 'VALOR TOTAL', 'LUCRO']],
    body: statusData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [100, 140, 200],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.35 },
      1: { cellWidth: w * 0.15, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: w * 0.25, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: w * 0.25, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: m, right: m },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // ==================== RESUMO POR FORMA DE PAGAMENTO ====================
  drawSectionTitle('RESUMO POR FORMA DE PAGAMENTO', y + 3);
  y += 5;

  const pagamentoData = dados.resumo_por_pagamento.map(item => [
    item.forma,
    String(item.quantidade),
    fmtMoney(item.valor),
    fmtMoney(item.lucro),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['FORMA DE PAGAMENTO', 'QUANTIDADE', 'VALOR TOTAL', 'LUCRO']],
    body: pagamentoData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [100, 180, 140],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.35 },
      1: { cellWidth: w * 0.15, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: w * 0.25, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: w * 0.25, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: m, right: m },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // ==================== PRODUTOS MAIS VENDIDOS ====================
  if (dados.produtos_consolidados && dados.produtos_consolidados.length > 0) {
    drawSectionTitle('PRODUTOS MAIS VENDIDOS (CONSOLIDADO)', y + 3);
    y += 5;

    const produtosData = dados.produtos_consolidados.map(prod => [
      prod.codigo || '-',
      prod.descricao || '-',
      String(prod.quantidade_total),
      fmtMoney(prod.preco_custo_medio),
      fmtMoney(prod.preco_venda_medio),
      fmtMoney(prod.custo_total),
      fmtMoney(prod.venda_total),
      fmtMoney(prod.lucro_total),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['CÓD.', 'PRODUTO', 'QTD', 'CUSTO UNIT', 'VLR UNIT', 'CUSTO TOTAL', 'VLR TOTAL', 'LUCRO']],
      body: produtosData,
      theme: 'grid',
      styles: {
        fontSize: 6,
        font: 'helvetica',
        lineWidth: 0.2,
        lineColor: [0, 0, 0],
        textColor: [0, 0, 0],
        cellPadding: 1,
      },
      headStyles: {
        fillColor: [150, 120, 200],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: w * 0.08, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: w * 0.06, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: w * 0.10, halign: 'right' },
        4: { cellWidth: w * 0.10, halign: 'right' },
        5: { cellWidth: w * 0.12, halign: 'right' },
        6: { cellWidth: w * 0.12, halign: 'right', fontStyle: 'bold' },
        7: { cellWidth: w * 0.12, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // Destacar lucro na ultima coluna
        if (data.section === 'body' && data.column.index === 7) {
          const value = Number(String(data.cell.raw).replace(/[R$\s.]/g, '').replace(',', '.'));
          if (value > 0) {
            data.cell.styles.textColor = [0, 150, 0];
          } else if (value < 0) {
            data.cell.styles.textColor = [150, 0, 0];
          }
        }
      },
      margin: { left: m, right: m },
    });

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8;
  }

  // ==================== LISTA DE VENDAS ====================
  drawSectionTitle('DETALHAMENTO DAS VENDAS', y + 3);
  y += 5;

  const vendasData = dados.vendas.map(venda => {
    const dataVenda = new Date(venda.data_venda).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    // Calcular custo e lucro da venda
    let custoVenda = 0;
    if (venda.itens && venda.itens.length > 0) {
      custoVenda = venda.itens.reduce((sum, item) => {
        const custoItem = (item.preco_custo || 0) * Number(item.quantidade);
        return sum + custoItem;
      }, 0);
    }
    const lucroVenda = Number(venda.valor_total) - custoVenda;
    
    return [
      `#${venda.id}`,
      dataVenda,
      venda.status ? String(venda.status).toUpperCase() : '-',
      venda.forma_pagamento || '-',
      fmtMoney(venda.valor_total),
      fmtMoney(custoVenda),
      fmtMoney(lucroVenda),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['PEDIDO', 'DATA', 'STATUS', 'PAGAMENTO', 'VLR TOTAL', 'CUSTO', 'LUCRO']],
    body: vendasData,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      font: 'helvetica',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [200, 200, 200],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: w * 0.10, halign: 'center' },
      1: { cellWidth: w * 0.12, halign: 'center' },
      2: { cellWidth: w * 0.10, halign: 'center' },
      3: { cellWidth: w * 0.15, halign: 'center' },
      4: { cellWidth: w * 0.16, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: w * 0.16, halign: 'right' },
      6: { cellWidth: w * 0.21, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Destacar lucro na ultima coluna
      if (data.section === 'body' && data.column.index === 6) {
        const value = Number(String(data.cell.raw).replace(/[R$\s.]/g, '').replace(',', '.'));
        if (value > 0) {
          data.cell.styles.textColor = [0, 150, 0];
        } else if (value < 0) {
          data.cell.styles.textColor = [150, 0, 0];
        }
      }
    },
    margin: { left: m, right: m },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // ==================== DADOS ADICIONAIS ====================
  if (y + 20 > 297 - m) {
    doc.addPage();
    y = m;
  }

  doc.setFillColor(255, 255, 240);
  doc.rect(m, y, w, 15, 'FD');
  doc.setDrawColor(0, 0, 0);
  doc.rect(m, y, w, 15);
  
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('DOCUMENTO PARA USO INTERNO - RELATÓRIO FINANCEIRO', m + 1, y + 4);
  doc.text('Este relatório apresenta o resumo financeiro e de lucratividade das vendas selecionadas.', m + 1, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTE DOCUMENTO NÃO SUBSTITUI A NOTA FISCAL.', m + 1, y + 12);

  y += 18;

  // ==================== RODAPE ====================
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em: ${dataGeracaoFormatada} às ${horaGeracaoFormatada}`, m + w / 2, y, { align: 'center' });
  y += 4;
  doc.text('Documento gerado pelo sistema Order Flow - Para uso interno', m + w / 2, y, { align: 'center' });

  return doc;
};
