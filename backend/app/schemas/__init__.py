from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UsuarioBase(BaseModel):
    username: str
    email: EmailStr


class UsuarioCreate(UsuarioBase):
    password: str


class UsuarioResponse(UsuarioBase):
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Schema para requisição de login"""
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    usuario: UsuarioResponse


class ProdutoBase(BaseModel):
    codigo_interno: str
    descricao: str
    preco_custo: float
    preco_venda: Optional[float] = None  # Opcional, pode ser calculado pela margem
    margem_lucro: Optional[float] = None  # Margem de lucro específica do produto (em decimal, ex: 1.0 = 100%)
    unidade_medida: str = "UN"
    ncm: Optional[str] = None
    vender_sem_estoque: bool = True  # Default: permite vender sem estoque


class ProdutoCreate(ProdutoBase):
    estoque_inicial: Optional[float] = 0  # Campo para definir estoque inicial no cadastro


class ProdutoUpdate(BaseModel):
    descricao: Optional[str] = None
    preco_custo: Optional[float] = None
    preco_venda: Optional[float] = None
    margem_lucro: Optional[float] = None
    unidade_medida: Optional[str] = None
    ncm: Optional[str] = None
    vender_sem_estoque: Optional[bool] = None


class ProdutoResponse(ProdutoBase):
    id: int
    estoque_atual: float
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ItemVendaBase(BaseModel):
    produto_id: int
    quantidade: float
    valor_unitario: float


class ItemVendaCreate(ItemVendaBase):
    pass


class ItemVendaResponse(ItemVendaBase):
    id: int
    venda_id: int
    valor_total: float
    codigo_interno: Optional[str] = None
    descricao: Optional[str] = None
    unidade_medida: Optional[str] = None
    ncm: Optional[str] = None
    preco_custo: Optional[float] = 0  # Preço de custo do produto para relatórios
    
    class Config:
        from_attributes = True


class VendaBase(BaseModel):
    valor_total: float
    valor_frete: Optional[float] = 0
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None


class VendaCreate(BaseModel):
    itens: list[ItemVendaBase]
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None
    valor_frete: Optional[float] = 0


class VendaResponse(VendaBase):
    id: int
    data_venda: datetime
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class VendaDetailResponse(VendaResponse):
    itens: list[ItemVendaResponse]


class EmpresaBase(BaseModel):
    nome: str
    cnpj: str
    endereco: str
    numero: str
    complemento: Optional[str] = None
    bairro: str
    cidade: str
    estado: str
    cep: str
    telefone: Optional[str] = None
    email: Optional[str] = None
    margem_lucro_padrao: Optional[float] = 1.0  # Margem padrão de 100% (1.0 = 100%)


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    margem_lucro_padrao: Optional[float] = None


class EmpresaResponse(EmpresaBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ClienteBase(BaseModel):
    nome: str
    documento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    documento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None


class ClienteResponse(ClienteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
