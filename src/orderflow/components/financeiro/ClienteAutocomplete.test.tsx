import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cliente } from '../../types';
import { ClienteAutocomplete } from './ClienteAutocomplete';

const listarClientes = vi.fn();
vi.mock('../../services/api', () => ({ apiClient: { listarClientes: (...args: unknown[]) => listarClientes(...args) } }));

const cliente = (id: number, nome: string): Cliente => ({ id, nome, created_at: '', updated_at: '' });
const BARUS = [cliente(1, 'Baru'), cliente(2, 'Baru Bar'), cliente(3, 'Baru Cozinha')];

const Campo: React.FC<{ onSelecionar: (c: Cliente) => void; onEnter?: () => void }> = ({ onSelecionar, onEnter }) => {
  const [valor, setValor] = useState('');
  return (
    <ClienteAutocomplete
      id="campo"
      valor={valor}
      onValorChange={setValor}
      onSelecionar={(c) => {
        setValor(c.nome);
        onSelecionar(c);
      }}
      onEnter={onEnter}
    />
  );
};

const digitar = (texto: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: texto } });
const teclar = (tecla: string) => fireEvent.keyDown(screen.getByRole('combobox'), { key: tecla });

describe('ClienteAutocomplete', () => {
  beforeEach(() => {
    listarClientes.mockReset();
    listarClientes.mockResolvedValue(BARUS);
  });

  it('mostra todas as sugestões que contêm o termo parcial', async () => {
    render(<Campo onSelecionar={vi.fn()} />);
    digitar('Baru');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(listarClientes).toHaveBeenCalledWith(0, 20, 'Baru');
    expect(screen.getByText('Baru Cozinha')).toBeInTheDocument();
  });

  it('não busca com menos de 2 caracteres', async () => {
    render(<Campo onSelecionar={vi.fn()} />);
    digitar('B');
    await new Promise((r) => setTimeout(r, 400));
    expect(listarClientes).not.toHaveBeenCalled();
  });

  it('setas e Enter escolhem a sugestão destacada', async () => {
    const onSelecionar = vi.fn();
    const onEnter = vi.fn();
    render(<Campo onSelecionar={onSelecionar} onEnter={onEnter} />);
    digitar('Baru');
    await screen.findAllByRole('option');
    teclar('ArrowDown');
    teclar('ArrowDown');
    teclar('Enter');
    expect(onSelecionar).toHaveBeenCalledWith(BARUS[1]);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('Enter sem destaque usa a busca por texto quando a tela oferece', async () => {
    const onSelecionar = vi.fn();
    const onEnter = vi.fn();
    render(<Campo onSelecionar={onSelecionar} onEnter={onEnter} />);
    digitar('Baru');
    await screen.findAllByRole('option');
    teclar('Enter');
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onSelecionar).not.toHaveBeenCalled();
  });

  it('Enter sem busca por texto escolhe a primeira sugestão, sem comparar nome exato', async () => {
    listarClientes.mockResolvedValue([cliente(2, 'Baru Bar'), cliente(3, 'Baru Cozinha')]);
    const onSelecionar = vi.fn();
    render(<Campo onSelecionar={onSelecionar} />);
    digitar('Baru');
    await screen.findAllByRole('option');
    teclar('Enter');
    expect(onSelecionar).toHaveBeenCalledWith(cliente(2, 'Baru Bar'));
  });

  it('avisa quando nenhum cliente contém o termo', async () => {
    listarClientes.mockResolvedValue([]);
    render(<Campo onSelecionar={vi.fn()} />);
    digitar('Xyz');
    expect(await screen.findByText('Nenhum cliente encontrado com "Xyz".')).toBeInTheDocument();
  });

  it('digitar logo depois de escolher ainda busca o novo termo', async () => {
    render(<Campo onSelecionar={vi.fn()} />);
    digitar('Baru');
    fireEvent.mouseDown(await screen.findByText('Baru Cozinha'));
    listarClientes.mockResolvedValue([cliente(9, 'Small Rider')]);
    digitar('rider');
    expect(await screen.findByText('Small Rider')).toBeInTheDocument();
    expect(listarClientes).toHaveBeenLastCalledWith(0, 20, 'rider');
  });

  it('clique escolhe o cliente e fecha a lista', async () => {
    const onSelecionar = vi.fn();
    render(<Campo onSelecionar={onSelecionar} />);
    digitar('Baru');
    fireEvent.mouseDown(await screen.findByText('Baru Cozinha'));
    expect(onSelecionar).toHaveBeenCalledWith(BARUS[2]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
