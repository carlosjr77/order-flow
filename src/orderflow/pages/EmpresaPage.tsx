import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { DadosEmpresa } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export const EmpresaPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [empresa, setEmpresa] = useState<DadosEmpresa | null>(null);
  const [formData, setFormData] = useState<DadosEmpresa>({
    nome: '',
    cnpj: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    telefone: '',
    email: '',
  });

  useEffect(() => {
    loadEmpresa();
  }, []);

  const loadEmpresa = async () => {
    try {
      setIsLoading(true);
      const dados = await apiClient.obterDadosEmpresa();
      if (dados) {
        setEmpresa(dados);
        setFormData(dados);
      } else {
        // Sem dados, manter o formulário vazio
        setEmpresa(null);
      }
    } catch (error) {
      console.error('Erro ao carregar dados da empresa:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSalvar = async () => {
    try {
      setIsSaving(true);
      
      if (!formData.nome || !formData.cnpj || !formData.endereco || !formData.numero || 
          !formData.bairro || !formData.cidade || !formData.estado || !formData.cep) {
        toast.error('Preencha todos os campos obrigatórios');
        return;
      }

      if (empresa?.id) {
        // Atualizar
        await apiClient.atualizarEmpresa(empresa.id, formData);
        toast.success('Dados da empresa atualizados com sucesso!');
      } else {
        // Criar
        const novaEmpresa = await apiClient.criarEmpresa(formData);
        setEmpresa(novaEmpresa);
        toast.success('Dados da empresa cadastrados com sucesso!');
      }

      loadEmpresa();
    } catch (error) {
      console.error('Erro ao salvar dados da empresa:', error);
      toast.error('Erro ao salvar dados da empresa');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const formatarCNPJ = (cnpj: string) => {
    return cnpj
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  };

  const formatarCEP = (cep: string) => {
    return cep
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 9);
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatarCNPJ(e.target.value);
    setFormData({ ...formData, cnpj: formatted });
  };

  const handleCEPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatarCEP(e.target.value);
    setFormData({ ...formData, cep: formatted });
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
            <h1 className="text-2xl font-bold text-gray-900">Dados da Empresa</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">
            Carregando dados da empresa...
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <div className="space-y-6">
              {/* Primeira linha: Nome e CNPJ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Razão Social*
                  </label>
                  <Input
                    name="nome"
                    value={formData.nome}
                    onChange={handleInputChange}
                    placeholder="Sua Empresa LTDA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CNPJ*
                  </label>
                  <Input
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleCNPJChange}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              {/* Email e Telefone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="contato@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone
                  </label>
                  <Input
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleInputChange}
                    placeholder="(11) 1234-5678"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endereço*
                </label>
                <Input
                  name="endereco"
                  value={formData.endereco}
                  onChange={handleInputChange}
                  placeholder="Rua Exemplo"
                />
              </div>

              {/* Número e Complemento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número*
                  </label>
                  <Input
                    name="numero"
                    value={formData.numero}
                    onChange={handleInputChange}
                    placeholder="123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Complemento
                  </label>
                  <Input
                    name="complemento"
                    value={formData.complemento}
                    onChange={handleInputChange}
                    placeholder="Apto. 101"
                  />
                </div>
              </div>

              {/* Bairro, Cidade, Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bairro*
                  </label>
                  <Input
                    name="bairro"
                    value={formData.bairro}
                    onChange={handleInputChange}
                    placeholder="Centro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cidade*
                  </label>
                  <Input
                    name="cidade"
                    value={formData.cidade}
                    onChange={handleInputChange}
                    placeholder="São Paulo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado*
                  </label>
                  <Input
                    name="estado"
                    value={formData.estado}
                    onChange={handleInputChange}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>

              {/* CEP */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CEP*
                </label>
                <Input
                  name="cep"
                  value={formData.cep}
                  onChange={handleCEPChange}
                  placeholder="01000-000"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSalvar}
                  disabled={isSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar Dados'}
                </Button>
              </div>

              {/* Informação */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Informação:</strong> Os dados cadastrados aqui aparecerão automaticamente nos comprovantes de venda.
                  Se nenhum dado estiver cadastrado, serão usados dados padrão.
                </p>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};
