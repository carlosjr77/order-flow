import os
from datetime import timedelta
from pydantic_settings import BaseSettings


def parse_cors_origins(v):
    """Converte string separada por vírgulas em lista de origins"""
    if isinstance(v, str):
        return [origin.strip() for origin in v.split(",") if origin.strip()]
    if isinstance(v, list):
        return [str(origin).strip() for origin in v if str(origin).strip()]
    return []


class Settings(BaseSettings):
    """Configurações da aplicação"""
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ordem_vendas")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "sua-chave-secreta-super-segura-mudeme")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Auth defaults
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
    
    # CORS - string separada por vírgula
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:3000,http://localhost,http://frontend:3000"
    
    # API
    API_TITLE: str = "Order Flow - Sistema de Gestão de Vendas"
    API_VERSION: str = "1.0.0"
    API_PORT: int = int(os.getenv("API_PORT", 8000))
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    @property
    def cors_origins_list(self):
        """Retorna CORS_ORIGINS como lista"""
        origins = parse_cors_origins(self.CORS_ORIGINS)
        # Adicionar FRONTEND_URL se definido
        frontend_url = os.getenv("FRONTEND_URL")
        if frontend_url and frontend_url not in origins:
            origins.append(frontend_url)
        return origins


settings = Settings()
