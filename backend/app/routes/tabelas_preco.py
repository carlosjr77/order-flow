from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import TabelaPreco, TabelaPrecoItem, Produto, Usuario
from app.schemas import TabelaPrecoCreate, TabelaPrecoUpdate, TabelaPrecoResponse, SugestaoTabelaResponse
from app.utils.audit import registrar_auditoria, get_client_ip
from app.utils.sugestao_tabela import gerar_sugestao_tabela, extrair_texto_de_arquivo

router = APIRouter(prefix="/api/tabelas-preco", tags=["Tabelas de Preço"])


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


def tabela_preco_to_dict(tabela: TabelaPreco, db: Session) -> dict:
    """Converte uma tabela de preço em dicionário incluindo dados dos produtos das exceções"""
    data = {column.name: getattr(tabela, column.name) for column in tabela.__table__.columns}

    itens = db.query(TabelaPrecoItem).filter(TabelaPrecoItem.tabela_preco_id == tabela.id).all()
    produto_ids = [item.produto_id for item in itens]
    produtos_dict = {}
    if produto_ids:
        produtos = db.query(Produto).filter(Produto.id.in_(produto_ids)).all()
        produtos_dict = {produto.id: produto for produto in produtos}

    itens_formatados = []
    for item in itens:
        item_dict = {column.name: getattr(item, column.name) for column in item.__table__.columns}
        produto = produtos_dict.get(item.produto_id)
        item_dict["codigo_interno"] = produto.codigo_interno if produto else None
        item_dict["descricao"] = produto.descricao if produto else None
        item_dict["preco_custo"] = float(produto.preco_custo) if produto and produto.preco_custo else None
        itens_formatados.append(item_dict)

    data["itens"] = itens_formatados
    return data


@router.get("", response_model=List[TabelaPrecoResponse])
def listar_tabelas_preco(
    skip: int = 0,
    limit: int = 100,
    apenas_ativas: bool = False,
    busca: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as tabelas de preço"""
    query = db.query(TabelaPreco)

    if apenas_ativas:
        query = query.filter(TabelaPreco.ativa.is_(True))

    if busca:
        query = query.filter(TabelaPreco.nome.ilike(f"%{busca}%"))

    tabelas = query.order_by(TabelaPreco.nome).offset(skip).limit(limit).all()

    return [tabela_preco_to_dict(tabela, db) for tabela in tabelas]


@router.get("/{tabela_id}", response_model=TabelaPrecoResponse)
def obter_tabela_preco(
    tabela_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém uma tabela de preço específica com suas exceções por produto"""
    tabela = db.query(TabelaPreco).filter(TabelaPreco.id == tabela_id).first()

    if not tabela:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tabela de preço não encontrada"
        )

    return tabela_preco_to_dict(tabela, db)


def _validar_itens_unicos(itens):
    produto_ids = [item.produto_id for item in itens]
    if len(produto_ids) != len(set(produto_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é permitido cadastrar mais de uma exceção para o mesmo produto na tabela"
        )


def _sincronizar_itens(db: Session, tabela: TabelaPreco, itens):
    """Remove os itens antigos e cria os itens informados para a tabela de preço"""
    _validar_itens_unicos(itens)

    db.query(TabelaPrecoItem).filter(TabelaPrecoItem.tabela_preco_id == tabela.id).delete()

    for item in itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Produto {item.produto_id} não encontrado"
            )

        preco_calculado = produto.preco_custo * (1 + Decimal(str(item.margem_especifica_percentual)) / 100)

        db.add(TabelaPrecoItem(
            tabela_preco_id=tabela.id,
            produto_id=item.produto_id,
            margem_especifica_percentual=item.margem_especifica_percentual,
            preco_calculado=preco_calculado
        ))


@router.post("", response_model=TabelaPrecoResponse)
def criar_tabela_preco(
    tabela_data: TabelaPrecoCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria uma nova tabela de preço, com suas exceções por produto"""
    nova_tabela = TabelaPreco(
        nome=tabela_data.nome,
        descricao=tabela_data.descricao,
        margem_geral_percentual=tabela_data.margem_geral_percentual,
        ativa=tabela_data.ativa
    )

    db.add(nova_tabela)
    db.flush()

    _sincronizar_itens(db, nova_tabela, tabela_data.itens)

    db.commit()
    db.refresh(nova_tabela)

    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="tabela_preco",
        entidade_id=nova_tabela.id,
        descricao=f"Tabela de preço '{nova_tabela.nome}' criada por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )

    return tabela_preco_to_dict(nova_tabela, db)


@router.put("/{tabela_id}", response_model=TabelaPrecoResponse)
def atualizar_tabela_preco(
    tabela_id: int,
    tabela_data: TabelaPrecoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Atualiza uma tabela de preço existente e suas exceções por produto"""
    tabela = db.query(TabelaPreco).filter(TabelaPreco.id == tabela_id).first()

    if not tabela:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tabela de preço não encontrada"
        )

    update_data = tabela_data.dict(exclude_unset=True, exclude={"itens"})
    for field, value in update_data.items():
        setattr(tabela, field, value)

    if tabela_data.itens is not None:
        _sincronizar_itens(db, tabela, tabela_data.itens)

    db.commit()
    db.refresh(tabela)

    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="tabela_preco",
        entidade_id=tabela.id,
        descricao=f"Tabela de preço '{tabela.nome}' atualizada por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )

    return tabela_preco_to_dict(tabela, db)


@router.delete("/{tabela_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_tabela_preco(
    tabela_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Deleta uma tabela de preço e suas exceções"""
    tabela = db.query(TabelaPreco).filter(TabelaPreco.id == tabela_id).first()

    if not tabela:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tabela de preço não encontrada"
        )

    nome = tabela.nome
    db.query(TabelaPrecoItem).filter(TabelaPrecoItem.tabela_preco_id == tabela.id).delete()
    db.delete(tabela)
    db.commit()

    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="tabela_preco",
        entidade_id=tabela_id,
        descricao=f"Tabela de preço '{nome}' excluída por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )

    return None


@router.post("/sugestao", response_model=SugestaoTabelaResponse)
async def sugerir_tabela_preco(
    texto: Optional[str] = Form(None),
    arquivo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Analisa um arquivo (PDF/imagem) e/ou texto colado de uma nota/pedido e sugere
    a Tabela de Preço ativa com menor divergência em relação aos preços informados"""
    texto_arquivo = None

    if arquivo is not None:
        conteudo = await arquivo.read()
        if conteudo:
            try:
                texto_arquivo = extrair_texto_de_arquivo(
                    conteudo, arquivo.content_type or "", arquivo.filename or ""
                )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(e)
                )

    try:
        return gerar_sugestao_tabela(db, texto, texto_arquivo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
