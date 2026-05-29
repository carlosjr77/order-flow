from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
import uvicorn
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine
from app.routes import auth, produtos, vendas, empresas

# Criar tabelas
Base.metadata.create_all(bind=engine)

# Executar migrações para adicionar colunas novas
def run_migrations():
    """Executa migrações para adicionar colunas novas"""
    try:
        with engine.connect() as conn:
            # Adicionar coluna vender_sem_estoque se não existir
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'produtos' AND column_name = 'vender_sem_estoque'"
            )).fetchone()
            
            if result[0] == 0:
                conn.execute(text(
                    "ALTER TABLE produtos ADD COLUMN vender_sem_estoque INTEGER NOT NULL DEFAULT 1"
                ))
                conn.commit()
                print("✅ Migração: coluna 'vender_sem_estoque' adicionada em 'produtos'")
            
            # Adicionar coluna valor_frete se não existir
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = 'vendas' AND column_name = 'valor_frete'"
            )).fetchone()
            
            if result[0] == 0:
                conn.execute(text(
                    "ALTER TABLE vendas ADD COLUMN valor_frete NUMERIC(10,2) DEFAULT 0"
                ))
                conn.commit()
                print("✅ Migração: coluna 'valor_frete' adicionada em 'vendas'")
    except Exception as e:
        print(f"⚠️ Erro na migração: {e}")

# Configurar fuso horário do banco para Brasil
def configure_timezone():
    """Configura o fuso horário do banco de dados para America/Sao_Paulo"""
    try:
        with engine.connect() as conn:
            # Configurar timezone da sessão atual
            conn.execute(text("SET timezone TO 'America/Sao_Paulo'"))
            conn.commit()
            print("✅ Fuso horário configurado para 'America/Sao_Paulo' (sessão)")
    except Exception as e:
        print(f"⚠️ Erro ao configurar fuso horário da sessão: {e}")
    
    try:
        with engine.connect() as conn:
            # Tentar configurar timezone do banco de dados (requer permissões de superusuário)
            db_name = settings.DATABASE_URL.split('/')[-1]
            if db_name:
                conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                    text(f"ALTER DATABASE {db_name} SET timezone TO 'America/Sao_Paulo'")
                )
                print("✅ Fuso horário configurado para 'America/Sao_Paulo' (banco de dados)")
    except Exception as e:
        print(f"ℹ️ Não foi possível configurar fuso horário do banco (pode exigir permissões de superusuário): {e}")
    
    # Configurar timezone global do PostgreSQL se possível
    try:
        with engine.connect() as conn:
            # Tentar configurar timezone global (requer superusuário)
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                text("ALTER SYSTEM SET timezone TO 'America/Sao_Paulo'")
            )
            print("✅ Fuso horário configurado globalmente (ALTER SYSTEM)")
    except Exception as e:
        print(f"ℹ️ Não foi possível configurar fuso horário global: {e}")

# Executar migrações
run_migrations()

# Configurar fuso horário
configure_timezone()

# Inicializar aplicação
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Sistema completo de Gestão de Vendas, Estoque e Emissão de Pedidos",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir rotas
app.include_router(auth.router)
app.include_router(produtos.router)
app.include_router(vendas.router)
app.include_router(empresas.router)


@app.get("/")
def root():
    """Raiz da API"""
    return {
        "message": "Bem-vindo ao Order Flow API",
        "version": settings.API_VERSION,
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
def health_check():
    """Health check da aplicação"""
    return {"status": "ok", "message": "Servidor está rodando"}


def custom_openapi():
    """Customizar OpenAPI schema"""
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title=settings.API_TITLE,
        version=settings.API_VERSION,
        description=app.description,
        routes=app.routes,
    )
    
    openapi_schema["info"]["x-logo"] = {
        "url": "https://fastapi.tiangolo.com/img/logo-margin/logo-teal.png"
    }
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.API_PORT,
        reload=True,
        log_level="info"
    )
