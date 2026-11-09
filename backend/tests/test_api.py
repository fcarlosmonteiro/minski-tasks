"""Testes de integração da API JSON com o app Flask e SQLite temporário."""

from pathlib import Path
from typing import Any

import pytest
from flask.testing import FlaskClient

from minski import create_app
from minski.models import db


@pytest.fixture
def cliente(db_path: Path) -> FlaskClient:
    return create_app().test_client()


def criar_lista(cliente: FlaskClient, nome: Any) -> Any:
    return cliente.post("/api/lists", json={"nome": nome})


def criar_tarefa(cliente: FlaskClient, lista_id: int, titulo: Any) -> Any:
    return cliente.post(f"/api/lists/{lista_id}/tasks", json={"titulo": titulo})


def erro(campo: str | None, mensagem: str) -> dict[str, Any]:
    return {"erro": {"campo": campo, "mensagem": mensagem}}


def test_cria_lista_e_a_devolve_na_colecao(cliente: FlaskClient) -> None:
    resposta = criar_lista(cliente, "Trabalho")

    assert resposta.status_code == 201
    lista = resposta.get_json()
    assert lista["nome"] == "Trabalho"
    assert isinstance(lista["id"], int)
    assert lista["criada_em"]
    assert cliente.get("/api/lists").get_json() == [lista]


def test_apara_nome_antes_de_gravar_e_devolver(cliente: FlaskClient) -> None:
    resposta = criar_lista(cliente, "  \tTrabalho  ")

    assert resposta.status_code == 201
    assert resposta.get_json()["nome"] == "Trabalho"
    assert [lista["nome"] for lista in cliente.get("/api/lists").get_json()] == [
        "Trabalho"
    ]


@pytest.mark.parametrize(
    "repetido", ["Trabalho", "trabalho", "TRABALHO", "  tRaBaLhO  ", "\ttrabalho\n"]
)
def test_recusa_nome_duplicado_ignorando_caixa_e_pontas(
    cliente: FlaskClient, repetido: str
) -> None:
    assert criar_lista(cliente, " Trabalho ").status_code == 201

    resposta = criar_lista(cliente, repetido)

    assert resposta.status_code == 409
    assert resposta.get_json() == erro("nome", "Já existe uma lista com esse nome")
    assert len(cliente.get("/api/lists").get_json()) == 1


def test_duplicidade_sem_caixa_vale_para_acentos(cliente: FlaskClient) -> None:
    assert criar_lista(cliente, "Ação").status_code == 201

    assert criar_lista(cliente, "AÇÃO").status_code == 409
    assert criar_lista(cliente, "Acao").status_code == 201


@pytest.mark.parametrize(
    ("campo", "valor", "mensagem"),
    [
        ("nome", "", "O nome é obrigatório."),
        ("nome", "   ", "O nome é obrigatório."),
        ("nome", "a" * 61, "O nome deve possuir no máximo 60 caracteres."),
        ("titulo", "", "O título é obrigatório."),
        ("titulo", " \t ", "O título é obrigatório."),
        ("titulo", "a" * 201, "O título deve possuir no máximo 200 caracteres."),
    ],
)
def test_recusa_nome_e_titulo_invalidos_com_mensagem_no_campo(
    cliente: FlaskClient, campo: str, valor: str, mensagem: str
) -> None:
    lista_id = criar_lista(cliente, "Trabalho").get_json()["id"]

    if campo == "nome":
        resposta = criar_lista(cliente, valor)
    else:
        resposta = criar_tarefa(cliente, lista_id, valor)

    assert resposta.status_code == 400
    assert resposta.get_json() == erro(campo, mensagem)
    assert len(cliente.get("/api/lists").get_json()) == 1
    assert cliente.get(f"/api/lists/{lista_id}/tasks").get_json() == []


@pytest.mark.parametrize("corpo", [{}, {"nome": None}, {"nome": 123}])
def test_nome_ausente_ou_nao_texto_e_obrigatorio(
    cliente: FlaskClient, corpo: dict[str, Any]
) -> None:
    resposta = cliente.post("/api/lists", json=corpo)

    assert resposta.status_code == 400
    assert resposta.get_json() == erro("nome", "O nome é obrigatório.")


@pytest.mark.parametrize(
    ("valido", "invalido"),
    [
        ("a" * 60, "a" * 61),
        ("🚀" * 60, "🚀" * 61),
        ("é" * 30, "é" * 30 + "x"),
        ("  " + "ç" * 60 + "  ", "ç" * 61),
    ],
)
def test_limite_do_nome_conta_pontos_de_codigo(
    cliente: FlaskClient, valido: str, invalido: str
) -> None:
    aceita = criar_lista(cliente, valido)
    recusa = criar_lista(cliente, invalido)

    assert aceita.status_code == 201
    assert aceita.get_json()["nome"] == valido.strip()
    assert recusa.status_code == 400
    assert recusa.get_json() == erro(
        "nome", "O nome deve possuir no máximo 60 caracteres."
    )


@pytest.mark.parametrize(
    ("valido", "invalido"),
    [
        ("a" * 200, "a" * 201),
        ("📝" * 200, "📝" * 201),
        ("é" * 100, "é" * 100 + "x"),
        (" " + "ã" * 200 + " ", "ã" * 201),
    ],
)
def test_limite_do_titulo_conta_pontos_de_codigo(
    cliente: FlaskClient, valido: str, invalido: str
) -> None:
    lista_id = criar_lista(cliente, "Trabalho").get_json()["id"]

    aceita = criar_tarefa(cliente, lista_id, valido)
    recusa = criar_tarefa(cliente, lista_id, invalido)

    assert aceita.status_code == 201
    assert aceita.get_json()["titulo"] == valido.strip()
    assert recusa.status_code == 400
    assert recusa.get_json() == erro(
        "titulo", "O título deve possuir no máximo 200 caracteres."
    )


def test_preserva_acentos_e_emoji_inclusive_apos_reinicio(db_path: Path) -> None:
    nome = "Viagem ✈️ à Bahia 🌴 — coração"
    titulo = "  Comprar protetor ☀️ e açaí 👨‍👩‍👧  "

    primeiro = create_app()
    cliente = primeiro.test_client()
    lista = criar_lista(cliente, nome).get_json()
    tarefa = criar_tarefa(cliente, lista["id"], titulo).get_json()
    assert lista["nome"] == nome
    assert tarefa["titulo"] == titulo.strip()
    with primeiro.app_context():
        db.engine.dispose()

    cliente = create_app().test_client()
    assert cliente.get("/api/lists").get_json() == [lista]
    assert cliente.get(f"/api/lists/{lista['id']}/tasks").get_json() == [tarefa]


def test_cria_tarefa_pendente_ligada_a_lista(cliente: FlaskClient) -> None:
    trabalho = criar_lista(cliente, "Trabalho").get_json()["id"]
    casa = criar_lista(cliente, "Casa").get_json()["id"]

    resposta = criar_tarefa(cliente, trabalho, "  Enviar relatório ")

    assert resposta.status_code == 201
    tarefa = resposta.get_json()
    assert tarefa["titulo"] == "Enviar relatório"
    assert tarefa["lista_id"] == trabalho
    assert tarefa["concluida"] is False
    assert tarefa["criada_em"]

    tarefas = cliente.get(f"/api/lists/{trabalho}/tasks").get_json()
    pendentes = [t for t in tarefas if not t["concluida"]]
    assert tarefa in pendentes
    assert cliente.get(f"/api/lists/{casa}/tasks").get_json() == []


def test_lista_sem_tarefas_devolve_colecao_vazia(cliente: FlaskClient) -> None:
    lista_id = criar_lista(cliente, "Vazia").get_json()["id"]

    resposta = cliente.get(f"/api/lists/{lista_id}/tasks")

    assert resposta.status_code == 200
    assert resposta.get_json() == []


def test_patch_marca_e_desmarca_concluida(cliente: FlaskClient) -> None:
    lista_id = criar_lista(cliente, "Trabalho").get_json()["id"]
    tarefa = criar_tarefa(cliente, lista_id, "Enviar relatório").get_json()
    url = f"/api/tasks/{tarefa['id']}"

    for valor in (True, False):
        resposta = cliente.patch(url, json={"concluida": valor})

        assert resposta.status_code == 200
        assert resposta.get_json() == {**tarefa, "concluida": valor}
        (gravada,) = cliente.get(f"/api/lists/{lista_id}/tasks").get_json()
        assert gravada["concluida"] is valor


@pytest.mark.parametrize(
    ("corpo", "campo", "mensagem"),
    [
        ({}, "concluida", "O campo concluida deve ser true ou false."),
        (
            {"concluida": "true"},
            "concluida",
            "O campo concluida deve ser true ou false.",
        ),
        ({"concluida": 1}, "concluida", "O campo concluida deve ser true ou false."),
        (
            {"concluida": True, "titulo": "Outro"},
            "titulo",
            "Somente o campo concluida pode ser alterado.",
        ),
        (
            {"concluida": True, "lista_id": 2},
            "lista_id",
            "Somente o campo concluida pode ser alterado.",
        ),
    ],
)
def test_patch_aceita_somente_concluida_booleana(
    cliente: FlaskClient, corpo: dict[str, Any], campo: str, mensagem: str
) -> None:
    lista_id = criar_lista(cliente, "Trabalho").get_json()["id"]
    criar_lista(cliente, "Casa")
    tarefa = criar_tarefa(cliente, lista_id, "Enviar relatório").get_json()

    resposta = cliente.patch(f"/api/tasks/{tarefa['id']}", json=corpo)

    assert resposta.status_code == 400
    assert resposta.get_json() == erro(campo, mensagem)
    assert cliente.get(f"/api/lists/{lista_id}/tasks").get_json() == [tarefa]


def test_recursos_inexistentes_devolvem_404_no_mesmo_formato(
    cliente: FlaskClient,
) -> None:
    lista_inexistente = erro(None, "Lista não encontrada.")

    resposta = cliente.get("/api/lists/999/tasks")
    assert resposta.status_code == 404
    assert resposta.get_json() == lista_inexistente

    resposta = criar_tarefa(cliente, 999, "Órfã")
    assert resposta.status_code == 404
    assert resposta.get_json() == lista_inexistente

    resposta = cliente.patch("/api/tasks/999", json={"concluida": True})
    assert resposta.status_code == 404
    assert resposta.get_json() == erro(None, "Tarefa não encontrada.")
