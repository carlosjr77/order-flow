import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { PDVPage } from './pages/PDVPage';
import { VendasPage } from './pages/VendasPage';

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

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default OrderFlowApp;
