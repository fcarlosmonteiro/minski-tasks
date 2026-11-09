from pathlib import Path

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from minski import CAMINHO_PADRAO_BANCO, caminho_do_banco, create_app
from minski.models import Lista, Tarefa, db


def test_caminho_padrao_e_backend_minski_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MINSKI_DB_PATH", raising=False)

    assert caminho_do_banco() == CAMINHO_PADRAO_BANCO
    assert CAMINHO_PADRAO_BANCO.name == "minski.db"
    assert CAMINHO_PADRAO_BANCO.parent.name == "backend"


def test_caminho_vem_de_minski_db_path(db_path: Path) -> None:
    assert caminho_do_banco() == db_path


def test_create_app_cria_schema_no_arquivo_indicado(db_path: Path) -> None:
    app = create_app()

    assert db_path.is_file()
    with app.app_context():
        inspetor = inspect(db.engine)
        assert set(inspetor.get_table_names()) == {"listas", "tarefas"}

        colunas_lista = {c["name"]: c for c in inspetor.get_columns("listas")}
        assert set(colunas_lista) == {"id", "nome", "criada_em"}

        colunas_tarefa = {c["name"]: c for c in inspetor.get_columns("tarefas")}
        assert set(colunas_tarefa) == {
            "id",
            "lista_id",
            "titulo",
            "concluida",
            "criada_em",
        }
        assert colunas_tarefa["lista_id"]["nullable"] is False

        (chave,) = inspetor.get_foreign_keys("tarefas")
        assert chave["constrained_columns"] == ["lista_id"]
        assert chave["referred_table"] == "listas"
        assert chave["referred_columns"] == ["id"]


def test_lista_e_tarefa_persistem_em_nova_instancia(db_path: Path) -> None:
    nome = "Trabalho ✨ ação"
    titulo = "Enviar relatório 🚀"

    primeira = create_app()
    with primeira.app_context():
        lista = Lista(nome=nome)
        db.session.add(lista)
        db.session.flush()
        db.session.add_all(
            [
                Tarefa(lista_id=lista.id, titulo=titulo),
                Tarefa(lista_id=lista.id, titulo="Revisar café", concluida=True),
            ]
        )
        db.session.commit()
        db.engine.dispose()

    segunda = create_app()
    with segunda.app_context():
        (lista,) = db.session.scalars(db.select(Lista)).all()
        assert lista.nome == nome
        assert lista.criada_em is not None

        tarefas = {t.titulo: t for t in lista.tarefas}
        assert set(tarefas) == {titulo, "Revisar café"}
        assert tarefas[titulo].lista_id == lista.id
        assert tarefas[titulo].concluida is False
        assert tarefas[titulo].criada_em is not None
        assert tarefas["Revisar café"].concluida is True


def test_tarefa_exige_lista_existente(db_path: Path) -> None:
    app = create_app()
    with app.app_context():
        db.session.add(Tarefa(lista_id=999, titulo="Órfã"))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        db.session.add(Tarefa(titulo="Sem lista"))
        with pytest.raises(IntegrityError):
            db.session.commit()
