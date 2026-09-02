from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Literal
from datetime import datetime, date


# Enumeração de perfis
PerfilUsuario = Literal["admin", "operador"]


class UsuarioBase(BaseModel):
    username: str
    email: EmailStr
    nome: Optional[str] = None


class UsuarioCreate(UsuarioBase):
    password: str
    perfil: Optional[PerfilUsuario] = "operador"


class UsuarioUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    nome: Optional[str] = None
    perfil: Optional[PerfilUsuario] = None
    is_active: Optional[bool] = None


class UsuarioTrocaSenha(BaseModel):
    senha_atual: str
    nova_senha: str


class UsuarioResetSenha(BaseModel):
    nova_senha: str


class UsuarioResponse(UsuarioBase):
    id: int
    is_active: bool
    perfil: PerfilUsuario
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
    cest: Optional[str] = None
    cfop: Optional[str] = None
    csosn: Optional[str] = None
    aliquota_icms: Optional[float] = 0
    aliquota_pis: Optional[float] = 0
    aliquota_cofins: Optional[float] = 0
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
    cest: Optional[str] = None
    cfop: Optional[str] = None
    csosn: Optional[str] = None
    aliquota_icms: Optional[float] = None
    aliquota_pis: Optional[float] = None
    aliquota_cofins: Optional[float] = None
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
    nome_cliente: Optional[str] = None
    tabela_preco_id: Optional[int] = None  # Tabela de preços usada na venda
    data_entrega: Optional[date] = None  # Data de entrega
    data_vencimento: Optional[date] = None  # Data de vencimento do pedido (opcional)


class VendaCreate(BaseModel):
    itens: list[ItemVendaBase]
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None
    valor_frete: Optional[float] = 0
    nome_cliente: Optional[str] = None
    tabela_preco_id: Optional[int] = None  # Tabela de preços usada na venda
    data_entrega: Optional[date] = None  # Data de entrega
    data_vencimento: Optional[date] = None  # Data de vencimento do pedido (opcional)


class VendaUpdate(BaseModel):
    itens: list[ItemVendaBase]
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None
    valor_frete: Optional[float] = 0
    nome_cliente: Optional[str] = None
    tabela_preco_id: Optional[int] = None  # Tabela de preços usada na venda
    data_entrega: Optional[date] = None  # Data de entrega
    data_vencimento: Optional[date] = None  # Data de vencimento do pedido (opcional)
    status: Optional[str] = None  # Permite alterar status ao concluir edição


class VendaResponse(VendaBase):
    id: int
    usuario_id: Optional[int] = None
    usuario_nome: Optional[str] = None
    data_venda: datetime
    status: str
    motivo_cancelamento: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
    
    @field_validator('data_entrega', 'data_vencimento', mode='plain')
    @classmethod
    def converter_datas(cls, v):
        if v is None:
            return None
        if isinstance(v, date):
            return v.isoformat()
        return v


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
    inscricao_estadual: Optional[str] = None
    regime_tributario: Optional[Literal["simples_nacional", "lucro_presumido", "lucro_real"]] = "simples_nacional"
    cfop_dentro_estado: Optional[str] = None
    cfop_fora_estado: Optional[str] = None
    csosn_padrao: Optional[str] = None
    aliquota_icms: Optional[float] = 0
    aliquota_pis: Optional[float] = 0
    aliquota_cofins: Optional[float] = 0
    serie_nfe: Optional[int] = 1
    numero_nfe: Optional[int] = 1
    ambiente_nfe: Optional[Literal["homologacao", "producao"]] = "homologacao"
    emissao_nfe_habilitada: Optional[bool] = False
    codigo_municipio_ibge: Optional[str] = None
    codigo_pais: Optional[str] = "1058"


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


class TabelaPrecoItemBase(BaseModel):
    produto_id: int
    margem_especifica_percentual: float


class TabelaPrecoItemCreate(TabelaPrecoItemBase):
    pass


class TabelaPrecoItemResponse(TabelaPrecoItemBase):
    id: int
    tabela_preco_id: int
    preco_calculado: Optional[float] = None
    codigo_interno: Optional[str] = None
    descricao: Optional[str] = None
    preco_custo: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TabelaPrecoBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    margem_geral_percentual: float = 0
    ativa: bool = True


class TabelaPrecoCreate(TabelaPrecoBase):
    itens: list[TabelaPrecoItemCreate] = []


class TabelaPrecoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    margem_geral_percentual: Optional[float] = None
    ativa: Optional[bool] = None
    itens: Optional[list[TabelaPrecoItemCreate]] = None


class TabelaPrecoResponse(TabelaPrecoBase):
    id: int
    created_at: datetime
    updated_at: datetime
    itens: list[TabelaPrecoItemResponse] = []

    class Config:
        from_attributes = True


class ItemComparativoSugestao(BaseModel):
    item_reconhecido: str
    quantidade: float
    unidade: str
    preco_nota: float
    produto_id: Optional[int] = None
    produto_descricao: Optional[str] = None
    precos_por_tabela: dict[str, Optional[float]]
    diferenca_valor: Optional[float] = None
    diferenca_percentual: Optional[float] = None
    aviso_unidade: Optional[str] = None


class TabelaAnalisadaSugestao(BaseModel):
    id: int
    nome: str
    erro_percentual: Optional[float] = None
    itens_comparados: int


class TabelaSugeridaInfo(BaseModel):
    id: int
    nome: str


class SugestaoTabelaResponse(BaseModel):
    tabela_sugerida: TabelaSugeridaInfo
    motivo: str
    tabelas_analisadas: list[TabelaAnalisadaSugestao]
    comparativo: list[ItemComparativoSugestao]


class AuditLogResponse(BaseModel):
    id: int
    acao: str
    entidade: str
    entidade_id: Optional[str] = None
    descricao: Optional[str] = None
    ip_address: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogFilter(BaseModel):
    acao: Optional[str] = None
    entidade: Optional[str] = None
    user_id: Optional[int] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
