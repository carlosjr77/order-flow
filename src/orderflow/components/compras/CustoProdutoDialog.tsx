import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiClient } from '../../services/api';
import { HistoricoCusto, OrigemCusto } from '../../types';
import { ROTULO_ORIGEM_CUSTO } from '../../utils/compras';
import { formatarMoeda, mensagemErroApi, textoParaCentavos } from '../../utils/financeiro';

export interface ProdutoCusto {
  produto_id: number;
  descricao: string;
  unidade_medida: string;
  preco_custo: number;
}

interface Props {
  produto: ProdutoCusto | null;
  onFechar: () => void;
  onSalvo: () => void;
}

/** Atualiza o custo de um produto (ex.: compra no CEASA sem nota) e mostra o histórico. */
export const CustoProdutoDialog: React.FC<Props> = ({ produto, onFechar, onSalvo }) => {
  const [valor, setValor] = useState('');
  const [origem, setOrigem] = useState<OrigemCusto>('ceasa_sem_nf');
  const [observacao, setObservacao] = useState('');
  const [historico, setHistorico] = useState<HistoricoCusto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!produto) return;
    setValor(produto.preco_custo.toFixed(2).replace('.', ','));
    setOrigem('ceasa_sem_nf');
    setObservacao('');
    setErro('');
    apiClient.listarHistoricoCusto(produto.produto_id, 10).then(setHistorico).catch(() => setHistorico([]));
  }, [produto]);

  const salvar = async () => {
    if (!produto) return;
    const centavos = textoParaCentavos(valor);
    if (centavos === null || centavos < 0) {
      setErro('Informe um custo válido, por exemplo 3,50.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await apiClient.atualizarCustoProduto(produto.produto_id, centavos / 100, origem, observacao.trim());
      onSalvo();
      onFechar();
    } catch (e) {
      setErro(mensagemErroApi(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={produto !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atualizar preço de custo</DialogTitle>
          <DialogDescription>
            {produto?.descricao} · por {produto?.unidade_medida}. Custo atual {formatarMoeda(produto?.preco_custo ?? 0)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block font-medium text-slate-700 mb-1">Novo custo (R$)</span>
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && salvar()}
                autoFocus
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-slate-700 mb-1">Origem</span>
              <select
                className="w-full h-10 px-3 border border-slate-300 rounded-md bg-white"
                value={origem}
                onChange={(e) => setOrigem(e.target.value as OrigemCusto)}
              >
                {(Object.keys(ROTULO_ORIGEM_CUSTO) as OrigemCusto[]).map((o) => (
                  <option key={o} value={o}>{ROTULO_ORIGEM_CUSTO[o]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-sm block">
            <span className="block font-medium text-slate-700 mb-1">Observação (opcional)</span>
            <Input
              maxLength={255}
              placeholder="Ex.: Box 12 CEASA, nota chega sexta"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            Os pedidos já feitos mantêm o custo da época. As tabelas de preço passam a calcular a partir do novo custo.
          </p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button className="bg-teal-700 hover:bg-teal-800" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando...' : 'Salvar custo'}
            </Button>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm font-medium text-slate-700 mb-2">Últimas alterações</p>
            {historico.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                {historico.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 text-slate-600">
                    <span>
                      {new Date(h.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                      {ROTULO_ORIGEM_CUSTO[h.origem] ?? h.origem}
                      {h.observacao ? ` · ${h.observacao}` : ''}
                      {h.usuario_nome ? ` · ${h.usuario_nome}` : ''}
                    </span>
                    <span className="whitespace-nowrap font-medium text-slate-800">
                      {formatarMoeda(h.custo_anterior)} → {formatarMoeda(h.custo_novo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
