/**
 * Funções de validação e formatação de documentos (CPF e CNPJ)
 */

/**
 * Remove caracteres não numéricos
 */
export const apenasNumeros = (texto: string): string => {
  return texto.replace(/\D/g, '');
};

/**
 * Valida CPF
 */
export const validarCPF = (cpf: string): boolean => {
  const numeros = apenasNumeros(cpf);
  
  // Deve ter 11 dígitos
  if (numeros.length !== 11) return false;
  
  // Não pode ter todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(numeros)) return false;
  
  // Valida primeiro dígito verificador
  let soma = 0;
  let resto;
  
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(numeros.substring(i - 1, i)) * (11 - i);
  }
  
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros.substring(9, 10))) return false;
  
  // Valida segundo dígito verificador
  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(numeros.substring(i - 1, i)) * (12 - i);
  }
  
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(numeros.substring(10, 11))) return false;
  
  return true;
};

/**
 * Valida CNPJ
 */
export const validarCNPJ = (cnpj: string): boolean => {
  const numeros = apenasNumeros(cnpj);
  
  // Deve ter 14 dígitos
  if (numeros.length !== 14) return false;
  
  // Não pode ter todos os dígitos iguais
  if (/^(\d)\1{13}$/.test(numeros)) return false;
  
  // Valida primeiro dígito verificador
  let tamanho = numeros.length - 2;
  let numeros_calc = numeros.substring(0, tamanho);
  let digito = numeros.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros_calc.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digito.charAt(0))) return false;
  
  // Valida segundo dígito verificador
  tamanho = numeros.length - 1;
  numeros_calc = numeros.substring(0, tamanho);
  digito = numeros.substring(tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros_calc.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado !== parseInt(digito.charAt(0))) return false;
  
  return true;
};

/**
 * Formata CPF com máscara
 * Entrada: 12345678901
 * Saída: 123.456.789-01
 */
export const formatarCPF = (cpf: string): string => {
  const numeros = apenasNumeros(cpf);
  return numeros
    .substring(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{2})$/, '$1-$2');
};

/**
 * Formata CNPJ com máscara
 * Entrada: 12345678901234
 * Saída: 12.345.678/0001-34
 */
export const formatarCNPJ = (cnpj: string): string => {
  const numeros = apenasNumeros(cnpj);
  return numeros
    .substring(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{2})$/, '$1-$2');
};

/**
 * Formata telefone com máscara
 * Entrada: 11987654321
 * Saída: (11) 98765-4321
 */
export const formatarTelefone = (telefone: string): string => {
  const numeros = apenasNumeros(telefone);
  if (numeros.length === 11) {
    return numeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (numeros.length === 10) {
    return numeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return numeros;
};

/**
 * Formata CEP com máscara
 * Entrada: 12345678
 * Saída: 12345-678
 */
export const formatarCEP = (cep: string): string => {
  const numeros = apenasNumeros(cep);
  return numeros
    .substring(0, 8)
    .replace(/(\d{5})(\d{3})$/, '$1-$2');
};

/**
 * Detecta se é CPF ou CNPJ e formata automaticamente
 */
export const formatarDocumento = (documento: string): string => {
  const numeros = apenasNumeros(documento);
  
  if (numeros.length === 11) {
    return formatarCPF(documento);
  } else if (numeros.length === 14) {
    return formatarCNPJ(documento);
  }
  
  return documento;
};

/**
 * Valida documento (CPF ou CNPJ)
 */
export const validarDocumento = (documento: string): boolean => {
  const numeros = apenasNumeros(documento);
  
  if (numeros.length === 11) {
    return validarCPF(documento);
  } else if (numeros.length === 14) {
    return validarCNPJ(documento);
  }
  
  return false;
};
