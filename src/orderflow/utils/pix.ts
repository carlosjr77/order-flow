/**
 * Pix estático com valor (BR Code / EMV QRCPS), conforme o Manual de Padrões para Iniciação do Pix do Banco Central.
 * Cada campo é ID (2 dígitos) + tamanho (2 dígitos) + valor, e o payload termina com o CRC16 do campo 63.
 */

export interface DadosPix {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  /** Valor em reais. Zero ou ausente gera um QR em que o pagador digita o valor. */
  valor?: number;
  /** Identificador que aparece no extrato do recebedor. Só letras e números, até 25 caracteres. */
  txid?: string;
}

export class PixInvalidoError extends Error {}

const campo = (id: string, valor: string): string => {
  if (valor.length > 99) throw new PixInvalidoError(`Campo ${id} do Pix excede 99 caracteres.`);
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
};

/** Remove acentos e caracteres fora do padrão, em maiúsculas, como pedem os campos 59 e 60. */
export const normalizarTextoPix = (texto: string, tamanhoMaximo: number): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, tamanhoMaximo)
    .trim();

/** CPF e CNPJ vão só com dígitos; e-mail em minúsculas; telefone e chave aleatória como estão. */
export const normalizarChavePix = (chave: string): string => {
  const limpa = chave.trim();
  if (/^[\d.\-/\s]+$/.test(limpa)) return limpa.replace(/\D/g, '');
  if (limpa.includes('@')) return limpa.toLowerCase();
  return limpa;
};

/** CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF), em 4 dígitos hexadecimais. */
export const crc16 = (texto: string): string => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export const montarPayloadPix = ({ chave, nomeRecebedor, cidade, valor, txid }: DadosPix): string => {
  const chaveNormalizada = normalizarChavePix(chave);
  if (!chaveNormalizada || chaveNormalizada.length > 77) {
    throw new PixInvalidoError('Chave Pix ausente ou inválida.');
  }
  const nome = normalizarTextoPix(nomeRecebedor, 25);
  const cidadeNormalizada = normalizarTextoPix(cidade, 15);
  if (!nome || !cidadeNormalizada) {
    throw new PixInvalidoError('Nome e cidade da empresa são obrigatórios para o Pix.');
  }
  if (valor !== undefined && (!Number.isFinite(valor) || valor < 0)) {
    throw new PixInvalidoError('Valor do Pix inválido.');
  }
  const identificador = (txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const valorCentavos = Math.round((valor ?? 0) * 100);

  const semCrc = [
    campo('00', '01'),
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chaveNormalizada)),
    campo('52', '0000'),
    campo('53', '986'),
    valorCentavos > 0 ? campo('54', (valorCentavos / 100).toFixed(2)) : '',
    campo('58', 'BR'),
    campo('59', nome),
    campo('60', cidadeNormalizada),
    campo('62', campo('05', identificador)),
    '6304',
  ].join('');

  return semCrc + crc16(semCrc);
};

/** Exibe CPF/CNPJ com máscara; demais chaves como estão. */
export const formatarChavePix = (chave: string): string => {
  const normalizada = normalizarChavePix(chave);
  if (/^\d{14}$/.test(normalizada)) {
    return normalizada.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (/^\d{11}$/.test(normalizada)) {
    return normalizada.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return normalizada;
};
