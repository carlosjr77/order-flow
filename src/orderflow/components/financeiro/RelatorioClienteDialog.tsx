import React, { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiClient } from '../../services/api';
import { DadosEmpresa, RelatorioCliente, TipoDataFiltro } from '../../types';
import { dataDeHoje, formatarMoeda, mensagemErroApi } from '../../utils/financeiro';
import { gerarRelatorioClientePdf, nomeArquivoRelatorio } from '../../utils/gerarRelatorioCliente';
import { ClienteAutocomplete } from './ClienteAutocomplete';
import { ClienteResumo } from './RecebimentoModal';

interface RelatorioClienteDialogProps {
  aberto: boolean;
  clienteInicial?: ClienteResumo | null;
  onFechar: () => void;
}

const CLASSE_SELECT =
  'w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

const primeiroDiaDoMes = () => `${dataDeHoje().slice(0, 8)}01`;

export const RelatorioClienteDialog: React.FC<RelatorioClienteDialogProps> = ({ aberto, clienteInicial, onFechar }) => {
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [textoCliente, setTextoCliente] = useState('');
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [tipoData, setTipoData] = useState<TipoDataFiltro>('emissao');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState<RelatorioCliente['resumo'] | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setCliente(clienteInicial ?? null);
    setTextoCliente(clienteInicial?.nome ?? '');
    setErro('');
    setResumo(null);
  }, [aberto, clienteInicial]);

  const problema = !cliente
    ? 'Selecione o cliente na lista.'
    : !dataInicio || !dataFim
      ? 'Informe a data inicial e a final.'
      : dataInicio > dataFim
        ? 'A data inicial não pode ser maior que a data final.'
        : '';

  const gerar = async (destino: 'abrir' | 'baixar') => {
    if (problema || !cliente || gerando) return;
    // A aba é aberta já no clique: depois de esperar a API, o navegador bloquearia o pop-up.
    const aba = destino === 'abrir' ? window.open('', '_blank') : null;
    setGerando(true);
    setErro('');
    try {
      const [relatorio, empresa] = await Promise.all([
        apiClient.obterRelatorioCliente(cliente.id, { data_inicio: dataInicio, data_fim: dataFim, tipo_data: tipoData }),
        (apiClient.obterDadosEmpresa() as Promise<DadosEmpresa | null>).catch(() => null),
      ]);
      setResumo(relatorio.resumo);
      const pdf = gerarRelatorioClientePdf(relatorio, empresa?.nome);
      if (aba) {
        const url = URL.createObjectURL(pdf.output('blob'));
        aba.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        pdf.save(nomeArquivoRelatorio(relatorio));
      }
    } catch (e) {
      aba?.close();
      setErro(mensagemErroApi(e));
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && !gerando && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Relatório de notas por cliente</DialogTitle>
          <DialogDescription>
            Notas do cliente no período, com quantidade, valor total e valor pendente. Notas canceladas ficam de fora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="relatorio-cliente" className="block text-xs font-medium text-gray-700 mb-1">Cliente</label>
            <ClienteAutocomplete
              id="relatorio-cliente"
              valor={textoCliente}
              onValorChange={(texto) => {
                setTextoCliente(texto);
                setCliente(null);
                setResumo(null);
              }}
              onSelecionar={(selecionado) => {
                setTextoCliente(selecionado.nome);
                setCliente({ id: selecionado.id, nome: selecionado.nome });
                setResumo(null);
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="relatorio-inicio" className="block text-xs font-medium text-gray-700 mb-1">Data inicial</label>
              <Input id="relatorio-inicio" type="date" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setResumo(null); }} />
            </div>
            <div>
              <label htmlFor="relatorio-fim" className="block text-xs font-medium text-gray-700 mb-1">Data final</label>
              <Input id="relatorio-fim" type="date" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setResumo(null); }} />
            </div>
            <div>
              <label htmlFor="relatorio-tipo-data" className="block text-xs font-medium text-gray-700 mb-1">Período por</label>
              <select
                id="relatorio-tipo-data"
                className={CLASSE_SELECT}
                value={tipoData}
                onChange={(e) => { setTipoData(e.target.value as TipoDataFiltro); setResumo(null); }}
              >
                <option value="emissao">Emissão</option>
                <option value="vencimento">Vencimento</option>
              </select>
            </div>
          </div>

          {resumo && (
            <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Notas</p>
                <p className="font-semibold text-slate-900">{resumo.quantidade}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Valor total</p>
                <p className="font-semibold text-slate-900">{formatarMoeda(resumo.valor_total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pendente</p>
                <p className="font-semibold text-red-700">{formatarMoeda(resumo.saldo_pendente)}</p>
              </div>
            </div>
          )}

          {erro && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          {!erro && problema && textoCliente && <p className="text-sm text-amber-700">{problema}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={Boolean(problema) || gerando} onClick={() => void gerar('baixar')}>
              <Download className="w-4 h-4 mr-2" />Baixar PDF
            </Button>
            <Button
              type="button"
              className="bg-sky-600 hover:bg-sky-700"
              disabled={Boolean(problema) || gerando}
              onClick={() => void gerar('abrir')}
            >
              <Printer className="w-4 h-4 mr-2" />{gerando ? 'Gerando...' : 'Gerar Relatório PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
