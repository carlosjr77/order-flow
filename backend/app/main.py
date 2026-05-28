from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
import uvicorn
from app.core.config import settings
from app.core.database import Base, engine
from app.routes import auth, produtos, vendas

# Criar tabelas
Base.metadata.create_all(bind=engine)

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
