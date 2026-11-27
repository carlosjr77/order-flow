import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { Produto } from '../types';
import {
  buscarTodosProdutos,
  gerarProdutosExcel,
  gerarProdutosPdf,
  montarLinhasProdutos,
  nomeArquivoProdutos,
} from './exportarProdutos';

const produto = (id: number, codigo: string, descricao: string) => ({ id, codigo_interno: codigo, descricao }) as Produto;

describe('exportar produtos', () => {
  it('busca todas as páginas da API', async () => {
    const listar = vi.fn(async (skip: number, limit: number) =>
      Array.from({ length: Math.max(Math.min(limit, 2500 - skip), 0) }, (_, i) => produto(skip + i, `${skip + i}`, 'P'))
    );
    const todos = await buscarTodosProdutos(listar);
    expect(todos).toHaveLength(2500);
    expect(listar.mock.calls).toEqual([[0, 1000], [1000, 1000], [2000, 1000]]);
  });

  it('para quando a quantidade é múltipla exata da página', async () => {
    const listar = vi.fn(async (skip: number) => (skip === 0 ? Array.from({ length: 1000 }, (_, i) => produto(i, '1', 'P')) : []));
    expect(await buscarTodosProdutos(listar)).toHaveLength(1000);
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('mantém só código e nome, em ordem alfabética sem diferenciar acento', () => {
    const linhas = montarLinhasProdutos([
      produto(1, ' 003 ', 'Tomate'),
      produto(2, '001', 'Abacaxi'),
      produto(3, '002', 'Água de coco'),
    ]);
    expect(linhas).toEqual([
      { codigo: '001', nome: 'Abacaxi' },
      { codigo: '002', nome: 'Água de coco' },
      { codigo: '003', nome: 'Tomate' },
    ]);
  });

  it('nomeia os arquivos com a data', () => {
    expect(nomeArquivoProdutos('pdf', new Date(2026, 10, 27))).toBe('Produtos_2026-11-27.pdf');
    expect(nomeArquivoProdutos('xlsx', new Date(2026, 0, 5))).toBe('Produtos_2026-01-05.xlsx');
  });

  it('gera PDF paginado com todos os produtos', () => {
    const linhas = Array.from({ length: 150 }, (_, i) => ({ codigo: String(i), nome: `Produto ${i}` }));
    const pdf = gerarProdutosPdf(linhas, 'Minha Empresa');
    const paginas = pdf.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);
    expect(pdf.output()).toContain(`de ${paginas}`);
  });

  it('gera planilha com o código como texto, preservando zeros à esquerda', async () => {
    const blob = await gerarProdutosExcel([
      { codigo: '00123', nome: 'Abacaxi' },
      { codigo: '7891000', nome: 'Água' },
    ]);
    const planilha = new ExcelJS.Workbook();
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result as ArrayBuffer);
      leitor.onerror = reject;
      leitor.readAsArrayBuffer(blob);
    });
    await planilha.xlsx.load(bytes);
    const aba = planilha.getWorksheet('Produtos')!;
    expect(aba.getRow(1).values).toEqual([undefined, 'Código', 'Produto']);
    expect(aba.getCell('A2').value).toBe('00123');
    expect(aba.getCell('A3').value).toBe('7891000');
    expect(aba.getCell('B3').value).toBe('Água');
    expect(aba.rowCount).toBe(3);
  });
});
