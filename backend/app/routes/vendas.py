from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from app.core.database import get_db
from app.routes.auth import get_current_user
from app.models import Venda, ItemVenda, Produto, Usuario
from app.schemas import VendaCreate, VendaUpdate, VendaResponse, VendaDetailResponse
from app.utils.audit import registrar_auditoria, get_client_ip

router = APIRouter(prefix="/api/vendas", tags=["Vendas"])


def get_usuario_logado(db: Session, current_user: dict) -> Usuario:
    """Obtém o objeto Usuario completo a partir do token"""
    return db.query(Usuario).filter(Usuario.id == current_user.get("user_id")).first()


def venda_to_dict(venda: Venda, db: Session) -> dict:
    """Converte uma venda em dicionário incluindo nome do usuário"""
    data = {column.name: getattr(venda, column.name) for column in venda.__table__.columns}
    
    # Buscar nome do usuário que registrou a venda
    if venda.usuario_id:
        usuario = db.query(Usuario).filter(Usuario.id == venda.usuario_id).first()
        data["usuario_nome"] = usuario.nome or usuario.username if usuario else None
    else:
        data["usuario_nome"] = None
    
    return data


@router.get("", response_model=List[VendaDetailResponse])
def listar_vendas(
    skip: int = 0,
    limit: int = 100,
    status_filter: str = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lista todas as vendas (opcionalmente inclui excluídas)"""
    query = db.query(Venda)
    
    # Filtrar vendas não excluídas (a menos que include_deleted=True)
    if not include_deleted:
        query = query.filter(Venda.deleted_at.is_(None))
    
    if status_filter:
        query = query.filter(Venda.status == status_filter)
    
    vendas = query.offset(skip).limit(limit).all()
    
    resultado = []
    for venda in vendas:
        # Buscar apenas itens não excluídos
        itens = db.query(ItemVenda).filter(
            ItemVenda.venda_id == venda.id,
            ItemVenda.deleted_at.is_(None)
        ).all()
        resultado.append({
            **venda_to_dict(venda, db),
            "itens": itens
        })
    
    return resultado


@router.get("/{venda_id}", response_model=VendaDetailResponse)
def obter_venda(
    venda_id: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Obtém uma venda específica com dados completos dos produtos"""
    query = db.query(Venda).filter(Venda.id == venda_id)
    
    if not include_deleted:
        query = query.filter(Venda.deleted_at.is_(None))
    
    venda = query.first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Buscar itens com dados do produto
    query_itens = db.query(ItemVenda, Produto).join(
        Produto, ItemVenda.produto_id == Produto.id
    ).filter(ItemVenda.venda_id == venda_id)
    
    if not include_deleted:
        query_itens = query_itens.filter(ItemVenda.deleted_at.is_(None))
    
    itens = query_itens.all()
    
    # Formatando itens com dados do produto
    itens_formatados = []
    for item, produto in itens:
        item_dict = {column.name: getattr(item, column.name) for column in item.__table__.columns}
        item_dict['codigo_interno'] = produto.codigo_interno
        item_dict['descricao'] = produto.descricao
        item_dict['unidade_medida'] = produto.unidade_medida
        item_dict['ncm'] = produto.ncm
        item_dict['preco_custo'] = float(produto.preco_custo) if produto.preco_custo else 0
        itens_formatados.append(item_dict)
    
    return {
        **venda_to_dict(venda, db),
        "itens": itens_formatados
    }


@router.post("", response_model=VendaResponse)
def criar_venda(
    venda_data: VendaCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cria uma nova venda com itens"""
    
    if not venda_data.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Venda deve ter pelo menos um item"
        )
    
    usuario = get_usuario_logado(db, current_user)
    
    # Calcular value total
    valor_total = Decimal("0")
    valor_frete = Decimal(str(venda_data.valor_frete or 0))
    
    # Criar venda
    nova_venda = Venda(
        usuario_id=usuario.id if usuario else None,
        status="pendente",
        forma_pagamento=venda_data.forma_pagamento,
        observacoes=venda_data.observacoes,
        valor_frete=valor_frete,
        nome_cliente=venda_data.nome_cliente,
        data_entrega=venda_data.data_entrega if venda_data.data_entrega else None,
        data_vencimento=venda_data.data_vencimento if venda_data.data_vencimento else None
    )
    
    db.add(nova_venda)
    db.flush()  # Para obter o ID da venda
    
    # Processar itens e reduzir estoque
    for item in venda_data.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Produto {item.produto_id} não encontrado"
            )
        
        # Verificar estoque apenas se produto nao permitir venda sem estoque
        if produto.estoque_atual < item.quantidade and not produto.vender_sem_estoque:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {produto.descricao}. Disponível: {produto.estoque_atual}"
            )
        
        # Reduzir estoque (apenas se tiver estoque e nao estiver vendendo sem estoque)
        if produto.estoque_atual >= item.quantidade:
            produto.estoque_atual -= Decimal(str(item.quantidade))
        
        # Criar item de venda
        valor_total_item = Decimal(str(item.quantidade)) * Decimal(str(item.valor_unitario))
        
        item_venda = ItemVenda(
            venda_id=nova_venda.id,
            produto_id=item.produto_id,
            quantidade=Decimal(str(item.quantidade)),
            valor_unitario=Decimal(str(item.valor_unitario)),
            valor_total=valor_total_item
        )
        
        db.add(item_venda)
        valor_total += valor_total_item
    
    # Atualizar value total da venda (incluindo frete)
    nova_venda.valor_total = valor_total + valor_frete
    
    db.commit()
    db.refresh(nova_venda)
    
    # Registrar auditoria
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="criar",
        entidade="venda",
        entidade_id=nova_venda.id,
        descricao=f"Venda #{nova_venda.id} criada por '{usuario_nome}' no valor de R$ {float(nova_venda.valor_total):.2f}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return nova_venda


def formatar_valor(valor) -> str:
    """Formata um valor numérico para moeda brasileira"""
    try:
        return f"R$ {float(valor):.2f}"
    except (TypeError, ValueError):
        return str(valor)


def formatar_data(data) -> str:
    """Formata uma data/datetime para string legível no padrão dd/MM/yyyy HH:mm:ss"""
    if data is None:
        return "Não informado"
    if isinstance(data, datetime):
        return data.strftime("%d/%m/%Y %H:%M:%S")
    try:
        return datetime.strptime(str(data), "%Y-%m-%d").strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return str(data)


def item_venda_to_dict(item: ItemVenda, produto: Produto = None) -> dict:
    """Converte um item de venda em dicionário para comparação"""
    return {
        "produto_id": item.produto_id,
        "descricao": produto.descricao if produto else "",
        "codigo_interno": produto.codigo_interno if produto else "",
        "quantidade": float(item.quantidade),
        "valor_unitario": float(item.valor_unitario),
        "valor_total": float(item.valor_total),
        "unidade_medida": produto.unidade_medida if produto else "",
    }


def gerar_descricao_edicao(
    venda_original: Venda,
    venda_atualizada: Venda,
    itens_originais: list,
    itens_novos: list,
    produtos_dict: dict
) -> str:
    """Gera uma descrição detalhada e bem formatada das alterações em uma venda"""
    
    def linha(tipo="=", tamanho=60):
        return tipo * tamanho
    
    linhas = [
        linha("="),
        f"  EDIÇÃO DA VENDA #{venda_atualizada.id}",
        linha("="),
        "",
    ]
    
    # Campos da venda
    campos_venda = {
        "forma_pagamento": ("Forma de Pagamento", lambda x: x or "Não informado"),
        "observacoes": ("Observações", lambda x: x or "Não informado"),
        "nome_cliente": ("Cliente", lambda x: x or "Não informado"),
        "valor_frete": ("Valor do Frete", formatar_valor),
        "valor_total": ("Valor Total", formatar_valor),
        "data_entrega": ("Data de Entrega", formatar_data),
        "data_vencimento": ("Data de Vencimento", formatar_data),
        "status": ("Status", lambda x: x or "Não informado"),
    }
    
    alteracoes_venda = []
    for campo, (label, formatador) in campos_venda.items():
        original = getattr(venda_original, campo)
        novo = getattr(venda_atualizada, campo)
        
        # Converter Decimal para float para comparação
        if campo in ("valor_frete", "valor_total"):
            original = float(original) if original is not None else 0
            novo = float(novo) if novo is not None else 0
        
        if original != novo:
            alteracoes_venda.append((label, formatador(original), formatador(novo)))
    
    if alteracoes_venda:
        linhas.extend([
            "📋 ALTERAÇÕES NO PEDIDO",
            linha("-"),
        ])
        for label, de, para in alteracoes_venda:
            linhas.append(f"  • {label}:")
            linhas.append(f"      De:  {de}")
            linhas.append(f"      Para: {para}")
        linhas.append("")
    
    # Comparar itens
    originais_dict = {item.id: item for item in itens_originais}
    novos_dict = {}
    itens_adicionados = []
    itens_removidos = []
    itens_alterados = []
    
    for item_novo in itens_novos:
        if hasattr(item_novo, "id") and item_novo.id in originais_dict:
            novos_dict[item_novo.id] = item_novo
        else:
            itens_adicionados.append(item_novo)
    
    for item_id, item_original in originais_dict.items():
        if item_id not in novos_dict:
            itens_removidos.append(item_original)
        else:
            item_novo = novos_dict[item_id]
            produto = produtos_dict.get(item_original.produto_id)
            
            qtd_original = float(item_original.quantidade)
            qtd_nova = float(item_novo.quantidade)
            unit_original = float(item_original.valor_unitario)
            unit_novo = float(item_novo.valor_unitario)
            total_original = float(item_original.valor_total)
            total_novo = float(item_novo.valor_total)
            
            alteracoes_item = []
            if qtd_original != qtd_nova:
                alteracoes_item.append(f"Quantidade: {qtd_original:.3f} → {qtd_nova:.3f}")
            if abs(unit_original - unit_novo) > 0.001:
                alteracoes_item.append(f"Valor Unitário: {formatar_valor(unit_original)} → {formatar_valor(unit_novo)}")
            if abs(total_original - total_novo) > 0.001:
                alteracoes_item.append(f"Valor Total: {formatar_valor(total_original)} → {formatar_valor(total_novo)}")
            
            if alteracoes_item:
                descricao = produto.descricao if produto else f"Produto ID {item_original.produto_id}"
                itens_alterados.append((descricao, alteracoes_item))
    
    if itens_adicionados:
        linhas.extend([
            "➕ ITENS ADICIONADOS",
            linha("-"),
        ])
        for item in itens_adicionados:
            produto = produtos_dict.get(item.produto_id)
            descricao = produto.descricao if produto else f"Produto ID {item.produto_id}"
            qtd = float(item.quantidade)
            unit = float(item.valor_unitario)
            total = float(item.valor_total)
            linhas.append(f"  • {descricao}")
            linhas.append(f"      Qtd: {qtd:.3f} x {formatar_valor(unit)} = {formatar_valor(total)}")
        linhas.append("")
    
    if itens_removidos:
        linhas.extend([
            "➖ ITENS REMOVIDOS",
            linha("-"),
        ])
        for item in itens_removidos:
            produto = produtos_dict.get(item.produto_id)
            descricao = produto.descricao if produto else f"Produto ID {item.produto_id}"
            qtd = float(item.quantidade)
            unit = float(item.valor_unitario)
            total = float(item.valor_total)
            linhas.append(f"  • {descricao}")
            linhas.append(f"      Qtd: {qtd:.3f} x {formatar_valor(unit)} = {formatar_valor(total)}")
        linhas.append("")
    
    if itens_alterados:
        linhas.extend([
            "✏️ ITENS ALTERADOS",
            linha("-"),
        ])
        for descricao, alteracoes_item in itens_alterados:
            linhas.append(f"  • {descricao}")
            for alteracao in alteracoes_item:
                linhas.append(f"      - {alteracao}")
        linhas.append("")
    
    if not alteracoes_venda and not itens_adicionados and not itens_removidos and not itens_alterados:
        linhas.extend([
            "ℹ️ Nenhuma alteração identificada nos dados da venda.",
            "",
        ])
    
    linhas.extend([
        linha("="),
        f"  Valor Total Atualizado: {formatar_valor(venda_atualizada.valor_total)}",
        linha("="),
    ])
    
    return "\n".join(linhas)


@router.put("/{venda_id}", response_model=VendaResponse)
def editar_venda(
    venda_id: int,
    venda_data: VendaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Edita uma venda existente, atualizando dados e itens, ajustando estoque e gerando log detalhado"""
    
    if not venda_data.itens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Venda deve ter pelo menos um item"
        )
    
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Guardar estado original para auditoria
    venda_original = Venda(
        forma_pagamento=venda.forma_pagamento,
        observacoes=venda.observacoes,
        valor_frete=venda.valor_frete,
        valor_total=venda.valor_total,
        nome_cliente=venda.nome_cliente,
        data_entrega=venda.data_entrega,
        data_vencimento=venda.data_vencimento,
        status=venda.status
    )
    
    itens_originais = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.is_(None)
    ).all()
    
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    
    # Carregar todos os produtos envolvidos
    produtos_ids = set(item.produto_id for item in venda_data.itens)
    for item in itens_originais:
        produtos_ids.add(item.produto_id)
    
    produtos_dict = {}
    for produto in db.query(Produto).filter(Produto.id.in_(produtos_ids)).all():
        produtos_dict[produto.id] = produto
    
    # 1. Reverter estoque dos itens originais
    for item in itens_originais:
        produto = produtos_dict.get(item.produto_id)
        if produto:
            produto.estoque_atual += Decimal(str(item.quantidade))
            db.add(produto)
    
    # 2. Marcar itens originais como excluídos (exclusão lógica)
    for item in itens_originais:
        item.deleted_at = datetime.now()
        db.add(item)
    
    # 3. Criar novos itens e ajustar estoque
    valor_total_itens = Decimal("0")
    valor_frete = Decimal(str(venda_data.valor_frete or 0))
    novos_itens = []
    
    for item in venda_data.itens:
        produto = produtos_dict.get(item.produto_id)
        
        if not produto:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Produto {item.produto_id} não encontrado"
            )
        
        quantidade = Decimal(str(item.quantidade))
        valor_unitario = Decimal(str(item.valor_unitario))
        
        # Verificar estoque apenas se produto não permitir venda sem estoque
        if produto.estoque_atual < quantidade and not produto.vender_sem_estoque:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para {produto.descricao}. Disponível: {produto.estoque_atual}"
            )
        
        # Reduzir estoque
        if produto.estoque_atual >= quantidade:
            produto.estoque_atual -= quantidade
            db.add(produto)
        
        valor_total_item = quantidade * valor_unitario
        
        item_venda = ItemVenda(
            venda_id=venda.id,
            produto_id=item.produto_id,
            quantidade=quantidade,
            valor_unitario=valor_unitario,
            valor_total=valor_total_item
        )
        
        db.add(item_venda)
        novos_itens.append(item_venda)
        valor_total_itens += valor_total_item
    
    # 4. Atualizar dados da venda
    venda.forma_pagamento = venda_data.forma_pagamento
    venda.observacoes = venda_data.observacoes
    venda.valor_frete = valor_frete
    venda.nome_cliente = venda_data.nome_cliente
    venda.data_entrega = venda_data.data_entrega if venda_data.data_entrega else None
    venda.data_vencimento = venda_data.data_vencimento if venda_data.data_vencimento else None
    venda.valor_total = valor_total_itens + valor_frete
    
    # Se vier status na requisição, atualiza (ex: concluir ao salvar edição)
    if venda_data.status:
        venda.status = venda_data.status
    
    db.add(venda)
    db.commit()
    db.refresh(venda)
    
    # Registrar auditoria detalhada
    descricao_edicao = gerar_descricao_edicao(
        venda_original=venda_original,
        venda_atualizada=venda,
        itens_originais=itens_originais,
        itens_novos=novos_itens,
        produtos_dict=produtos_dict
    )
    
    registrar_auditoria(
        db=db,
        acao="editar",
        entidade="venda",
        entidade_id=venda.id,
        descricao=descricao_edicao,
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return venda


@router.put("/{venda_id}/concluir")
def concluir_venda(
    venda_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Conclui uma venda alterando seu status"""
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    venda.status = "concluído"
    db.add(venda)
    db.commit()
    db.refresh(venda)
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    registrar_auditoria(
        db=db,
        acao="concluir",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} concluída por '{usuario_nome}'",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda concluída com sucesso", "venda_id": venda.id}


class CancelarVendaRequest(BaseModel):
    motivo_cancelamento: Optional[str] = None


@router.put("/{venda_id}/cancelar")
def cancelar_venda(
    venda_id: int,
    request: Request,
    dados: CancelarVendaRequest = CancelarVendaRequest(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cancela uma venda e reverte o estoque"""
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Reverter estoque (apenas itens não excluídos)
    itens = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.is_(None)
    ).all()
    
    for item in itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if produto:
            produto.estoque_atual += item.quantidade
            db.add(produto)
    
    venda.status = "cancelado"
    venda.motivo_cancelamento = dados.motivo_cancelamento
    db.add(venda)
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    motivo_texto = f" Motivo: {dados.motivo_cancelamento}" if dados.motivo_cancelamento else ""
    registrar_auditoria(
        db=db,
        acao="cancelar",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} cancelada por '{usuario_nome}' e estoque revertido.{motivo_texto}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda cancelada e estoque revertido", "venda_id": venda.id}


class ExcluirVendaRequest(BaseModel):
    motivo_cancelamento: Optional[str] = None


@router.delete("/{venda_id}")
def excluir_venda(
    venda_id: int,
    request: Request,
    dados: ExcluirVendaRequest = ExcluirVendaRequest(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Exclusão lógica de venda"""
    venda = db.query(Venda).filter(
        Venda.id == venda_id,
        Venda.deleted_at.is_(None)
    ).first()
    
    if not venda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venda não encontrada"
        )
    
    # Marcar venda como excluída
    venda.deleted_at = datetime.now()
    venda.motivo_cancelamento = dados.motivo_cancelamento
    db.add(venda)
    
    # Marcar todos os itens da venda como excluídos
    itens = db.query(ItemVenda).filter(
        ItemVenda.venda_id == venda_id,
        ItemVenda.deleted_at.is_(None)
    ).all()
    
    for item in itens:
        item.deleted_at = datetime.now()
        db.add(item)
    
    db.commit()
    
    # Registrar auditoria
    usuario = get_usuario_logado(db, current_user)
    usuario_nome = usuario.nome or usuario.username if usuario else "sistema"
    motivo_texto = f" Motivo: {dados.motivo_cancelamento}" if dados.motivo_cancelamento else ""
    registrar_auditoria(
        db=db,
        acao="excluir",
        entidade="venda",
        entidade_id=venda.id,
        descricao=f"Venda #{venda.id} excluída (exclusão lógica) por '{usuario_nome}'.{motivo_texto}",
        user_id=usuario.id if usuario else None,
        user_name=usuario_nome,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Venda excluída com sucesso (exclusão lógica)", "venda_id": venda.id}
