import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { Produto, Venda } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Package, ShoppingCart, BarChart3, LogOut, Settings, Users } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalProdutos: 0,
    estoqueTotal: 0,
    ultimasVendas: 0,
    valorVendas: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const produtos: Produto[] = await apiClient.listarProdutos(0, 1000);
      const vendas: Venda[] = await apiClient.listarVendas(0, 1000);

      const totalEstoque = produtos.reduce((acc, p) => acc + p.estoque_atual, 0);
      const valorTotal = vendas.reduce((acc, v) => acc + v.valor_total, 0);

      setStats({
        totalProdutos: produtos.length,
        estoqueTotal: Math.round(totalEstoque * 100) / 100,
        ultimasVendas: vendas.length,
        valorVendas: Math.round(valorTotal * 100) / 100,
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const StatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
  }> = ({ icon, label, value, color }) => (
    <Card className={`p-6 border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className="text-4xl opacity-20">{icon}</div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestão de Vendas</h1>
            <p className="text-sm text-gray-600">Bem-vindo, {usuario?.username}!</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Carregando estatísticas...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              icon={<Package />}
              label="Produtos no Estoque"
              value={stats.totalProdutos}
              color="border-l-blue-500"
            />
            <StatCard
              icon={<ShoppingCart />}
              label="Total em Estoque"
              value={`${stats.estoqueTotal} un`}
              color="border-l-green-500"
            />
            <StatCard
              icon={<BarChart3 />}
              label="Vendas Realizadas"
              value={stats.ultimasVendas}
              color="border-l-purple-500"
            />
            <StatCard
              icon={<ShoppingCart />}
              label="Valor Total de Vendas"
              value={`R$ ${stats.valorVendas.toFixed(2)}`}
              color="border-l-orange-500"
            />
          </div>
        )}

        {/* Quick Access */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickAccessCard
            title="Frente de Caixa"
            description="Iniciar uma nova venda"
            icon={<ShoppingCart className="w-8 h-8" />}
            onClick={() => navigate('/pdv')}
            color="bg-blue-50 hover:bg-blue-100"
          />
          <QuickAccessCard
            title="Gestão de Produtos"
            description="Controlar estoque"
            icon={<Package className="w-8 h-8" />}
            onClick={() => navigate('/produtos')}
            color="bg-green-50 hover:bg-green-100"
          />
          <QuickAccessCard
            title="Gestão de Clientes"
            description="Cadastrar clientes"
            icon={<Users className="w-8 h-8" />}
            onClick={() => navigate('/clientes')}
            color="bg-yellow-50 hover:bg-yellow-100"
          />
          <QuickAccessCard
            title="Vendas"
            description="Histórico de vendas"
            icon={<BarChart3 className="w-8 h-8" />}
            onClick={() => navigate('/vendas')}
            color="bg-purple-50 hover:bg-purple-100"
          />
          <QuickAccessCard
            title="Dados da Empresa"
            description="Configurar empresa"
            icon={<Settings className="w-8 h-8" />}
            onClick={() => navigate('/empresa')}
            color="bg-indigo-50 hover:bg-indigo-100"
          />
        </div>
      </main>
    </div>
  );
};

const QuickAccessCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}> = ({ title, description, icon, onClick, color }) => (
  <Card
    className={`p-6 cursor-pointer transition-all ${color} border-0`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div>
        <h3 className="font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400" />
    </div>
  </Card>
);
