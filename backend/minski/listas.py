from typing import ClassVar

from flask import Blueprint
from marshmallow import fields
from sqlalchemy import select, text

from minski import Base, Texto, carregar, db, falhar, ler_ordem

bp = Blueprint("listas", __name__, url_prefix="/api/listas")


def _fim_da_fila(ctx):
    # ponytail: MAX+1 sem lock; dois inserts concorrentes podem empatar. Lock/UNIQUE se importar.
    return ctx.connection.scalar(text("SELECT COALESCE(MAX(ordem), -1) + 1 FROM lista"))


class Lista(db.Model):
    __tablename__ = "lista"
    # Um INSERT por linha: em lote, todas calculariam a ordem antes de qualquer gravação.
    __mapper_args__: ClassVar[dict] = {"batch": False}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # Barreira final; a regra de unicidade (com acentos) é _exigir_nome_livre.
    nome = db.Column(db.String(60, collation="NOCASE"), nullable=False, unique=True)
    ordem = db.Column(db.Integer, nullable=False, default=_fim_da_fila)


class ListaSchema(Base):
    id = fields.Integer(dump_only=True)
    nome = Texto(
        "Informe o nome da lista.", "O nome da lista pode ter no máximo 60 caracteres.", 60
    )
    ordem = fields.Integer(dump_only=True)


def existe(lista_id):
    return db.session.get(Lista, lista_id) is not None


def _obter(lista_id):
    return db.session.get(Lista, lista_id) or falhar(404, "Lista não encontrada.")


def _exigir_nome_livre(nome, exceto=None):
    # ponytail: lê todos os nomes (listas pessoais são poucas); casefold iguala "Ação" e
    # "AÇÃO", o que o NOCASE do SQLite não faz. Corrida entre checagem e commit vira 500.
    alvo = nome.casefold()
    nomes = db.session.execute(select(Lista.id, Lista.nome))
    if any(i != exceto and n.casefold() == alvo for i, n in nomes):
        falhar(409, "Já existe uma lista com esse nome.")


@bp.get("")
def listar():
    todas = db.session.scalars(select(Lista).order_by(Lista.ordem, Lista.id))
    return ListaSchema(many=True).dump(todas)


@bp.post("")
def criar():
    dados = carregar(ListaSchema())
    _exigir_nome_livre(dados["nome"])
    lista = Lista(**dados)
    db.session.add(lista)
    db.session.commit()
    return ListaSchema().dump(lista), 201


@bp.patch("/<int:lista_id>")
def renomear(lista_id):
    lista = _obter(lista_id)
    dados = carregar(ListaSchema())
    _exigir_nome_livre(dados["nome"], exceto=lista.id)
    lista.nome = dados["nome"]
    db.session.commit()
    return ListaSchema().dump(lista)


@bp.delete("/<int:lista_id>")
def excluir(lista_id):
    db.session.delete(_obter(lista_id))  # as tarefas saem pelo ON DELETE CASCADE do banco
    db.session.commit()
    return "", 204


@bp.put("/ordem")
def ordenar():
    atuais = set(db.session.scalars(select(Lista.id)))
    ids = ler_ordem(atuais, "A ordem enviada está desatualizada: recarregue as listas.")
    for ordem, lista_id in enumerate(ids):
        db.session.get(Lista, lista_id).ordem = ordem
    db.session.commit()
    return listar()
