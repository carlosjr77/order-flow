import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Cliente } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Edit2, Trash2, Search, AlertCircle } from 'lucide-react';
import { formatarCPF, formatarCNPJ, formatarTelefone, formatarCEP, validarDocumento, apenasNumeros } from '../utils/validacoes';

export const ClientesPage: React.FC = () => {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    documento: '',
    email: '',
    telefone: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagemErro, setMensagemErro] = useState('');

  useEffect(() => {
    loadClientes();
  }, [busca]);

  const loadClientes = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listarClientes(0, 1000, busca || undefined);
      setClientes(data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSalvarCliente = async () => {
    // Limpar erros anteriores
    setErros({});
    setMensagemErro('');

    // Validações
    const novasErros: Record<string, string> = {};
    
    if (!formData.nome.trim()) {
      novasErros.nome = 'Nome é obrigatório';
    }
    
    if (formData.documento.trim() && !validarDocumento(formData.documento)) {
      novasErros.documento = 'CPF ou CNPJ inválido';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      novasErros.email = 'Email inválido';
    }

    if (Object.keys(novasErros).length > 0) {
      setErros(novasErros);
      return;
    }

    try {
      if (editingId) {
        await apiClient.atualizarCliente(editingId, formData);
      } else {
        await apiClient.criarCliente(formData);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadClientes();
    } catch (error: any) {
      console.error('Erro ao salvar cliente:', error);
      setMensagemErro(error.message || 'Erro ao salvar cliente. Tente novamente.');
    }
  };

  const handleDeletarCliente = async (id: number) => {
    if (confirm('Tem certeza que deseja deletar este cliente?')) {
      try {
        await apiClient.deletarCliente(id);
        loadClientes();
      } catch (error) {
        console.error('Erro ao deletar cliente:', error);
      }
    }
  };

  const handleEditar = (cliente: Cliente) => {
    setFormData({
      nome: cliente.nome || '',
      documento: cliente.documento || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      endereco: cliente.endereco || '',
      numero: cliente.numero || '',
      complemento: cliente.complemento || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      estado: cliente.estado || '',
      cep: cliente.cep || '',
    });
    setEditingId(cliente.id);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      documento: '',
      email: '',
      telefone: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: '',
    });
    setErros({});
    setMensagemErro('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Gestão de Clientes</h1>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="mb-6 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nome ou documento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Clientes Table */}
        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">
            Carregando clientes...
          </Card>
        ) : clientes.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            Nenhum cliente encontrado
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Documento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Telefone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cidade</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientes.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{cliente.nome}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{cliente.documento || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{cliente.telefone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{cliente.cidade || '-'}</td>
                    <td className="px-6 py-4 text-sm text-center flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditar(cliente)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletarCliente(cliente.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>

            {mensagemErro && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{mensagemErro}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome*</label>
                <div>
                  <Input
                    value={formData.nome}
                    onChange={(e) => {
                      setFormData({ ...formData, nome: e.target.value });
                      // Limpar erro ao corrigir
                      if (erros.nome && e.target.value.trim()) {
                        const novosErros = { ...erros };
                        delete novosErros.nome;
                        setErros(novosErros);
                      }
                    }}
                    placeholder="Nome do cliente"
                    className={erros.nome ? 'border-red-500' : ''}
                  />
                  {erros.nome && (
                    <p className="text-red-500 text-xs mt-1">{erros.nome}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Documento</label>
                  <div>
                    <Input
                      value={formData.documento}
                      onChange={(e) => {
                        const valor = e.target.value;
                        const numeros = apenasNumeros(valor);
                        let formatado = '';
                        
                        if (numeros.length <= 11) {
                          formatado = numeros.length > 0 ? formatarCPF(numeros) : '';
                        } else {
                          formatado = formatarCNPJ(numeros);
                        }
                        
                        setFormData({ ...formData, documento: formatado });
                        // Limpar erro ao corrigir
                        if (erros.documento && validarDocumento(formatado)) {
                          const novosErros = { ...erros };
                          delete novosErros.documento;
                          setErros(novosErros);
                        }
                      }}
                      placeholder="CPF ou CNPJ"
                      className={erros.documento ? 'border-red-500' : ''}
                    />
                    {erros.documento && (
                      <p className="text-red-500 text-xs mt-1">{erros.documento}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => {
                      const valor = e.target.value;
                      const formatado = valor ? formatarTelefone(valor) : '';
                      setFormData({ ...formData, telefone: formatado });
                    }}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div>
                  <Input
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      // Limpar erro ao corrigir
                      if (erros.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)) {
                        const novosErros = { ...erros };
                        delete novosErros.email;
                        setErros(novosErros);
                      }
                    }}
                    placeholder="email@example.com"
                    type="email"
                    className={erros.email ? 'border-red-500' : ''}
                  />
                  {erros.email && (
                    <p className="text-red-500 text-xs mt-1">{erros.email}</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Endereço</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro</label>
                    <Input
                      value={formData.endereco}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      placeholder="Rua, Av., etc"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <Input
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      placeholder="123"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                  <Input
                    value={formData.complemento}
                    onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                    placeholder="Apto, sala, etc"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                    <Input
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                      placeholder="Bairro"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                    <Input
                      value={formData.cep}
                      onChange={(e) => {
                        const valor = e.target.value;
                        const formatado = valor ? formatarCEP(valor) : '';
                        setFormData({ ...formData, cep: formatado });
                      }}
                      placeholder="00000-000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <Input
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      placeholder="Cidade"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <select
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    >
                      <option value="">Selecione</option>
                      <option value="AC">AC</option>
                      <option value="AL">AL</option>
                      <option value="AP">AP</option>
                      <option value="AM">AM</option>
                      <option value="BA">BA</option>
                      <option value="CE">CE</option>
                      <option value="DF">DF</option>
                      <option value="ES">ES</option>
                      <option value="GO">GO</option>
                      <option value="MA">MA</option>
                      <option value="MT">MT</option>
                      <option value="MS">MS</option>
                      <option value="MG">MG</option>
                      <option value="PA">PA</option>
                      <option value="PB">PB</option>
                      <option value="PR">PR</option>
                      <option value="PE">PE</option>
                      <option value="PI">PI</option>
                      <option value="RJ">RJ</option>
                      <option value="RN">RN</option>
                      <option value="RS">RS</option>
                      <option value="RO">RO</option>
                      <option value="RR">RR</option>
                      <option value="SC">SC</option>
                      <option value="SP">SP</option>
                      <option value="SE">SE</option>
                      <option value="TO">TO</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => { 
                  setShowModal(false); 
                  setEditingId(null); 
                  resetForm();
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarCliente}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Salvar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
