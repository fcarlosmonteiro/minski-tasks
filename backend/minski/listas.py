from datetime import UTC, datetime
from typing import ClassVar

from flask import Blueprint
from marshmallow import fields
from sqlalchemy import select, text

from minski import DATA_HORA, Base, Texto, carregar, db, falhar, ler_ordem, tarefas

bp = Blueprint("listas", __name__, url_prefix="/api/listas")


def _fim_da_fila(ctx):
    # ponytail: MAX+1 sem lock; dois inserts concorrentes podem empatar. Lock/UNIQUE se importar.
    return ctx.connection.scalar(text("SELECT COALESCE(MAX(posicao), -1) + 1 FROM lista"))


class Lista(db.Model):
    __tablename__ = "lista"
    # Um INSERT por linha: em lote, todas calculariam a posicao antes de qualquer gravação.
    __mapper_args__: ClassVar[dict] = {"batch": False}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # Barreira final; a regra de unicidade (com acentos) é _exigir_nome_livre.
    nome = db.Column(db.String(60, collation="NOCASE"), nullable=False, unique=True)
    posicao = db.Column(db.Integer, nullable=False, default=_fim_da_fila)
    criada_em = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(UTC))


class ListaSchema(Base):
    id = fields.Integer(dump_only=True)
    nome = Texto(
        "Informe o nome da lista.", "O nome da lista pode ter no máximo 60 caracteres.", 60
    )
    posicao = fields.Integer(dump_only=True)
    criada_em = fields.DateTime(DATA_HORA, dump_only=True)


def existe(lista_id):
    return db.session.get(Lista, lista_id) is not None


def _obter(lista_id):
    return db.session.get(Lista, lista_id) or falhar(404, {"erro": "Lista não encontrada."})


def _json(lista, pendentes):
    return {**ListaSchema().dump(lista), "pendentes": pendentes}


def _exigir_nome_livre(nome, exceto=None):
    # ponytail: lê todos os nomes (listas pessoais são poucas); casefold iguala "Ação" e
    # "AÇÃO", o que o NOCASE do SQLite não faz. Corrida entre checagem e commit vira 500.
    alvo = nome.casefold()
    nomes = db.session.execute(select(Lista.id, Lista.nome))
    if any(i != exceto and n.casefold() == alvo for i, n in nomes):
        falhar(400, {"erros": {"nome": "Já existe uma lista com esse nome."}})


@bp.get("")
def listar():
    pendentes = tarefas.pendentes_por_lista()
    todas = db.session.scalars(select(Lista).order_by(Lista.posicao, Lista.id))
    return [_json(lista, pendentes.get(lista.id, 0)) for lista in todas]


@bp.post("")
def criar():
    dados = carregar(ListaSchema())
    _exigir_nome_livre(dados["nome"])
    lista = Lista(**dados)
    db.session.add(lista)
    db.session.commit()
    return _json(lista, 0), 201


@bp.patch("/<int:lista_id>")
def renomear(lista_id):
    lista = _obter(lista_id)
    dados = carregar(ListaSchema())
    _exigir_nome_livre(dados["nome"], exceto=lista.id)
    lista.nome = dados["nome"]
    db.session.commit()
    return _json(lista, tarefas.pendentes_por_lista().get(lista.id, 0))


@bp.delete("/<int:lista_id>")
def excluir(lista_id):
    db.session.delete(_obter(lista_id))  # as tarefas saem pelo ON DELETE CASCADE do banco
    db.session.commit()
    return "", 204


@bp.put("/ordem")
def ordenar():
    atuais = set(db.session.scalars(select(Lista.id)))
    ids = ler_ordem(atuais, "A lista de ids deve conter exatamente as listas atuais.")
    for posicao, lista_id in enumerate(ids):
        db.session.get(Lista, lista_id).posicao = posicao
    db.session.commit()
    return "", 204
