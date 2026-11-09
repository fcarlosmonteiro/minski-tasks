"""API JSON do Minski Tasks: listas, tarefas e conclusão."""

from typing import Any

from flask import Blueprint, Response, jsonify, request

from minski.models import NOME_LISTA_MAX, TITULO_TAREFA_MAX, Lista, Tarefa, db

api = Blueprint("api", __name__, url_prefix="/api")

NOME_OBRIGATORIO = "O nome é obrigatório."
NOME_LONGO = f"O nome deve possuir no máximo {NOME_LISTA_MAX} caracteres."
NOME_DUPLICADO = "Já existe uma lista com esse nome"
TITULO_OBRIGATORIO = "O título é obrigatório."
TITULO_LONGO = f"O título deve possuir no máximo {TITULO_TAREFA_MAX} caracteres."
CONCLUIDA_INVALIDA = "O campo concluida deve ser true ou false."
CAMPO_NAO_PERMITIDO = "Somente o campo concluida pode ser alterado."
LISTA_NAO_ENCONTRADA = "Lista não encontrada."
TAREFA_NAO_ENCONTRADA = "Tarefa não encontrada."


class ErroDeValidacao(Exception):
    """Entrada recusada: o campo afetado e a mensagem exibida ao usuário."""

    def __init__(self, campo: str, mensagem: str, status: int = 400) -> None:
        super().__init__(mensagem)
        self.campo = campo
        self.mensagem = mensagem
        self.status = status


def resposta_de_erro(
    mensagem: str, status: int, campo: str | None = None
) -> tuple[Response, int]:
    return jsonify({"erro": {"campo": campo, "mensagem": mensagem}}), status


@api.errorhandler(ErroDeValidacao)
def tratar_erro_de_validacao(erro: ErroDeValidacao) -> tuple[Response, int]:
    return resposta_de_erro(erro.mensagem, erro.status, erro.campo)


def corpo_json() -> dict[str, Any]:
    corpo = request.get_json(silent=True)
    return corpo if isinstance(corpo, dict) else {}


def texto_aparado(
    valor: object, campo: str, maximo: int, obrigatorio: str, longo: str
) -> str:
    """Apara as pontas e valida tamanho contando pontos de código Unicode."""
    texto = valor.strip() if isinstance(valor, str) else ""
    if not texto:
        raise ErroDeValidacao(campo, obrigatorio)
    if len(texto) > maximo:
        raise ErroDeValidacao(campo, longo)
    return texto


def nome_ja_existe(nome: str) -> bool:
    chave = nome.casefold()
    nomes = db.session.scalars(db.select(Lista.nome))
    return any(existente.strip().casefold() == chave for existente in nomes)


def lista_para_json(lista: Lista) -> dict[str, Any]:
    return {
        "id": lista.id,
        "nome": lista.nome,
        "criada_em": lista.criada_em.isoformat(),
    }


def tarefa_para_json(tarefa: Tarefa) -> dict[str, Any]:
    return {
        "id": tarefa.id,
        "lista_id": tarefa.lista_id,
        "titulo": tarefa.titulo,
        "concluida": tarefa.concluida,
        "criada_em": tarefa.criada_em.isoformat(),
    }


@api.get("/lists")
def listar_listas() -> Response:
    listas = db.session.scalars(db.select(Lista).order_by(Lista.id))
    return jsonify([lista_para_json(lista) for lista in listas])


@api.post("/lists")
def criar_lista() -> tuple[Response, int]:
    nome = texto_aparado(
        corpo_json().get("nome"), "nome", NOME_LISTA_MAX, NOME_OBRIGATORIO, NOME_LONGO
    )
    if nome_ja_existe(nome):
        raise ErroDeValidacao("nome", NOME_DUPLICADO, status=409)

    lista = Lista(nome=nome)
    db.session.add(lista)
    db.session.commit()
    return jsonify(lista_para_json(lista)), 201


@api.get("/lists/<int:lista_id>/tasks")
def listar_tarefas(lista_id: int) -> Response | tuple[Response, int]:
    if db.session.get(Lista, lista_id) is None:
        return resposta_de_erro(LISTA_NAO_ENCONTRADA, 404)

    tarefas = db.session.scalars(
        db.select(Tarefa).where(Tarefa.lista_id == lista_id).order_by(Tarefa.id)
    )
    return jsonify([tarefa_para_json(tarefa) for tarefa in tarefas])


@api.post("/lists/<int:lista_id>/tasks")
def criar_tarefa(lista_id: int) -> tuple[Response, int]:
    if db.session.get(Lista, lista_id) is None:
        return resposta_de_erro(LISTA_NAO_ENCONTRADA, 404)

    titulo = texto_aparado(
        corpo_json().get("titulo"),
        "titulo",
        TITULO_TAREFA_MAX,
        TITULO_OBRIGATORIO,
        TITULO_LONGO,
    )
    tarefa = Tarefa(lista_id=lista_id, titulo=titulo, concluida=False)
    db.session.add(tarefa)
    db.session.commit()
    return jsonify(tarefa_para_json(tarefa)), 201


@api.patch("/tasks/<int:tarefa_id>")
def alterar_conclusao(tarefa_id: int) -> Response | tuple[Response, int]:
    tarefa = db.session.get(Tarefa, tarefa_id)
    if tarefa is None:
        return resposta_de_erro(TAREFA_NAO_ENCONTRADA, 404)

    corpo = corpo_json()
    extras = sorted(set(corpo) - {"concluida"})
    if extras:
        raise ErroDeValidacao(extras[0], CAMPO_NAO_PERMITIDO)
    concluida = corpo.get("concluida")
    if not isinstance(concluida, bool):
        raise ErroDeValidacao("concluida", CONCLUIDA_INVALIDA)

    tarefa.concluida = concluida
    db.session.commit()
    return jsonify(tarefa_para_json(tarefa))
