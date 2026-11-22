from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Produto, ProdutoCustoHistorico, Usuario
from app.schemas import CustoLoteUpdate, CustoProdutoUpdate, ProdutoCreate, ProdutoResponse, ProdutoUpdate
from app.utils import busca as busca_texto
from app.utils import consolidado_compras, custo_produto
from app.utils.audit import registrar_auditoria, get_client_ip

ROTULOS_ORIGEM_CUSTO = {"manual": "manual", "ceasa_sem_nf": "CEASA sem nota", "nf": "nota fiscal"}

router = APIRouter(prefix="/api/produtos", tags=["Produtos"])


def normalizar_ncm(valor: str | None) -> str | None:
    """Armazena o NCM somente com os oito dígitos exigidos pelo banco/XML."""
    if not valor:
        return None
    ncm = "".join(caractere for caractere in valor if caractere.isdigit())
    if len(ncm) != 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O NCM deve conter exatamente 8 dígitos.",
        )
    return ncm


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


@router.get("", response_model=List[ProdutoResponse])
def listar_produtos(
    skip: int = 0,
    limit: int = 100,
    busca: str = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todos os produtos com paginação e busca opcional"""
    query = db.query(Produto)

    # Sem diferença de maiúsculas e acentos: "limao" encontra "Limão"
    if busca and busca.strip():
        query = query.filter(
            busca_texto.contem(Produto.codigo_interno, busca) | busca_texto.contem(Produto.descricao, busca)
        ).order_by(busca_texto.ordem_relevancia(Produto.descricao, busca), Produto.descricao, Produto.id)
    else:
        query = query.order_by(Produto.id)

    return query.offset(skip).limit(limit).all()


@router.get("/agrupado")
def listar_produtos_agrupados(
    termo: str = Query(..., min_length=2, max_length=300, description="Um ou mais termos separados por vírgula"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Variações de cada termo (unidades KG, SC, CX, UN...) com o preço em cada tabela ativa"""
    return consolidado_compras.produtos_agrupados(db, termo)


@router.post("/custos/lote")
def atualizar_custos_em_lote(
    dados: CustoLoteUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza o preço de custo de vários produtos de uma vez (ex.: compra no CEASA sem nota)"""
    usuario = get_usuario_logado(db, current_user)
    alterados = custo_produto.atualizar_custos_em_lote(
        db,
        [(item.produto_id, item.preco_custo) for item in dados.itens],
        origem=dados.origem,
        observacao=dados.observacao,
        usuario=usuario,
    )
    db.commit()
    for produto, historico in alterados:
        _auditar_custo(db, request, usuario, produto, historico)
    return {
        "alterados": len(alterados),
        "sem_alteracao": len(dados.itens) - len(alterados),
        "historico": [custo_produto.historico_para_dict(h) for _, h in alterados],
    }


@router.get("/{produto_id}", response_model=ProdutoResponse)
def obter_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém um produto específico"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    return produto


def _auditar_custo(db: Session, request: Request, usuario: Optional[Usuario], produto: Produto, historico) -> None:
    usuario_nome = (usuario.nome or usuario.username) if usuario else "sistema"
    observacao = f" - {historico.observacao}" if historico.observacao else ""
    registrar_auditoria(
        db=db,
        acao="atualizar_custo",
        entidade="produto",
        entidade_id=produto.id,
        descricao=(
            f"Custo do produto '{produto.descricao}' alterado de R$ {float(historico.custo_anterior):.2f} "
            f"para R$ {float(historico.custo_novo):.2f} ({ROTULOS_ORIGEM_CUSTO.get(historico.origem, historico.origem)})"
            f"{observacao} por '{usuario_nome}'"
        ),
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )


@router.patch("/{produto_id}/custo", response_model=ProdutoResponse)
def atualizar_custo_produto(
    produto_id: int,
    dados: CustoProdutoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza só o preço de custo, registrando origem (manual, CEASA sem nota, nota fiscal) e histórico"""
    produto = db.query(Produto).filter(Produto.id == produto_id).with_for_update().first()
    if not produto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")

    usuario = get_usuario_logado(db, current_user)
    historico = custo_produto.atualizar_custo(
        db, produto, dados.preco_custo, origem=dados.origem, observacao=dados.observacao, usuario=usuario
    )
    db.commit()
    db.refresh(produto)
    if historico is not None:
        _auditar_custo(db, request, usuario, produto, historico)
    return produto


@router.get("/{produto_id}/custo/historico")
def listar_historico_custo(
    produto_id: int,
    limite: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Últimas alterações do preço de custo do produto, da mais recente para a mais antiga"""
    if not db.query(Produto.id).filter(Produto.id == produto_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")
    historico = (
        db.query(ProdutoCustoHistorico)
        .filter(ProdutoCustoHistorico.produto_id == produto_id)
        .order_by(ProdutoCustoHistorico.created_at.desc(), ProdutoCustoHistorico.id.desc())
        .limit(limite)
        .all()
    )
    return [custo_produto.historico_para_dict(h) for h in historico]


@router.post("", response_model=ProdutoResponse)
def criar_produto(
    produto_data: ProdutoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria um novo produto"""
    
    # Verificar se código já existe
    produto_existente = db.query(Produto).filter(
        Produto.codigo_interno == produto_data.codigo_interno
    ).first()
    
    if produto_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de produto já existe"
        )
    
    novo_produto = Produto(
        codigo_interno=produto_data.codigo_interno,
        descricao=produto_data.descricao,
        preco_custo=produto_data.preco_custo,
        preco_venda=produto_data.preco_venda,
        margem_lucro=produto_data.margem_lucro,
        unidade_medida=produto_data.unidade_medida,
        ncm=normalizar_ncm(produto_data.ncm),
        cest=produto_data.cest,
        cfop=produto_data.cfop,
        csosn=produto_data.csosn,
        aliquota_icms=produto_data.aliquota_icms,
        aliquota_pis=produto_data.aliquota_pis,
        aliquota_cofins=produto_data.aliquota_cofins,
        estoque_atual=produto_data.estoque_inicial or 0,
        vender_sem_estoque=1 if produto_data.vender_sem_estoque else 0
    )
    
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="produto",
        entidade_id=novo_produto.id,
        descricao=f"Produto '{novo_produto.descricao}' (código: {novo_produto.codigo_interno}) criado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return novo_produto


@router.put("/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(
    produto_id: int,
    produto_data: ProdutoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um produto existente"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    update_data = produto_data.dict(exclude_unset=True)
    usuario = get_usuario_logado(db, current_user)
    historico_custo = None
    novo_custo = update_data.pop("preco_custo", None)
    if novo_custo is not None:
        historico_custo = custo_produto.atualizar_custo(db, produto, novo_custo, origem="manual", usuario=usuario)
    for field, value in update_data.items():
        if field == "ncm":
            value = normalizar_ncm(value)
        # Converter boolean para integer para vender_sem_estoque (0 ou 1)
        if field == "vender_sem_estoque" and isinstance(value, bool):
            value = 1 if value else 0
        setattr(produto, field, value)
    
    db.add(produto)
    db.commit()
    db.refresh(produto)
    if historico_custo is not None:
        _auditar_custo(db, request, usuario, produto, historico_custo)

    # Registrar auditoria
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Produto '{produto.descricao}' (código: {produto.codigo_interno}) atualizado por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return produto


@router.delete("/{produto_id}")
def deletar_produto(
    produto_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Deleta um produto"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    descricao = f"Produto '{produto.descricao}' (código: {produto.codigo_interno}) deletado"
    db.delete(produto)
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="produto",
        entidade_id=produto_id,
        descricao=f"{descricao} por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Produto deletado com sucesso"}


@router.put("/{produto_id}/estoque/adicionar")
def adicionar_estoque(
    produto_id: int,
    quantidade: float,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Adiciona quantidade ao estoque"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    produto.estoque_atual += quantidade
    db.add(produto)
    db.commit()
    db.refresh(produto)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="ajuste_estoque",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Estoque do produto '{produto.descricao}' adicionado em {quantidade} unidades por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {
        "message": "Estoque atualizado",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }


@router.put("/{produto_id}/estoque/remover")
def remover_estoque(
    produto_id: int,
    quantidade: float,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Remove quantidade do estoque"""
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    if produto.estoque_atual < quantidade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estoque insuficiente. Disponível: {produto.estoque_atual}"
        )
    
    produto.estoque_atual -= quantidade
    db.add(produto)
    db.commit()
    db.refresh(produto)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="ajuste_estoque",
        entidade="produto",
        entidade_id=produto.id,
        descricao=f"Estoque do produto '{produto.descricao}' removido em {quantidade} unidades por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {
        "message": "Estoque reduzido",
        "produto_id": produto.id,
        "novo_estoque": float(produto.estoque_atual)
    }
