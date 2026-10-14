from pathlib import Path

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from marshmallow import fields
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@event.listens_for(Engine, "connect")
def _ligar_foreign_keys(dbapi_conn, _record):
    # SQLite ignora FKs (e o ON DELETE CASCADE) sem este PRAGMA, por conexão.
    dbapi_conn.execute("PRAGMA foreign_keys=ON")


class Texto(fields.String):
    """String gravada sem espaços nas pontas."""

    def _deserialize(self, value, attr, data, **kwargs):
        return super()._deserialize(value, attr, data, **kwargs).strip()


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

    from minski import listas, tarefas  # noqa: F401  registra os modelos

    with app.app_context():
        # ponytail: create_all só cria o que falta; Flask-Migrate na 1ª mudança de schema.
        db.create_all()

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    return app
