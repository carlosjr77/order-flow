import { describe, expect, it } from 'vitest';
import { RelatorioCliente } from '../types';
import { descreverPeriodo, gerarRelatorioClientePdf, nomeArquivoRelatorio } from './gerarRelatorioCliente';

const relatorio = (quantidade: number): RelatorioCliente => ({
  cliente: { id: 1, nome: 'João & Comércio', documento: '12.345.678/0001-90', telefone: null },
  periodo: { data_inicio: '2026-03-01', data_fim: '2026-04-30', tipo_data: 'emissao' },
  resumo: { quantidade, valor_total: quantidade * 100, valor_pago: 0, saldo_pendente: quantidade * 100 },
  titulos: Array.from({ length: quantidade }, (_, i) => ({
    venda_id: i + 1,
    numero_nfe: null,
    descricao: `Pedido #${i + 1}`,
    data_emissao: '2026-03-05',
    data_vencimento: null,
    valor_original: 100,
    valor_pago: 0,
    saldo: 100,
    status_financeiro: 'aberto' as const,
  })),
  gerado_em: '2026-11-06T10:00:00',
});

describe('relatório de notas por cliente', () => {
  it('nomeia o arquivo sem acentos e com o período', () => {
    expect(nomeArquivoRelatorio(relatorio(1))).toBe('Relatorio_Joao_Comercio_2026-03-01_a_2026-04-30.pdf');
  });

  it('descreve o período e a data usada', () => {
    expect(descreverPeriodo(relatorio(1))).toBe('01/03/2026 a 30/04/2026 (por emissão)');
  });

  it('pagina listas longas e numera todas as páginas', () => {
    const pdf = gerarRelatorioClientePdf(relatorio(120), 'Minha Empresa');
    const paginas = pdf.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);
    expect(pdf.output()).toContain(`de ${paginas}`);
  });

  it('gera o PDF mesmo sem notas no período', () => {
    expect(gerarRelatorioClientePdf(relatorio(0)).getNumberOfPages()).toBe(1);
  });
});
