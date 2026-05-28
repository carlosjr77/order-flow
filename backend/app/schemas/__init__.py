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
    preco_venda: float
    unidade_medida: str = "UN"
    ncm: Optional[str] = None


class ProdutoCreate(ProdutoBase):
    pass


class ProdutoUpdate(BaseModel):
    descricao: Optional[str] = None
    preco_custo: Optional[float] = None
    preco_venda: Optional[float] = None
    unidade_medida: Optional[str] = None
    ncm: Optional[str] = None


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
    
    class Config:
        from_attributes = True


class VendaBase(BaseModel):
    valor_total: float
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None


class VendaCreate(BaseModel):
    itens: list[ItemVendaBase]
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None


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
