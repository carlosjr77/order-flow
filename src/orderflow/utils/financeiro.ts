import { ExtratoCliente, OrigemRecebimento, StatusFinanceiro } from '../types';

/** Cálculos do modal usam centavos inteiros. O backend revalida tudo. */
export type Distribuicao = Record<number, number>;

export interface TituloDistribuivel {
  venda_id: number;
  saldo: number;
  data_vencimento: string | null;
}

export const FORMAS_RECEBIMENTO = ['PIX', 'Boleto', 'Transferência'] as const;

export const ROTULO_STATUS: Record<StatusFinanceiro, string> = {
  aberto: 'Em aberto',
  parcial: 'Pago Parcialmente',
  liquidada: 'Liquidada',
};

export const OPCOES_STATUS_FINANCEIRO = (Object.keys(ROTULO_STATUS) as StatusFinanceiro[]).map((valor) => ({
  valor,
  rotulo: ROTULO_STATUS[valor],
}));

export const COR_STATUS: Record<StatusFinanceiro, string> = {
  aberto: 'bg-yellow-100 text-yellow-800',
  parcial: 'bg-blue-100 text-blue-800',
  liquidada: 'bg-green-100 text-green-800',
};

export const ROTULO_ORIGEM: Record<OrigemRecebimento, string> = {
  avulso: 'Recebimento avulso',
  conclusao: 'Baixa total da venda',
  migracao: 'Baixa anterior ao módulo financeiro',
};

export const paraCentavos = (valor: number): number => Math.round(Number(valor || 0) * 100);

export const centavosParaTexto = (centavos: number): string => (centavos / 100).toFixed(2);

export const formatarMoeda = (valor: number): string =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatarCentavos = (centavos: number): string => formatarMoeda(centavos / 100);

/** Datas sem hora são tratadas como locais, para não voltar um dia por causa do fuso. */
export const formatarData = (valor?: string | null): string => {
  if (!valor) return '-';
  const data = new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00` : valor);
  return Number.isNaN(data.getTime()) ? '-' : data.toLocaleDateString('pt-BR');
};

export const dataDeHoje = (): string => {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

/**
 * Aceita "3000", "3000,50", "3.000,50" e "1931.00". Ponto seguido de exatamente
 * três dígitos é separador de milhar, como em "1.500".
 */
export const textoParaCentavos = (texto: string): number | null => {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  let normalizado: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(,\d{1,2})?$/.test(limpo)) {
    normalizado = limpo.replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    normalizado = limpo;
  } else {
    return null;
  }
  return Math.round(Number(normalizado) * 100);
};

const ordemVencimento = (a: TituloDistribuivel, b: TituloDistribuivel): number => {
  if (a.data_vencimento && b.data_vencimento && a.data_vencimento !== b.data_vencimento) {
    return a.data_vencimento < b.data_vencimento ? -1 : 1;
  }
  if (a.data_vencimento && !b.data_vencimento) return -1;
  if (!a.data_vencimento && b.data_vencimento) return 1;
  return a.venda_id - b.venda_id;
};

/** Distribui o valor a partir do vencimento mais antigo, sem ultrapassar o saldo de cada nota. */
export const sugerirDistribuicao = (titulos: TituloDistribuivel[], valorCentavos: number): Distribuicao => {
  const distribuicao: Distribuicao = {};
  let restante = valorCentavos;
  for (const titulo of [...titulos].sort(ordemVencimento)) {
    if (restante <= 0) break;
    const parcela = Math.min(restante, paraCentavos(titulo.saldo));
    if (parcela > 0) {
      distribuicao[titulo.venda_id] = parcela;
      restante -= parcela;
    }
  }
  return distribuicao;
};

export const resumirDistribuicao = (valorCentavos: number, distribuicao: Distribuicao) => {
  const alocado = Object.values(distribuicao).reduce((soma, valor) => soma + valor, 0);
  return {
    alocado,
    credito: Math.max(valorCentavos - alocado, 0),
    excedente: Math.max(alocado - valorCentavos, 0),
  };
};

export const montarMensagemWhatsApp = ({ cliente, resumo, gerado_em }: ExtratoCliente): string => {
  const linhas = [
    `*Extrato financeiro - ${cliente.nome}*`,
    `Gerado em: ${formatarData(gerado_em)}`,
    '',
    `Total de notas: ${formatarMoeda(resumo.total_bruto)}`,
    `Pagamentos efetuados: ${formatarMoeda(resumo.total_recebido)}`,
  ];
  if (resumo.credito_disponivel > 0) {
    linhas.push(`Crédito disponível: ${formatarMoeda(resumo.credito_disponivel)}`);
  }
  linhas.push(
    resumo.saldo_liquido < 0
      ? `*Saldo a favor do cliente: ${formatarMoeda(-resumo.saldo_liquido)}*`
      : `*Saldo devedor atual: ${formatarMoeda(resumo.saldo_liquido)}*`
  );
  return linhas.join('\n');
};

/** Telefone ausente ou inválido abre o WhatsApp sem destinatário, para o usuário escolher o contato. */
export const montarUrlWhatsApp = (telefone: string | null | undefined, texto: string): string => {
  let digitos = (telefone || '').replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  const destino = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : '';
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
};

/** O cliente de API lança `API Error <código>: <corpo>`. Devolve a mensagem legível do backend. */
export const mensagemErroApi = (erro: unknown): string => {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const inicioJson = mensagem.indexOf('{');
  if (inicioJson >= 0) {
    try {
      const { detail } = JSON.parse(mensagem.slice(inicioJson));
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return 'Dados inválidos. Confira os valores informados.';
    } catch {
      // Corpo não é JSON: usa a mensagem original.
    }
  }
  return mensagem;
};
