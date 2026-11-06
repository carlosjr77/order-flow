import React, { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '../../hooks/useDebounce';
import { apiClient } from '../../services/api';
import { Cliente } from '../../types';

export const LIMITE_SUGESTOES = 20;
export const MINIMO_CARACTERES = 2;

interface ClienteAutocompleteProps {
  id?: string;
  valor: string;
  placeholder?: string;
  onValorChange: (texto: string) => void;
  onSelecionar: (cliente: Cliente) => void;
  /**
   * Enter sem sugestão destacada pelas setas. Sem esta função, Enter escolhe a primeira sugestão.
   * Enter com sugestão destacada sempre escolhe a destacada.
   */
  onEnter?: () => void;
}

/**
 * Busca de cliente enquanto se digita. O backend procura o termo em qualquer parte do nome,
 * sem diferenciar maiúsculas e acentos: "baru" sugere "Baru", "Baru Cozinha" e "Baru Bar".
 */
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
  const [buscando, setBuscando] = useState(false);
  const [destacado, setDestacado] = useState(-1);
  // Nome recém-escolhido: o campo passa a mostrá-lo e não deve disparar outra busca.
  const nomeEscolhido = useRef<string | null>(null);
  const termo = useDebounce(valor.trim(), 300);
  const idLista = useId();

  useEffect(() => {
    if (nomeEscolhido.current !== null && termo === nomeEscolhido.current) {
      return;
    }
    nomeEscolhido.current = null;
    setDestacado(-1);
    if (termo.length < MINIMO_CARACTERES) {
      setSugestoes([]);
      setAberto(false);
      return;
    }

    let cancelado = false;
    setBuscando(true);
    apiClient
      .listarClientes(0, LIMITE_SUGESTOES, termo)
      .then((clientes) => {
        if (cancelado) return;
        setSugestoes(clientes as Cliente[]);
        setAberto(true);
      })
      .catch(() => {
        // Sem sugestões: a busca por texto com Enter continua disponível.
        if (!cancelado) setSugestoes([]);
      })
      .finally(() => {
        if (!cancelado) setBuscando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [termo]);

  const selecionar = (cliente: Cliente) => {
    nomeEscolhido.current = cliente.nome.trim();
    setAberto(false);
    setSugestoes([]);
    setDestacado(-1);
    onSelecionar(cliente);
  };

  const listaVisivel = aberto && termo.length >= MINIMO_CARACTERES && !buscando;
  // O texto mudou e a busca ainda não respondeu: as sugestões na tela são do termo anterior.
  const sugestoesAtuais = valor.trim() === termo ? sugestoes : [];

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && sugestoesAtuais.length > 0) {
      e.preventDefault();
      setAberto(true);
      setDestacado((atual) => (atual + 1) % sugestoesAtuais.length);
    } else if (e.key === 'ArrowUp' && sugestoesAtuais.length > 0) {
      e.preventDefault();
      setDestacado((atual) => (atual <= 0 ? sugestoesAtuais.length - 1 : atual - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (destacado >= 0 && sugestoesAtuais[destacado]) {
        selecionar(sugestoesAtuais[destacado]);
      } else if (onEnter) {
        setAberto(false);
        onEnter();
      } else if (sugestoesAtuais.length > 0) {
        selecionar(sugestoesAtuais[0]);
      }
    } else if (e.key === 'Escape') {
      setAberto(false);
      setDestacado(-1);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={listaVisivel}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={destacado >= 0 ? `${idLista}-${destacado}` : undefined}
        onChange={(e) => onValorChange(e.target.value)}
        onFocus={() => setAberto(sugestoes.length > 0)}
        onBlur={() => setAberto(false)}
        onKeyDown={aoTeclar}
      />
      {buscando && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          Buscando...
        </span>
      )}
      {listaVisivel && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {sugestoesAtuais.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Nenhum cliente encontrado com "{termo}".</li>
          ) : (
            sugestoesAtuais.map((cliente, indice) => (
              <li
                key={cliente.id}
                id={`${idLista}-${indice}`}
                role="option"
                aria-selected={indice === destacado}
                className={`cursor-pointer px-3 py-2 text-sm ${indice === destacado ? 'bg-sky-100' : 'hover:bg-sky-50'}`}
                // onMouseDown para selecionar antes do blur fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(cliente);
                }}
                onMouseEnter={() => setDestacado(indice)}
              >
                <span className="font-medium text-slate-800">{cliente.nome}</span>
                {cliente.documento && <span className="ml-2 text-xs text-slate-500">{cliente.documento}</span>}
              </li>
            ))
          )}
          {sugestoesAtuais.length === LIMITE_SUGESTOES && (
            <li className="border-t px-3 py-2 text-xs text-slate-500">
              Mostrando os {LIMITE_SUGESTOES} primeiros. Digite mais para refinar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
