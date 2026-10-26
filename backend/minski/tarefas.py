from datetime import UTC, datetime
from typing import ClassVar

from flask import Blueprint
from marshmallow import fields
from sqlalchemy import func, select, text
from sqlalchemy.orm import validates

from minski import (
    DATA_HORA,
    Base,
    Booleano,
    Texto,
    carregar,
    db,
    falhar,
    ler_ordem,
    listas,
)

bp = Blueprint("tarefas", __name__, url_prefix="/api")

_FIM_DAS_PENDENTES = text(
    "SELECT COALESCE(MAX(ordem), -1) + 1 FROM tarefa"
    " WHERE lista_id = :lista_id AND concluida = 0"
)


def _agora():
    return datetime.now(UTC)


def _fim_das_pendentes(ctx):
    # ponytail: MAX+1 sem lock, mesmo teto de listas._fim_da_fila.
    lista_id = ctx.get_current_parameters()["lista_id"]
    return ctx.connection.scalar(_FIM_DAS_PENDENTES, {"lista_id": lista_id})


class Tarefa(db.Model):
    __tablename__ = "tarefa"
    # Um INSERT por linha: em lote, todas calculariam a ordem antes de qualquer gravação.
    __mapper_args__: ClassVar[dict] = {"batch": False}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # Só a FK: a cascata é do banco, então listas nunca toca nesta tabela.
    lista_id = db.Column(
        db.Integer, db.ForeignKey("lista.id", ondelete="CASCADE"), nullable=False, index=True
    )
    titulo = db.Column(db.String(200), nullable=False)
    concluida = db.Column(db.Boolean, nullable=False, default=False)
    concluida_em = db.Column(db.DateTime, nullable=True)
    ordem = db.Column(db.Integer, nullable=False, default=_fim_das_pendentes)

    @validates("concluida")
    def _marcar_conclusao(self, _key, concluida):
        if concluida and not self.concluida:
            self.concluida_em = _agora()
        elif not concluida:
            self.concluida_em = None
        return concluida


class TarefaSchema(Base):
    id = fields.Integer(dump_only=True)
    lista_id = fields.Integer(dump_only=True)
    titulo = Texto(
        "Informe o título da tarefa.", "O título da tarefa pode ter no máximo 200 caracteres.", 200
    )
    concluida = Booleano()
    ordem = fields.Integer(dump_only=True)
    concluida_em = fields.DateTime(DATA_HORA, dump_only=True)


def pendentes_por_lista():
    """{lista_id: quantidade de tarefas pendentes}; listas sem pendentes ficam de fora."""
    consulta = (
        select(Tarefa.lista_id, func.count())
        .where(Tarefa.concluida.is_(False))
        .group_by(Tarefa.lista_id)
    )
    return dict(db.session.execute(consulta).all())


def _exigir_lista(lista_id):
    if not listas.existe(lista_id):
        falhar(404, {"erro": "Lista não encontrada."})


def _obter(tarefa_id):
    return db.session.get(Tarefa, tarefa_id) or falhar(404, {"erro": "Tarefa não encontrada."})


def _da_lista(lista_id, concluida):
    return select(Tarefa).where(Tarefa.lista_id == lista_id, Tarefa.concluida.is_(concluida))


@bp.get("/listas/<int:lista_id>/tarefas")
def listar(lista_id):
    _exigir_lista(lista_id)
    pendentes = _da_lista(lista_id, False).order_by(Tarefa.ordem, Tarefa.id)
    concluidas = _da_lista(lista_id, True).order_by(Tarefa.concluida_em.desc(), Tarefa.id.desc())
    todas = [*db.session.scalars(pendentes), *db.session.scalars(concluidas)]
    return TarefaSchema(many=True).dump(todas)


@bp.post("/listas/<int:lista_id>/tarefas")
def criar(lista_id):
    _exigir_lista(lista_id)
    tarefa = Tarefa(lista_id=lista_id, **carregar(TarefaSchema(only=("titulo",))))
    db.session.add(tarefa)
    db.session.commit()
    return TarefaSchema().dump(tarefa), 201


@bp.patch("/tarefas/<int:tarefa_id>")
def editar(tarefa_id):
    tarefa = _obter(tarefa_id)
    dados = carregar(TarefaSchema(partial=True))
    if tarefa.concluida and dados.get("concluida") is False:
        # Reabrir manda para o fim das pendentes; calculado antes do autoflush do novo estado.
        tarefa.ordem = db.session.scalar(_FIM_DAS_PENDENTES, {"lista_id": tarefa.lista_id})
    for campo, valor in dados.items():
        setattr(tarefa, campo, valor)  # define o valor enviado; repetir é idempotente
    db.session.commit()
    return TarefaSchema().dump(tarefa)


@bp.delete("/tarefas/<int:tarefa_id>")
def excluir(tarefa_id):
    db.session.delete(_obter(tarefa_id))
    db.session.commit()
    return "", 204


@bp.put("/listas/<int:lista_id>/tarefas/ordem")
def ordenar(lista_id):
    _exigir_lista(lista_id)
    pendentes = {t.id: t for t in db.session.scalars(_da_lista(lista_id, False))}
    mensagem = "A lista de ids deve conter exatamente as tarefas pendentes desta lista."
    for ordem, tarefa_id in enumerate(ler_ordem(set(pendentes), mensagem)):
        pendentes[tarefa_id].ordem = ordem
    db.session.commit()
    return "", 204
