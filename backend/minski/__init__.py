"""Factory da aplicação Flask do Minski Tasks."""

import os
import sqlite3
from pathlib import Path

from flask import Flask
from sqlalchemy import event
from sqlalchemy.engine import URL

from minski.api import api
from minski.models import db

BACKEND_DIR = Path(__file__).resolve().parent.parent
CAMINHO_PADRAO_BANCO = BACKEND_DIR / "minski.db"


def caminho_do_banco() -> Path:
    """Arquivo SQLite: MINSKI_DB_PATH quando definido, senão backend/minski.db."""
    valor = os.environ.get("MINSKI_DB_PATH", "").strip()
    if not valor:
        return CAMINHO_PADRAO_BANCO
    return Path(valor).expanduser().resolve()


def _ativar_chaves_estrangeiras(conexao: sqlite3.Connection, _registro: object) -> None:
    cursor = conexao.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = URL.create(
        "sqlite", database=str(caminho_do_banco())
    ).render_as_string()

    db.init_app(app)
    app.register_blueprint(api)
    with app.app_context():
        event.listen(db.engine, "connect", _ativar_chaves_estrangeiras)
        db.create_all()

    return app
