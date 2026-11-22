import { ConsolidadoProdutos, ItemConsolidado, OrigemCusto } from '../types';

export type PresetPeriodoCompras = '7d' | '15d' | '30d' | 'mes' | 'personalizado';

export const OPCOES_PERIODO: { valor: PresetPeriodoCompras; rotulo: string }[] = [
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: '15d', rotulo: 'Últimos 15 dias' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: 'mes', rotulo: 'Mês atual' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
];

export const ROTULO_ORIGEM_CUSTO: Record<OrigemCusto, string> = {
  ceasa_sem_nf: 'CEASA / sem nota',
  manual: 'Ajuste manual',
  nf: 'Nota fiscal',
};

export const NOME_UNIDADE: Record<string, string> = {
  KG: 'quilo', SC: 'saca', CX: 'caixa', UN: 'unidade', PCT: 'pacote', LT: 'litro', G: 'grama',
};

const paraIso = (data: Date): string => {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
};

/** Período de um atalho, contando o dia de hoje. */
export const periodoDoPreset = (preset: Exclude<PresetPeriodoCompras, 'personalizado'>, hoje = new Date()) => {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (preset === 'mes') {
    return { inicio: paraIso(new Date(fim.getFullYear(), fim.getMonth(), 1)), fim: paraIso(fim) };
  }
  const dias = { '7d': 7, '15d': 15, '30d': 30 }[preset];
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - (dias - 1));
  return { inicio: paraIso(inicio), fim: paraIso(fim) };
};

/** Unidades vendidas por peso aceitam fração; as demais são arredondadas para cima. */
const UNIDADES_FRACIONADAS = new Set(['KG', 'LT', 'G']);

/**
 * Sugestão de compra: média diária × dias de cobertura, descontando o estoque atual.
 * Nunca negativa. Saca, caixa e unidade são arredondadas para cima (não se compra meia caixa).
 */
export const calcularSugestao = (item: Pick<ItemConsolidado, 'media_diaria' | 'estoque_atual' | 'unidade_medida'>, diasCobertura: number, descontarEstoque = true): number => {
  const necessidade = Number(item.media_diaria || 0) * Math.max(diasCobertura, 0);
  const estoque = descontarEstoque ? Math.max(Number(item.estoque_atual || 0), 0) : 0;
  const bruto = Math.max(necessidade - estoque, 0);
  if (UNIDADES_FRACIONADAS.has(item.unidade_medida)) return Math.round(bruto * 1000) / 1000;
  return Math.ceil(bruto - 1e-9);
};

export const formatarQuantidade = (valor: number, unidade?: string): string => {
  const casas = unidade && !UNIDADES_FRACIONADAS.has(unidade) && Number.isInteger(valor) ? 0 : 3;
  const texto = Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  return unidade ? `${texto} ${unidade}` : texto;
};

/** Aceita "12", "12,5" e "12.5". Vazio ou inválido vira null. */
export const textoParaQuantidade = (texto: string): number | null => {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
};

const celulaCsv = (valor: string | number): string => {
  const texto = typeof valor === 'number' ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : valor;
  // Evita que planilhas executem fórmulas vindas de descrições de produto
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return /[;"\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

export const gerarCsvCompras = (dados: ConsolidadoProdutos, sugestoes: Record<number, number>): string => {
  const linhas: (string | number)[][] = [[
    'Grupo', 'Código', 'Produto', 'Unidade', 'Qtde no período', 'Média/dia', 'Pedidos', 'Estoque atual',
    'Custo atual', 'Sugestão de compra',
  ]];
  dados.grupos.forEach((grupo) => grupo.itens.forEach((item) => {
    linhas.push([
      grupo.termo, item.codigo_interno, item.descricao, item.unidade_medida, item.quantidade, item.media_diaria,
      item.pedidos, item.estoque_atual, item.preco_custo_atual, sugestoes[item.produto_id] ?? 0,
    ]);
  }));
  return '﻿' + linhas.map((linha) => linha.map(celulaCsv).join(';')).join('\r\n');
};

export const baixarArquivo = (conteudo: string | Blob, nome: string, tipo = 'text/csv;charset=utf-8') => {
  const blob = typeof conteudo === 'string' ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
};
