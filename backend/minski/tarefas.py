from datetime import UTC, datetime
from typing import ClassVar

from marshmallow import Schema, fields, validate
from sqlalchemy import text
from sqlalchemy.orm import validates

from minski import Texto, db


def _agora():
    return datetime.now(UTC)


def _fim_das_pendentes(ctx):
    # ponytail: MAX+1 sem lock, mesmo teto de listas._fim_da_fila.
    return ctx.connection.scalar(
        text(
            "SELECT COALESCE(MAX(posicao), -1) + 1 FROM tarefa"
            " WHERE lista_id = :lista_id AND concluida = 0"
        ),
        {"lista_id": ctx.get_current_parameters()["lista_id"]},
    )


class Tarefa(db.Model):
    __tablename__ = "tarefa"
    # Um INSERT por linha: em lote, todas calculariam a posicao antes de qualquer gravação.
    __mapper_args__: ClassVar[dict] = {"batch": False}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # Só a FK: a cascata é do banco, então listas nunca toca nesta tabela.
    lista_id = db.Column(
        db.Integer, db.ForeignKey("lista.id", ondelete="CASCADE"), nullable=False, index=True
    )
    titulo = db.Column(db.String(200), nullable=False)
    concluida = db.Column(db.Boolean, nullable=False, default=False)
    concluida_em = db.Column(db.DateTime, nullable=True)
    posicao = db.Column(db.Integer, nullable=False, default=_fim_das_pendentes)
    criada_em = db.Column(db.DateTime, nullable=False, default=_agora)

    @validates("concluida")
    def _marcar_conclusao(self, _key, concluida):
        if concluida and not self.concluida:
            self.concluida_em = _agora()
        elif not concluida:
            self.concluida_em = None
        return concluida


class TarefaSchema(Schema):
    id = fields.Integer(dump_only=True)
    lista_id = fields.Integer(required=True)
    titulo = Texto(required=True, validate=validate.Length(min=1, max=200))
    concluida = fields.Boolean(load_default=False)
    concluida_em = fields.DateTime(dump_only=True)
    posicao = fields.Integer(dump_only=True)
    criada_em = fields.DateTime(dump_only=True)
