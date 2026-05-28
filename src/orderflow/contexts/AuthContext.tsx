import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { Usuario, AuthResponse } from '../types';
import { apiClient } from '../services/api';

interface AuthContextType {
  usuario: Usuario | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar se já está autenticado ao carregar
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const usuarioData = localStorage.getItem('usuario');

    if (token && usuarioData) {
      apiClient.setToken(token);
      try {
        setUsuario(JSON.parse(usuarioData));
      } catch {
        localStorage.removeItem('usuario');
        localStorage.removeItem('access_token');
      }
    }

    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response: AuthResponse = await apiClient.login(username, password);
      apiClient.setToken(response.access_token);
      setUsuario(response.usuario);
      localStorage.setItem('usuario', JSON.stringify(response.usuario));
    } catch (error) {
      setUsuario(null);
      localStorage.removeItem('usuario');
      localStorage.removeItem('access_token');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    apiClient.clearToken();
    setUsuario(null);
    localStorage.removeItem('usuario');
    localStorage.removeItem('access_token');
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        isLoading,
        isAuthenticated: !!usuario,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
