import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { apiClient } from '../../services/api';
import { ResumoDevedores } from '../../types';
import { formatarData, formatarMoeda, mensagemErroApi } from '../../utils/financeiro';

interface Props {
  versao: number;
  onAbrirCliente: (clienteId: number) => void;
  onAbrirFinanceiro: () => void;
}

/** Resumo de quem está devendo, para lembrar dos débitos na hora de montar a compra. */
export const DebitosClientesCard: React.FC<Props> = ({ versao, onAbrirCliente, onAbrirFinanceiro }) => {
  const [resumo, setResumo] = useState<ResumoDevedores | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiClient.resumoDevedores(5).then(setResumo).catch((e) => setErro(mensagemErroApi(e)));
  }, [versao]);

  return (
    <Card className="p-4 border-0 shadow-sm bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />Débitos de clientes
        </h2>
        <button className="text-xs text-teal-700 hover:underline" onClick={onAbrirFinanceiro}>Ver no Financeiro</button>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!resumo && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {resumo && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-md bg-amber-50 p-2">
              <p className="text-xs text-amber-800">Em aberto</p>
              <p className="font-bold text-amber-900">{formatarMoeda(Number(resumo.total_saldo))}</p>
            </div>
            <div className="rounded-md bg-red-50 p-2">
              <p className="text-xs text-red-800">Vencido</p>
              <p className="font-bold text-red-900">{formatarMoeda(Number(resumo.total_vencido))}</p>
            </div>
          </div>
          {resumo.clientes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cliente com saldo em aberto.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {resumo.clientes.map((c) => (
                <li key={`${c.cliente_id}-${c.cliente_nome}`}>
                  <button
                    className="w-full flex items-center justify-between py-2 text-left disabled:cursor-default"
                    disabled={c.cliente_id === null}
                    onClick={() => c.cliente_id !== null && onAbrirCliente(c.cliente_id)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{c.cliente_nome}</span>
                      <span className="block text-xs text-slate-500">
                        {c.titulos} título(s)
                        {Number(c.vencido) > 0 ? ` · ${formatarMoeda(Number(c.vencido))} vencido` : ''}
                        {c.vencimento_mais_antigo ? ` · desde ${formatarData(c.vencimento_mais_antigo)}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-900 whitespace-nowrap">
                      {formatarMoeda(Number(c.saldo))}
                      {c.cliente_id !== null && <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
};
