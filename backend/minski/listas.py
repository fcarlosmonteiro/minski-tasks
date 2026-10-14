from datetime import UTC, datetime
from typing import ClassVar

from marshmallow import Schema, fields, validate
from sqlalchemy import text

from minski import Texto, db


def _fim_da_fila(ctx):
    # ponytail: MAX+1 sem lock; dois inserts concorrentes podem empatar. Lock/UNIQUE se importar.
    return ctx.connection.scalar(text("SELECT COALESCE(MAX(posicao), -1) + 1 FROM lista"))


class Lista(db.Model):
    __tablename__ = "lista"
    # Um INSERT por linha: em lote, todas calculariam a posicao antes de qualquer gravação.
    __mapper_args__: ClassVar[dict] = {"batch": False}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # ponytail: NOCASE do SQLite só iguala A-Z; "Ação" e "AÇÃO" são nomes distintos.
    nome = db.Column(db.String(60, collation="NOCASE"), nullable=False, unique=True)
    posicao = db.Column(db.Integer, nullable=False, default=_fim_da_fila)
    criada_em = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(UTC))


class ListaSchema(Schema):
    id = fields.Integer(dump_only=True)
    nome = Texto(required=True, validate=validate.Length(min=1, max=60))
    posicao = fields.Integer(dump_only=True)
    criada_em = fields.DateTime(dump_only=True)
