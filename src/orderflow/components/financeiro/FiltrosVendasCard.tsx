import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TipoDataFiltro } from '../../types';
import { ClienteAutocomplete } from './ClienteAutocomplete';

export interface ValoresFiltro {
  busca?: string;
  cliente_id?: number;
  status?: string;
  tipo_data?: TipoDataFiltro;
  data_inicio?: string;
  data_fim?: string;
}

interface FiltrosVendasCardProps {
  opcoesStatus: Array<{ valor: string; rotulo: string }>;
  onAplicar: (valores: ValoresFiltro) => void;
}

const CLASSE_SELECT =
  'w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';

/** Filtros compartilhados pelas telas Financeiro e Vendas. Só valem ao buscar. */
export const FiltrosVendasCard: React.FC<FiltrosVendasCardProps> = ({ opcoesStatus, onAplicar }) => {
  const [textoBusca, setTextoBusca] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [tipoData, setTipoData] = useState<TipoDataFiltro>('emissao');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const aplicar = (cliente: number | null = clienteId) => {
    onAplicar({
      busca: cliente ? undefined : textoBusca.trim() || undefined,
      cliente_id: cliente ?? undefined,
      status: status || undefined,
      tipo_data: tipoData,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
    });
  };

  const limpar = () => {
    setTextoBusca('');
    setClienteId(null);
    setStatus('');
    setTipoData('emissao');
    setDataInicio('');
    setDataFim('');
    onAplicar({});
  };

  return (
    <Card className="p-5 border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-4">
          <label htmlFor="busca-titulos" className="block text-xs font-medium text-gray-700 mb-1">Cliente ou CPF/CNPJ</label>
          <ClienteAutocomplete
            id="busca-titulos"
            valor={textoBusca}
            onValorChange={(texto) => {
              setTextoBusca(texto);
              setClienteId(null);
            }}
            onSelecionar={(cliente) => {
              setTextoBusca(cliente.nome);
              setClienteId(cliente.id);
              aplicar(cliente.id);
            }}
            onEnter={() => aplicar()}
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="filtro-status" className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select id="filtro-status" className={CLASSE_SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {opcoesStatus.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="filtro-tipo-data" className="block text-xs font-medium text-gray-700 mb-1">Período por</label>
          <select id="filtro-tipo-data" className={CLASSE_SELECT} value={tipoData} onChange={(e) => setTipoData(e.target.value as TipoDataFiltro)}>
            <option value="emissao">Emissão</option>
            <option value="vencimento">Vencimento</option>
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="filtro-inicio" className="block text-xs font-medium text-gray-700 mb-1">De</label>
          <Input id="filtro-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="filtro-fim" className="block text-xs font-medium text-gray-700 mb-1">Até</label>
          <Input id="filtro-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={limpar}>Limpar filtros</Button>
        <Button className="bg-sky-600 hover:bg-sky-700" onClick={() => aplicar()}>
          <Search className="w-4 h-4 mr-2" />Buscar
        </Button>
      </div>
    </Card>
  );
};
