/**
 * Utilitários de formatação para dados monetários e numéricos
 */

/**
 * Formata um número como moeda brasileira
 */
export const formatarMoeda = (valor: number | string): string => {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

/**
 * Aplica máscara de moeda em um valor de entrada
 * Exemplo: "1250" -> "12,50"
 */
export const aplicarMascaraMoeda = (valor: string): string => {
  // Remove tudo que não é número
  const apenasNumeros = valor.replace(/\D/g, '');

  // Se vazio, retorna vazio
  if (!apenasNumeros) return '';

  // Converte para número
  const num = parseInt(apenasNumeros, 10);

  // Formata como moeda (sem símbolo)
  return (num / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Converte um valor formatado em moeda para número
 * Exemplo: "12,50" -> 12.50
 */
export const extrairValorMoeda = (valor: string): number => {
  // Remove espaços e símbolo de moeda
  const limpo = valor.replace(/[^\d,]/g, '');
  // Substitui vírgula por ponto para parseFloat
  const normalizado = limpo.replace(',', '.');
  return parseFloat(normalizado) || 0;
};

/**
 * Formata um número inteiro com separador de milhares
 */
export const formatarNumero = (valor: number): string => {
  return valor.toLocaleString('pt-BR');
};

/**
 * Aplica máscara de CEP (00000-000)
 */
export const aplicarMascaraCep = (valor: string): string => {
  const apenasNumeros = valor.replace(/\D/g, '');
  if (apenasNumeros.length <= 5) return apenasNumeros;
  return apenasNumeros.slice(0, 5) + '-' + apenasNumeros.slice(5, 8);
};

/**
 * Aplica máscara de CPF/CNPJ
 */
export const aplicarMascaraDocumento = (valor: string): string => {
  const apenasNumeros = valor.replace(/\D/g, '');
  if (apenasNumeros.length <= 11) {
    // CPF: 000.000.000-00
    if (apenasNumeros.length <= 3) return apenasNumeros;
    if (apenasNumeros.length <= 6) return apenasNumeros.slice(0, 3) + '.' + apenasNumeros.slice(3);
    if (apenasNumeros.length <= 9) return apenasNumeros.slice(0, 3) + '.' + apenasNumeros.slice(3, 6) + '.' + apenasNumeros.slice(6);
    return apenasNumeros.slice(0, 3) + '.' + apenasNumeros.slice(3, 6) + '.' + apenasNumeros.slice(6, 9) + '-' + apenasNumeros.slice(9, 11);
  } else {
    // CNPJ: 00.000.000/0000-00
    if (apenasNumeros.length <= 2) return apenasNumeros;
    if (apenasNumeros.length <= 5) return apenasNumeros.slice(0, 2) + '.' + apenasNumeros.slice(2);
    if (apenasNumeros.length <= 8) return apenasNumeros.slice(0, 2) + '.' + apenasNumeros.slice(2, 5) + '.' + apenasNumeros.slice(5);
    if (apenasNumeros.length <= 12) return apenasNumeros.slice(0, 2) + '.' + apenasNumeros.slice(2, 5) + '.' + apenasNumeros.slice(5, 8) + '/' + apenasNumeros.slice(8);
    return apenasNumeros.slice(0, 2) + '.' + apenasNumeros.slice(2, 5) + '.' + apenasNumeros.slice(5, 8) + '/' + apenasNumeros.slice(8, 12) + '-' + apenasNumeros.slice(12, 14);
  }
};

/**
 * Aplica máscara de valor monetário ao digitar
 * Ex: "5" -> "5,00"
 */
export const aplicarMascaraValor = (valor: string): string => {
  const apenasNumeros = valor.replace(/\D/g, '');
  if (!apenasNumeros) return '';
  const num = parseInt(apenasNumeros, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
