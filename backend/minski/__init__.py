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
    error_messages: ClassVar[dict] = {"unknown": "Campo não permitido."}


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
        msg = "Deve ser verdadeiro ou falso."
        super().__init__(error_messages={"null": msg, "invalid": msg}, **kwargs)

    def _deserialize(self, value, attr, data, **kwargs):
        if not isinstance(value, bool):
            raise self.make_error("invalid")
        return value


class Ordem(Base):
    ids = fields.List(fields.Raw(), required=True)


def falhar(status, corpo):
    abort(make_response(corpo, status))


def carregar(schema, **mensagens):
    """Valida o corpo JSON com `schema`; 400 {"erros": {campo: mensagem}} se falhar."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        falhar(400, {"erros": {"corpo": "Envie um JSON válido."}})
    try:
        return schema.load(dados)
    except ValidationError as e:
        falhar(400, {"erros": {
            campo: mensagens.get(campo) or (msgs[0] if isinstance(msgs, list) else str(msgs))
            for campo, msgs in e.messages.items()
        }})


def ler_ordem(atuais, mensagem):
    """ids do corpo, exigindo exatamente o conjunto `atuais`, sem repetição."""
    ids = carregar(Ordem(), ids=mensagem)["ids"]
    if any(type(i) is not int for i in ids) or len(ids) != len(set(ids)) or set(ids) != atuais:
        falhar(400, {"erros": {"ids": mensagem}})
    return ids


def create_app(config=None):
    # O futuro frontend (vite build) é servido pelo próprio monólito.
    app = Flask(
        __name__,
        instance_relative_config=True,
        static_folder=str(FRONTEND_DIST),
        static_url_path="",
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///minski.db"  # em instance/
    app.config.update(config or {})
    db.init_app(app)

    from minski import listas, tarefas

    app.register_blueprint(listas.bp)
    app.register_blueprint(tarefas.bp)

    with app.app_context():
        # ponytail: create_all só cria o que falta; Flask-Migrate na 1ª mudança de schema.
        db.create_all()

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    return app
