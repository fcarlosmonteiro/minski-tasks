import os
from pathlib import Path
from typing import ClassVar

from flask import Flask, abort, make_response, request
from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, ValidationError, fields, validate
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
DATA_HORA = "%Y-%m-%dT%H:%M:%SZ"  # gravamos sempre em UTC


@event.listens_for(Engine, "connect")
def _ligar_foreign_keys(dbapi_conn, _record):
    # SQLite ignora FKs (e o ON DELETE CASCADE) sem este PRAGMA, por conexão.
    dbapi_conn.execute("PRAGMA foreign_keys=ON")


class Base(Schema):
    NAO_PERMITIDO = "Campo não permitido."
    error_messages: ClassVar[dict] = {"unknown": NAO_PERMITIDO}


class Texto(fields.String):
    """Texto obrigatório gravado sem espaços nas pontas; limite em code points."""

    def __init__(self, vazio, longo, maximo, **kwargs):
        mensagens = {"required": vazio, "null": vazio, "invalid": vazio}
        limites = [validate.Length(min=1, error=vazio), validate.Length(max=maximo, error=longo)]
        super().__init__(required=True, error_messages=mensagens, validate=limites, **kwargs)

    def _deserialize(self, value, attr, data, **kwargs):
        return super()._deserialize(value, attr, data, **kwargs).strip()


class Booleano(fields.Field):
    """Só aceita true/false do JSON (fields.Boolean aceitaria "sim", 1, "0"...)."""

    def __init__(self, **kwargs):
        msg = "Informe concluida como verdadeiro ou falso."
        mensagens = {"required": msg, "null": msg, "invalid": msg}
        super().__init__(error_messages=mensagens, **kwargs)

    def _deserialize(self, value, attr, data, **kwargs):
        if not isinstance(value, bool):
            raise self.make_error("invalid")
        return value


class Ordem(Base):
    ids = fields.List(fields.Raw(), required=True)


CODIGOS = {400: "VALIDACAO", 404: "NAO_ENCONTRADO", 409: "DUPLICADO"}


def corpo_de_erro(status, mensagem):
    return {"erro": {"codigo": CODIGOS[status], "mensagem": mensagem}}


def falhar(status, mensagem):
    abort(make_response(corpo_de_erro(status, mensagem), status))


def carregar(schema, mensagem=None):
    """Valida o corpo JSON com `schema`; 400 VALIDACAO com a primeira mensagem se falhar."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        falhar(400, "Envie um JSON válido.")
    try:
        return schema.load(dados)
    except ValidationError as e:
        if mensagem:
            falhar(400, mensagem)
        campo, msgs = next(iter(e.messages.items()))
        texto = msgs[0] if isinstance(msgs, list) else str(msgs)
        falhar(400, f"{texto} ({campo})" if texto == Base.NAO_PERMITIDO else texto)


def ler_ordem(atuais, mensagem):
    """ids do corpo, exigindo exatamente o conjunto `atuais`, sem repetição."""
    ids = carregar(Ordem(), mensagem)["ids"]
    if any(type(i) is not int for i in ids) or len(ids) != len(set(ids)) or set(ids) != atuais:
        falhar(400, mensagem)
    return ids


def create_app(config=None):
    # O futuro frontend (vite build) é servido pelo próprio monólito.
    app = Flask(
        __name__,
        instance_relative_config=True,
        static_folder=str(FRONTEND_DIST),
        static_url_path="",
    )
    # Caminho relativo vai para instance/; no Docker, MINSKI_DB_PATH=/data/minski.db.
    caminho = os.environ.get("MINSKI_DB_PATH", "minski.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{caminho}"
    app.config.update(config or {})
    db.init_app(app)

    from minski import listas, tarefas

    app.register_blueprint(listas.bp)
    app.register_blueprint(tarefas.bp)

    with app.app_context():
        # ponytail: create_all só cria o que falta; Flask-Migrate na 1ª mudança de schema.
        db.create_all()

    @app.errorhandler(404)
    def nao_encontrado(e):
        # Rota inexistente sob /api também segue o formato de erro da Spec.
        if request.path.startswith("/api/"):
            return corpo_de_erro(404, "Recurso não encontrado."), 404
        return e

    @app.get("/")
    @app.get("/listas")  # rota do React Router aberta direto pelo endereço
    def index():
        return app.send_static_file("index.html")

    return app
