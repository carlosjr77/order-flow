import { describe, expect, it } from 'vitest';
import {
  PixInvalidoError,
  crc16,
  formatarChavePix,
  montarPayloadPix,
  normalizarChavePix,
  normalizarTextoPix,
} from './pix';

/** Lê o payload EMV de volta em pares ID → valor, para conferir campo a campo. */
const lerCampos = (payload: string): Record<string, string> => {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
};

describe('crc16', () => {
  it('segue o CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('confere com o exemplo do manual do Banco Central', () => {
    const exemplo =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(exemplo)).toBe('1D3D');
  });
});

describe('montarPayloadPix', () => {
  const payload = montarPayloadPix({
    chave: '68.343.883/0001-76',
    nomeRecebedor: 'Comércio de Alimentos São João Ltda',
    cidade: 'São José dos Campos',
    valor: 1931,
    txid: 'PEDIDO123',
  });
  const campos = lerCampos(payload);

  it('preenche os campos obrigatórios', () => {
    expect(campos['00']).toBe('01');
    expect(campos['52']).toBe('0000');
    expect(campos['53']).toBe('986');
    expect(campos['54']).toBe('1931.00');
    expect(campos['58']).toBe('BR');
    expect(lerCampos(campos['26'])).toEqual({ '00': 'br.gov.bcb.pix', '01': '68343883000176' });
    expect(lerCampos(campos['62'])).toEqual({ '05': 'PEDIDO123' });
  });

  it('limita nome a 25 e cidade a 15 caracteres, sem acentos', () => {
    expect(campos['59']).toBe('COMERCIO DE ALIMENTOS SAO');
    expect(campos['60']).toBe('SAO JOSE DOS CA');
  });

  it('termina com o CRC do próprio conteúdo', () => {
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('formata centavos sem erro de ponto flutuante', () => {
    const p = montarPayloadPix({ chave: '68343883000176', nomeRecebedor: 'Loja', cidade: 'Rio', valor: 0.1 + 0.2 });
    expect(lerCampos(p)['54']).toBe('0.30');
  });

  it('omite o valor quando é zero e usa *** sem identificador', () => {
    const p = lerCampos(montarPayloadPix({ chave: '68343883000176', nomeRecebedor: 'Loja', cidade: 'Rio', valor: 0 }));
    expect(p['54']).toBeUndefined();
    expect(lerCampos(p['62'])['05']).toBe('***');
  });

  it('remove caracteres não permitidos do identificador', () => {
    const p = lerCampos(montarPayloadPix({ chave: 'x@y.com', nomeRecebedor: 'Loja', cidade: 'Rio', txid: 'Pedido #12-3' }));
    expect(lerCampos(p['62'])['05']).toBe('Pedido123');
  });

  it.each([
    [{ chave: '', nomeRecebedor: 'Loja', cidade: 'Rio' }],
    [{ chave: '68343883000176', nomeRecebedor: '!!!', cidade: 'Rio' }],
    [{ chave: '68343883000176', nomeRecebedor: 'Loja', cidade: '' }],
    [{ chave: '68343883000176', nomeRecebedor: 'Loja', cidade: 'Rio', valor: -1 }],
  ])('rejeita dados inválidos %#', (dados) => {
    expect(() => montarPayloadPix(dados)).toThrow(PixInvalidoError);
  });
});

it('normaliza chaves e textos', () => {
  expect(normalizarChavePix(' 68.343.883/0001-76 ')).toBe('68343883000176');
  expect(normalizarChavePix('Financeiro@Empresa.com')).toBe('financeiro@empresa.com');
  expect(normalizarChavePix('+5511988887777')).toBe('+5511988887777');
  expect(normalizarTextoPix('Pão & Café - Ltda.', 25)).toBe('PAO CAFE LTDA');
  expect(formatarChavePix('68343883000176')).toBe('68.343.883/0001-76');
});
