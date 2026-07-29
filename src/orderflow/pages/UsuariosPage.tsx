import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Usuario, CriarUsuarioData, PerfilUsuario } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Edit2, Trash2, RefreshCw, UserCheck, UserX } from 'lucide-react';

interface PerfilOption {
  valor: PerfilUsuario;
  label: string;
  descricao: string;
}

export const UsuariosPage: React.FC = () => {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<PerfilOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [resetSenhaUsuario, setResetSenhaUsuario] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState<CriarUsuarioData>({
    username: '',
    email: '',
    nome: '',
    password: '',
    perfil: 'operador',
  });

  useEffect(() => {
    loadUsuarios();
    loadPerfis();
  }, []);

  const loadUsuarios = async () => {
    try {
      setIsLoading(true);
      const data = (await apiClient.listarUsuarios()) as Usuario[];
      setUsuarios(data);
    } catch (error: any) {
      setError(error?.message || 'Erro ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPerfis = async () => {
    try {
      const data = (await apiClient.listarPerfis()) as PerfilOption[];
      setPerfis(data);
    } catch (error) {
      console.error('Erro ao carregar perfis:', error);
      setPerfis([
        { valor: 'admin', label: 'Administrador', descricao: 'Acesso total ao sistema' },
        { valor: 'operador', label: 'Operador', descricao: 'Pode realizar vendas' },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingUsuario) {
        await apiClient.atualizarUsuario(editingUsuario.id, {
          username: formData.username,
          email: formData.email,
          nome: formData.nome,
          perfil: formData.perfil,
        });
        setSuccess('Usuário atualizado com sucesso!');
      } else {
        await apiClient.criarUsuario(formData);
        setSuccess('Usuário criado com sucesso!');
      }
      
      setShowForm(false);
      setEditingUsuario(null);
      setFormData({ username: '', email: '', nome: '', password: '', perfil: 'operador' });
      loadUsuarios();
    } catch (error: any) {
      setError(error?.message || 'Erro ao salvar usuário');
    }
  };

  const handleEdit = (usuario: Usuario) => {
    setEditingUsuario(usuario);
    setFormData({
      username: usuario.username,
      email: usuario.email,
      nome: usuario.nome || '',
      password: '',
      perfil: usuario.perfil,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleCreate = () => {
    setEditingUsuario(null);
    setFormData({ username: '', email: '', nome: '', password: '', perfil: 'operador' });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (usuario: Usuario) => {
    if (!confirm(`Deseja realmente desativar o usuário "${usuario.username}"?`)) return;

    try {
      await apiClient.deletarUsuario(usuario.id);
      setSuccess(`Usuário "${usuario.username}" desativado com sucesso!`);
      loadUsuarios();
    } catch (error: any) {
      setError(error?.message || 'Erro ao desativar usuário');
    }
  };

  const handleReativar = async (usuario: Usuario) => {
    try {
      await apiClient.reativarUsuario(usuario.id);
      setSuccess(`Usuário "${usuario.username}" reativado com sucesso!`);
      loadUsuarios();
    } catch (error: any) {
      setError(error?.message || 'Erro ao reativar usuário');
    }
  };

  const handleResetSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSenhaUsuario) return;

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      await apiClient.resetarSenhaUsuario(resetSenhaUsuario.id, novaSenha);
      setSuccess(`Senha do usuário "${resetSenhaUsuario.username}" resetada com sucesso!`);
      setResetSenhaUsuario(null);
      setNovaSenha('');
    } catch (error: any) {
      setError(error?.message || 'Erro ao resetar senha');
    }
  };

  const getPerfilLabel = (perfil: PerfilUsuario) => {
    return perfis.find(p => p.valor === perfil)?.label || perfil;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
          </div>
          <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            {success}
          </div>
        )}

        {showForm && (
          <Card className="mb-6 p-6">
            <h2 className="text-lg font-bold mb-4">
              {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <Input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário *</label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Nome de usuário"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha {editingUsuario ? '(deixe em branco para não alterar)' : '*'}
                </label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUsuario ? '********' : 'Senha inicial'}
                  required={!editingUsuario}
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil *</label>
                <select
                  value={formData.perfil}
                  onChange={(e) => setFormData({ ...formData, perfil: e.target.value as PerfilUsuario })}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {perfis.map((perfil) => (
                    <option key={perfil.valor} value={perfil.valor}>
                      {perfil.label} - {perfil.descricao}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="bg-green-600 hover:bg-green-700">
                  {editingUsuario ? 'Salvar Alterações' : 'Criar Usuário'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingUsuario(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {resetSenhaUsuario && (
          <Card className="mb-6 p-6">
            <h2 className="text-lg font-bold mb-4">
              Resetar Senha - {resetSenhaUsuario.username}
            </h2>
            <form onSubmit={handleResetSenha} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                <Input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Digite a nova senha"
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                <RefreshCw className="w-4 h-4 mr-2" />
                Resetar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetSenhaUsuario(null);
                  setNovaSenha('');
                }}
              >
                Cancelar
              </Button>
            </form>
          </Card>
        )}

        {isLoading ? (
          <Card className="p-8 text-center text-gray-500">Carregando usuários...</Card>
        ) : usuarios.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhum usuário encontrado</Card>
        ) : (
          <div className="space-y-4">
            {usuarios.map((usuario) => (
              <Card key={usuario.id} className={`p-4 ${!usuario.is_active ? 'opacity-60 bg-gray-50' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-lg text-gray-900">
                        {usuario.nome || usuario.username}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        usuario.perfil === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {getPerfilLabel(usuario.perfil)}
                      </span>
                      {!usuario.is_active && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Usuário: {usuario.username}</p>
                    <p className="text-sm text-gray-600">Email: {usuario.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(usuario)}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResetSenhaUsuario(usuario)}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Senha
                    </Button>
                    {usuario.is_active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(usuario)}
                        className="text-red-600"
                      >
                        <UserX className="w-4 h-4 mr-1" />
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReativar(usuario)}
                        className="text-green-600"
                      >
                        <UserCheck className="w-4 h-4 mr-1" />
                        Reativar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
