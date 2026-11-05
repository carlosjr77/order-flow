import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '../../hooks/useDebounce';
import { apiClient } from '../../services/api';
import { Cliente } from '../../types';

interface ClienteAutocompleteProps {
  id?: string;
  valor: string;
  placeholder?: string;
  onValorChange: (texto: string) => void;
  onSelecionar: (cliente: Cliente) => void;
  onEnter?: () => void;
}

export const ClienteAutocomplete: React.FC<ClienteAutocompleteProps> = ({
  id,
  valor,
  placeholder = 'Nome ou CPF/CNPJ do cliente',
  onValorChange,
  onSelecionar,
  onEnter,
}) => {
  const [sugestoes, setSugestoes] = useState<Cliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const ignorarProximaBusca = useRef(false);
  const termo = useDebounce(valor.trim(), 300);

  useEffect(() => {
    if (ignorarProximaBusca.current) {
      ignorarProximaBusca.current = false;
      return;
    }
    if (termo.length < 2) {
      setSugestoes([]);
      setAberto(false);
      return;
    }

    let cancelado = false;
    apiClient
      .listarClientes(0, 8, termo)
      .then((clientes) => {
        if (cancelado) return;
        setSugestoes(clientes as Cliente[]);
        setAberto(true);
      })
      .catch(() => {
        // Sem sugestões: a busca por texto com Enter continua disponível.
        if (!cancelado) setSugestoes([]);
      });
    return () => {
      cancelado = true;
    };
  }, [termo]);

  const selecionar = (cliente: Cliente) => {
    ignorarProximaBusca.current = cliente.nome !== termo;
    setAberto(false);
    setSugestoes([]);
    onSelecionar(cliente);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onValorChange(e.target.value)}
        onFocus={() => setAberto(sugestoes.length > 0)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setAberto(false);
            onEnter?.();
          }
          if (e.key === 'Escape') setAberto(false);
        }}
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {sugestoes.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
                // onMouseDown para selecionar antes do blur fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(cliente);
                }}
              >
                <span className="font-medium text-slate-800">{cliente.nome}</span>
                {cliente.documento && <span className="ml-2 text-xs text-slate-500">{cliente.documento}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
