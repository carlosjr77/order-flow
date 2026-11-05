import { describe, expect, it } from 'vitest';
import { ExtratoCliente } from '../types';
import {
  centavosParaTexto,
  mensagemErroApi,
  montarMensagemWhatsApp,
  montarUrlWhatsApp,
  paraCentavos,
  resumirDistribuicao,
  sugerirDistribuicao,
  textoParaCentavos,
} from './financeiro';
import { nomeArquivoExtrato } from './gerarExtratoCliente';

describe('textoParaCentavos', () => {
  it.each([
    ['3000', 300000],
    ['3.000,50', 300050],
    ['3000,5', 300050],
    ['1931.00', 193100],
    ['1.500', 150000],
    ['0,07', 7],
    ['R$ 10,00', 1000],
  ])('interpreta %s', (texto, esperado) => {
    expect(textoParaCentavos(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '10,999', '1,2,3'])('rejeita %s', (texto) => {
    expect(textoParaCentavos(texto)).toBeNull();
  });
});

it('converte reais sem erro de ponto flutuante', () => {
  expect(paraCentavos(19.99)).toBe(1999);
  expect(paraCentavos(1.1 + 2.2)).toBe(330);
  expect(centavosParaTexto(193100)).toBe('1931.00');
  expect(centavosParaTexto(7)).toBe('0.07');
});

describe('sugerirDistribuicao', () => {
  const titulos = [
    { venda_id: 3, saldo: 100, data_vencimento: null },
    { venda_id: 2, saldo: 200, data_vencimento: '2026-08-01' },
    { venda_id: 1, saldo: 300, data_vencimento: '2026-01-01' },
    { venda_id: 4, saldo: 0, data_vencimento: '2025-01-01' },
  ];

  it('quita primeiro o vencimento mais antigo e deixa sem vencimento por último', () => {
    expect(sugerirDistribuicao(titulos, 40000)).toEqual({ 1: 30000, 2: 10000 });
  });

  it('não ultrapassa o saldo das notas', () => {
    expect(sugerirDistribuicao(titulos, 100000)).toEqual({ 1: 30000, 2: 20000, 3: 10000 });
  });

  it('desempata pelo menor id', () => {
    const iguais = [
      { venda_id: 9, saldo: 10, data_vencimento: '2026-01-01' },
      { venda_id: 8, saldo: 10, data_vencimento: '2026-01-01' },
    ];
    expect(sugerirDistribuicao(iguais, 1000)).toEqual({ 8: 1000 });
  });

  it('valor zero não sugere nada', () => {
    expect(sugerirDistribuicao(titulos, 0)).toEqual({});
  });

  it('trabalha em centavos exatos', () => {
    expect(sugerirDistribuicao([{ venda_id: 1, saldo: 0.1, data_vencimento: null }, { venda_id: 2, saldo: 0.2, data_vencimento: null }], 30))
      .toEqual({ 1: 10, 2: 20 });
  });
});

describe('resumirDistribuicao', () => {
  it('mostra a sobra como crédito', () => {
    expect(resumirDistribuicao(300000, { 1: 100000, 2: 150000 })).toEqual({ alocado: 250000, credito: 50000, excedente: 0 });
  });

  it('aponta alocação maior que o recebido', () => {
    expect(resumirDistribuicao(1000, { 1: 1500 })).toEqual({ alocado: 1500, credito: 0, excedente: 500 });
  });
});

const extrato: ExtratoCliente = {
  cliente: { id: 1, nome: 'Mercado Exemplo', documento: '1', telefone: '(11) 98888-7777' },
  resumo: {
    total_bruto: 10531,
    total_em_aberto: 7531,
    total_recebido: 3000,
    total_recebido_avulso: 3000,
    credito_disponivel: 0,
    saldo_liquido: 7531,
  },
  titulos: [],
  recebimentos: [],
  gerado_em: '2026-11-05T10:30:00',
};

describe('WhatsApp', () => {
  it('monta o resumo do extrato', () => {
    const texto = montarMensagemWhatsApp(extrato);
    expect(texto).toContain('Mercado Exemplo');
    expect(texto).toMatch(/Saldo devedor atual: R\$\s7\.531,00/);
    expect(texto).toMatch(/Pagamentos efetuados: R\$\s3\.000,00/);
  });

  it('avisa quando o saldo é a favor do cliente', () => {
    const texto = montarMensagemWhatsApp({ ...extrato, resumo: { ...extrato.resumo, saldo_liquido: -50 } });
    expect(texto).toMatch(/Saldo a favor do cliente: R\$\s50,00/);
  });

  it.each([
    ['(11) 98888-7777', 'https://wa.me/5511988887777?text=Oi'],
    ['1133334444', 'https://wa.me/551133334444?text=Oi'],
    ['+55 11 98888-7777', 'https://wa.me/5511988887777?text=Oi'],
    ['123', 'https://wa.me/?text=Oi'],
    [null, 'https://wa.me/?text=Oi'],
  ])('monta a URL para %s', (telefone, url) => {
    expect(montarUrlWhatsApp(telefone, 'Oi')).toBe(url);
  });

  it('codifica o texto da URL', () => {
    expect(montarUrlWhatsApp(null, 'a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });
});

it('remove acentos do nome do arquivo do extrato', () => {
  const comAcento = { ...extrato, cliente: { ...extrato.cliente, nome: 'João & Comércio' } };
  expect(nomeArquivoExtrato(comAcento)).toBe('Extrato_Joao_Comercio_2026-11-05.pdf');
});

describe('mensagemErroApi', () => {
  it('extrai o detail do backend', () => {
    expect(mensagemErroApi(new Error('API Error 409: {"detail":"Saldo insuficiente"}'))).toBe('Saldo insuficiente');
  });

  it('explica erro de validação', () => {
    const erro = new Error('API Error 422: {"detail":[{"msg":"Input should be greater than 0"}]}');
    expect(mensagemErroApi(erro)).toBe('Dados inválidos. Confira os valores informados.');
  });

  it('mantém mensagem que não é JSON', () => {
    expect(mensagemErroApi(new Error('Failed to fetch'))).toBe('Failed to fetch');
  });
});
