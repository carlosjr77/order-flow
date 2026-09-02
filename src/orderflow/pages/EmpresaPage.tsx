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
    inscricao_estadual: '',
    regime_tributario: 'simples_nacional',
    cfop_dentro_estado: '',
    cfop_fora_estado: '',
    csosn_padrao: '',
    aliquota_icms: 0,
    aliquota_pis: 0,
    aliquota_cofins: 0,
    serie_nfe: 1,
    numero_nfe: 1,
    ambiente_nfe: 'homologacao',
    emissao_nfe_habilitada: false,
    codigo_municipio_ibge: '',
    codigo_pais: '1058',
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
        setFormData({ ...formData, ...dados });
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

              <div className="border-t pt-6">
                <h2 className="text-lg font-semibold text-gray-900">Configuração fiscal da NF-e</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Estes dados serão usados apenas quando você escolher emitir uma NF-e para uma venda específica.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Inscrição Estadual</label>
                  <Input name="inscricao_estadual" value={formData.inscricao_estadual || ''} onChange={handleInputChange} placeholder="Informe a IE" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Regime tributário</label>
                  <select
                    name="regime_tributario"
                    value={formData.regime_tributario || 'simples_nacional'}
                    onChange={(event) => setFormData({ ...formData, regime_tributario: event.target.value as DadosEmpresa['regime_tributario'] })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="simples_nacional">Simples Nacional</option>
                    <option value="lucro_presumido">Lucro Presumido</option>
                    <option value="lucro_real">Lucro Real</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Código IBGE do município</label>
                  <Input name="codigo_municipio_ibge" value={formData.codigo_municipio_ibge || ''} onChange={handleInputChange} placeholder="Ex.: 3304557" maxLength={7} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">CFOP dentro do estado</label>
                  <Input name="cfop_dentro_estado" value={formData.cfop_dentro_estado || ''} onChange={handleInputChange} placeholder="Ex.: 5102" maxLength={4} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">CFOP fora do estado</label>
                  <Input name="cfop_fora_estado" value={formData.cfop_fora_estado || ''} onChange={handleInputChange} placeholder="Ex.: 6102" maxLength={4} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">CSOSN padrão</label>
                  <Input name="csosn_padrao" value={formData.csosn_padrao || ''} onChange={handleInputChange} placeholder="Ex.: 102" maxLength={3} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  ['aliquota_icms', 'ICMS (%)'],
                  ['aliquota_pis', 'PIS (%)'],
                  ['aliquota_cofins', 'COFINS (%)'],
                ].map(([name, label]) => (
                  <div key={name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                    <Input name={name} type="number" min="0" max="100" step="0.01" value={Number(formData[name as keyof DadosEmpresa] || 0)} onChange={(event) => setFormData({ ...formData, [name]: Number(event.target.value) })} />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Série da NF-e</label>
                  <Input name="serie_nfe" type="number" min="1" value={formData.serie_nfe || 1} onChange={(event) => setFormData({ ...formData, serie_nfe: Number(event.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Próximo número da NF-e</label>
                  <Input name="numero_nfe" type="number" min="1" value={formData.numero_nfe || 1} onChange={(event) => setFormData({ ...formData, numero_nfe: Number(event.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ambiente</label>
                  <select name="ambiente_nfe" value={formData.ambiente_nfe || 'homologacao'} onChange={(event) => setFormData({ ...formData, ambiente_nfe: event.target.value as DadosEmpresa['ambiente_nfe'] })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <input type="checkbox" checked={!!formData.emissao_nfe_habilitada} onChange={(event) => setFormData({ ...formData, emissao_nfe_habilitada: event.target.checked })} className="mt-1 h-4 w-4" />
                <span className="text-sm text-amber-900">Habilitar emissão de NF-e para vendas específicas</span>
              </label>

              <p className="text-xs text-gray-500">O certificado A1 e sua senha serão configurados como segredo do backend e não ficam armazenados neste cadastro.</p>

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
