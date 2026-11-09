"""Modelo persistente do Minski Tasks: listas e tarefas."""

from datetime import UTC, datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Unicode
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NOME_LISTA_MAX = 60
TITULO_TAREFA_MAX = 200


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)


def agora_utc() -> datetime:
    """Instante atual em UTC, sem fuso, como o SQLite o devolve na leitura."""
    return datetime.now(UTC).replace(tzinfo=None)


class Lista(db.Model):
    __tablename__ = "listas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(Unicode(NOME_LISTA_MAX), nullable=False)
    criada_em: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=agora_utc
    )

    tarefas: Mapped[list["Tarefa"]] = relationship(back_populates="lista")


class Tarefa(db.Model):
    __tablename__ = "tarefas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lista_id: Mapped[int] = mapped_column(
        ForeignKey("listas.id"), nullable=False, index=True
    )
    titulo: Mapped[str] = mapped_column(Unicode(TITULO_TAREFA_MAX), nullable=False)
    concluida: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    criada_em: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=agora_utc
    )

    lista: Mapped[Lista] = relationship(back_populates="tarefas")
