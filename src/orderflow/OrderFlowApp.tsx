import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { ClientesPage } from './pages/ClientesPage';
import { PDVPage } from './pages/PDVPage';
import { VendasPage } from './pages/VendasPage';
import { EmpresaPage } from './pages/EmpresaPage';
import { PerdasPage } from './pages/PerdasPage';
import { TrocarSenhaPage } from './pages/TrocarSenhaPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { AuditoriaPage } from './pages/AuditoriaPage';

export const OrderFlowApp: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Private Routes */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/produtos"
            element={
              <PrivateRoute>
                <ProdutosPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/clientes"
            element={
              <PrivateRoute>
                <ClientesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/pdv"
            element={
              <PrivateRoute>
                <PDVPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/vendas"
            element={
              <PrivateRoute>
                <VendasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/empresa"
            element={
              <PrivateRoute>
                <EmpresaPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/perdas"
            element={
              <PrivateRoute>
                <PerdasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/trocar-senha"
            element={
              <PrivateRoute>
                <TrocarSenhaPage />
              </PrivateRoute>
            }
          />

          {/* Admin-only Routes */}
          <Route
            path="/usuarios"
            element={
              <PrivateRoute requireAdmin>
                <UsuariosPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/auditoria"
            element={
              <PrivateRoute requireAdmin>
                <AuditoriaPage />
              </PrivateRoute>
            }
          />

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default OrderFlowApp;
