import { describe, expect, it } from 'vitest';
import { calcularSugestao, gerarCsvCompras, periodoDoPreset, textoParaQuantidade } from './compras';
import { ConsolidadoProdutos } from '../types';

describe('periodoDoPreset', () => {
  const hoje = new Date(2026, 10, 22);
  it('conta o dia de hoje nos atalhos de dias', () => {
    expect(periodoDoPreset('7d', hoje)).toEqual({ inicio: '2026-11-16', fim: '2026-11-22' });
    expect(periodoDoPreset('30d', hoje)).toEqual({ inicio: '2026-10-24', fim: '2026-11-22' });
  });
  it('mês atual começa no dia 1', () => {
    expect(periodoDoPreset('mes', hoje)).toEqual({ inicio: '2026-11-01', fim: '2026-11-22' });
  });
});

describe('calcularSugestao', () => {
  it('desconta o estoque e mantém fração em KG', () => {
    expect(calcularSugestao({ media_diaria: 2.5, estoque_atual: 4, unidade_medida: 'KG' }, 7)).toBe(13.5);
  });
  it('arredonda saca e caixa para cima', () => {
    expect(calcularSugestao({ media_diaria: 0.3, estoque_atual: 0, unidade_medida: 'SC' }, 7)).toBe(3);
    expect(calcularSugestao({ media_diaria: 1, estoque_atual: 0, unidade_medida: 'CX' }, 7)).toBe(7);
  });
  it('nunca fica negativa e pode ignorar o estoque', () => {
    expect(calcularSugestao({ media_diaria: 1, estoque_atual: 50, unidade_medida: 'KG' }, 7)).toBe(0);
    expect(calcularSugestao({ media_diaria: 1, estoque_atual: 50, unidade_medida: 'KG' }, 7, false)).toBe(7);
    expect(calcularSugestao({ media_diaria: 1, estoque_atual: -5, unidade_medida: 'KG' }, 2)).toBe(2);
  });
});

describe('textoParaQuantidade', () => {
  it('aceita vírgula e ponto', () => {
    expect(textoParaQuantidade('12,5')).toBe(12.5);
    expect(textoParaQuantidade('1.250,5')).toBe(1250.5);
    expect(textoParaQuantidade('3')).toBe(3);
    expect(textoParaQuantidade('')).toBeNull();
    expect(textoParaQuantidade('-1')).toBeNull();
  });
});

describe('gerarCsvCompras', () => {
  it('usa ponto e vírgula e neutraliza fórmulas', () => {
    const dados = {
      periodo: { data_inicio: '2026-11-01', data_fim: '2026-11-07', dias: 7, criterio_data: '' },
      termos: [], termos_sem_resultado: [],
      totais: { pedidos: 1, produtos: 1, faturamento: 0, custo: 0, lucro: 0 },
      grupos: [{
        termo: 'Laranja', subtotais_por_unidade: [],
        itens: [{
          produto_id: 1, codigo_interno: 'L1', descricao: '=Laranja; Pera', unidade_medida: 'KG', quantidade: 10.5,
          media_diaria: 1.5, pedidos: 2, faturamento: 0, custo: 0, lucro: 0, estoque_atual: 0, preco_custo_atual: 2,
          primeira_saida: null, ultima_saida: null,
        }],
      }],
    } as ConsolidadoProdutos;
    const linhas = gerarCsvCompras(dados, { 1: 4 }).replace('﻿', '').split('\r\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toBe(`Laranja;L1;"'=Laranja; Pera";KG;10,5;1,5;2;0;2;4`);
  });
});
