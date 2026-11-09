"""AC05: listas, tarefas e conclusões continuam iguais depois de recriar o app.

Prova aprovada em Q6 (pytest sobre o mesmo arquivo SQLite) com acentos e emoji
conforme Q2: a primeira instância é encerrada, o arquivo é lido diretamente e
uma segunda instância, criada pela factory, devolve os mesmos dados pela API.
"""

import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from flask.testing import FlaskClient

from minski import create_app
from minski.models import db

TAREFAS_POR_LISTA: dict[str, list[str]] = {
    "Trabalho 🚀 ação": [
        "Enviar relatório ✅",
        "Revisar orçamento",
        "Ligar para o João",
        "Preparar reunião ☕",
    ],
    "Casa": ["Comprar açaí 🍇", "Lavar a louça", "Pagar a conta de luz"],
    "Estudos 📚": ["Ler o capítulo 3", "Fazer exercícios", "Revisar anotações"],
}
CONCLUIDAS = {
    "Enviar relatório ✅",
    "Ligar para o João",
    "Comprar açaí 🍇",
    "Pagar a conta de luz",
    "Fazer exercícios",
}
ESTADO_ESPERADO = sorted(
    (nome, titulo, titulo in CONCLUIDAS)
    for nome, titulos in TAREFAS_POR_LISTA.items()
    for titulo in titulos
)


def popular_pela_api(cliente: FlaskClient) -> None:
    for nome, titulos in TAREFAS_POR_LISTA.items():
        resposta = cliente.post("/api/lists", json={"nome": nome})
        assert resposta.status_code == 201
        lista_id = resposta.get_json()["id"]
        for titulo in titulos:
            resposta = cliente.post(
                f"/api/lists/{lista_id}/tasks", json={"titulo": titulo}
            )
            assert resposta.status_code == 201
            if titulo in CONCLUIDAS:
                tarefa_id = resposta.get_json()["id"]
                resposta = cliente.patch(
                    f"/api/tasks/{tarefa_id}", json={"concluida": True}
                )
                assert resposta.status_code == 200


def ler_pela_api(cliente: FlaskClient) -> dict[str, Any]:
    """Respostas completas de GET /api/lists e de GET das tarefas de cada lista."""
    listas = cliente.get("/api/lists").get_json()
    tarefas = {
        lista["id"]: cliente.get(f"/api/lists/{lista['id']}/tasks").get_json()
        for lista in listas
    }
    return {"listas": listas, "tarefas": tarefas}


def estado_resumido(leitura: dict[str, Any]) -> list[tuple[str, str, bool]]:
    """(nome da lista, título, concluída) conferindo o lista_id de cada tarefa."""
    estado = []
    for lista in leitura["listas"]:
        for tarefa in leitura["tarefas"][lista["id"]]:
            assert tarefa["lista_id"] == lista["id"]
            estado.append((lista["nome"], tarefa["titulo"], tarefa["concluida"]))
    return sorted(estado)


def ler_direto_do_arquivo(caminho: Path) -> list[tuple[str, str, bool]]:
    with closing(sqlite3.connect(caminho)) as conexao:
        linhas = conexao.execute(
            "SELECT l.nome, t.titulo, t.concluida"
            " FROM tarefas AS t JOIN listas AS l ON l.id = t.lista_id"
        ).fetchall()
    return sorted((nome, titulo, bool(concluida)) for nome, titulo, concluida in linhas)


def caminho_do_engine() -> Path:
    return Path(db.engine.url.database).resolve()


def test_listas_tarefas_e_conclusoes_sobrevivem_a_recriacao_do_app(
    db_path: Path,
) -> None:
    primeiro = create_app()
    popular_pela_api(primeiro.test_client())
    antes = ler_pela_api(primeiro.test_client())
    with primeiro.app_context():
        assert caminho_do_engine() == db_path.resolve()
        db.engine.dispose()
    del primeiro

    assert len(antes["listas"]) == 3
    assert sum(len(tarefas) for tarefas in antes["tarefas"].values()) == 10
    assert estado_resumido(antes) == ESTADO_ESPERADO
    assert sum(concluida for _, _, concluida in ESTADO_ESPERADO) == 5

    # Sem nenhuma instância viva, os dados já estão no arquivo SQLite.
    assert db_path.is_file()
    assert ler_direto_do_arquivo(db_path) == ESTADO_ESPERADO

    segundo = create_app()
    with segundo.app_context():
        assert caminho_do_engine() == db_path.resolve()
    depois = ler_pela_api(segundo.test_client())

    assert estado_resumido(depois) == ESTADO_ESPERADO
    assert depois == antes
