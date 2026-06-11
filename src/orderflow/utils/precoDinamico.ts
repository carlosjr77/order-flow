/**
 * Calcula o preço de venda de um produto baseado na hierarquia:
 * 1. Se preco_venda estiver preenchido, usa esse valor
 * 2. Se o produto tiver margem_lucro específica, usa: preco_custo * (1 + margem_lucro)
 * 3. Usa a margem geral da empresa: preco_custo * (1 + margem_geral)
 * 
 * @param precoCusto - Preço de custo do produto
 * @param precoVenda - Preço de venda cadastrado (pode ser null)
 * @param margemProduto - Margem específica do produto (pode ser null)
 * @param margemGeral - Margem geral da empresa (padrão 1.0 = 100%)
 * @returns O preço de venda calculado
 */
export function calcularPrecoVenda(
  precoCusto: number,
  precoVenda: number | null | undefined,
  margemProduto: number | null | undefined,
  margemGeral: number | null | undefined = 1.0
): number {
  // 1. Se preco_venda estiver preenchido, usa esse valor
  if (precoVenda !== null && precoVenda !== undefined && precoVenda > 0) {
    return precoVenda;
  }

  // 2. Se produto tiver margem específica, usa ela
  if (margemProduto !== null && margemProduto !== undefined && margemProduto >= 0) {
    return precoCusto * (1 + margemProduto);
  }

  // 3. Usa margem geral da empresa
  return precoCusto * (1 + (margemGeral ?? 1.0));
}

/**
 * Formata o preço para exibição
 */
export function formatarPreco(preco: number): string {
  return preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Retorna o preço formatado para exibição no PDV
 */
export function getPrecoExibicao(
  precoCusto: number,
  precoVenda: number | null | undefined,
  margemProduto: number | null | undefined,
  margemGeral: number | null | undefined = 1.0
): string {
  const precoFinal = calcularPrecoVenda(precoCusto, precoVenda, margemProduto, margemGeral);
  return `R$ ${formatarPreco(precoFinal)}`;
}