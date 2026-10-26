import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from minski import create_app

DATA = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
INFORME_NOME = {"erros": {"nome": "Informe o nome da lista."}}
INFORME_TITULO = {"erros": {"titulo": "Informe o título da tarefa."}}
NOME_LONGO = {"erros": {"nome": "O nome da lista pode ter no máximo 60 caracteres."}}
TITULO_LONGO = {"erros": {"titulo": "O título da tarefa pode ter no máximo 200 caracteres."}}
DUPLICADO = {"erros": {"nome": "Já existe uma lista com esse nome."}}
NAO_BOOL = {"erros": {"concluida": "Deve ser verdadeiro ou falso."}}
ORDEM_LISTAS = {"erros": {"ids": "A lista de ids deve conter exatamente as listas atuais."}}
ORDEM_TAREFAS = {
    "erros": {"ids": "A lista de ids deve conter exatamente as tarefas pendentes desta lista."}
}
SEM_LISTA = {"erro": "Lista não encontrada."}
SEM_TAREFA = {"erro": "Tarefa não encontrada."}


@pytest.fixture
def api(tmp_path):
    # Sem app_context aberto: cada requisição usa a própria sessão, como em produção.
    return create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'api.db'}"}).test_client()


def ok(resposta, status=200):
    assert resposta.status_code == status, resposta.get_json()
    return resposta.get_json()


def nova_lista(api, nome="Trabalho"):
    return ok(api.post("/api/listas", json={"nome": nome}), 201)


def nova_tarefa(api, lista_id, titulo="Tarefa"):
    return ok(api.post(f"/api/listas/{lista_id}/tarefas", json={"titulo": titulo}), 201)


def tarefas(api, lista_id):
    return ok(api.get(f"/api/listas/{lista_id}/tarefas"))


def erro(resposta, status=400):
    assert resposta.status_code == status
    return resposta.get_json()


# --- listas -----------------------------------------------------------------


def test_criar_lista_grava_sem_espacos_e_vai_para_o_fim(api):
    a = nova_lista(api, "  Trabalho  ")
    b = nova_lista(api, "Pessoal")
    assert a == {"id": a["id"], "nome": "Trabalho", "ordem": 0, "pendentes": 0}
    assert b["ordem"] == 1


def test_listar_listas_por_ordem_com_contagem_de_pendentes(api):
    a, b = nova_lista(api, "A"), nova_lista(api, "B")
    nova_tarefa(api, b["id"])
    t = nova_tarefa(api, b["id"])
    ok(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": True}))
    ok(api.put("/api/listas/ordem", json={"ids": [b["id"], a["id"]]}), 204)

    resposta = ok(api.get("/api/listas"))
    assert [(x["nome"], x["ordem"], x["pendentes"]) for x in resposta] == [
        ("B", 0, 1), ("A", 1, 0)
    ]


@pytest.mark.parametrize("metodo", ["post", "patch"])
@pytest.mark.parametrize(
    "corpo,esperado",
    [
        ({}, INFORME_NOME),
        ({"nome": ""}, INFORME_NOME),
        ({"nome": " \t\n "}, INFORME_NOME),
        ({"nome": None}, INFORME_NOME),
        ({"nome": 123}, INFORME_NOME),
        ({"nome": "x" * 61}, NOME_LONGO),
        ({"nome": "🎉" * 61}, NOME_LONGO),
        ({"nome": "ok", "ordem": 3}, {"erros": {"ordem": "Campo não permitido."}}),
        ({"nome": "ok", "cor": "azul"}, {"erros": {"cor": "Campo não permitido."}}),
    ],
)
def test_nome_invalido_responde_400_por_campo(api, metodo, corpo, esperado):
    url = "/api/listas" if metodo == "post" else f"/api/listas/{nova_lista(api)['id']}"
    assert erro(getattr(api, metodo)(url, json=corpo)) == esperado


@pytest.mark.parametrize("url", ["/api/listas", "/api/listas/1"])
@pytest.mark.parametrize("dados", ["nao e json", "[1, 2]", ""])
def test_corpo_que_nao_e_objeto_json_responde_400(api, url, dados):
    nova_lista(api)
    metodo = api.post if url == "/api/listas" else api.patch
    resposta = metodo(url, data=dados, content_type="application/json")
    assert erro(resposta) == {"erros": {"corpo": "Envie um JSON válido."}}


def test_nome_aceita_limite_exato_e_unicode(api):
    assert nova_lista(api, "x" * 60)["nome"] == "x" * 60
    assert nova_lista(api, "🎉" * 60)["nome"] == "🎉" * 60
    assert nova_lista(api, " Universidade 📚 ")["nome"] == "Universidade 📚"


@pytest.mark.parametrize("repetido", ["Trabalho", "trabalho", "  TRABALHO  ", "TrAbAlHo"])
def test_nome_duplicado_sem_diferenciar_maiusculas(api, repetido):
    nova_lista(api, "Trabalho")
    assert erro(api.post("/api/listas", json={"nome": repetido})) == DUPLICADO


def test_nome_duplicado_com_acentos(api):
    nova_lista(api, "Ação")
    assert erro(api.post("/api/listas", json={"nome": "AÇÃO"})) == DUPLICADO


def test_renomear_lista(api):
    a, b = nova_lista(api, "Trabalho"), nova_lista(api, "Pessoal")
    nova_tarefa(api, a["id"])

    renomeada = ok(api.patch(f"/api/listas/{a['id']}", json={"nome": " Emprego "}))
    assert renomeada == {**a, "nome": "Emprego", "pendentes": 1}
    # mudar só a caixa do próprio nome não conflita com ela mesma
    assert ok(api.patch(f"/api/listas/{a['id']}", json={"nome": "EMPREGO"}))["nome"] == "EMPREGO"
    assert erro(api.patch(f"/api/listas/{b['id']}", json={"nome": "emprego"})) == DUPLICADO


def test_lista_inexistente_responde_404(api):
    assert erro(api.patch("/api/listas/99", json={"nome": "x"}), 404) == SEM_LISTA
    assert erro(api.patch("/api/listas/99", json={"nome": ""}), 404) == SEM_LISTA
    assert erro(api.delete("/api/listas/99"), 404) == SEM_LISTA
    assert erro(api.get("/api/listas/99/tarefas"), 404) == SEM_LISTA
    assert erro(api.post("/api/listas/99/tarefas", json={"titulo": "x"}), 404) == SEM_LISTA
    assert erro(api.put("/api/listas/99/tarefas/ordem", json={"ids": []}), 404) == SEM_LISTA


def test_excluir_lista_apaga_suas_tarefas_em_cascata(api):
    a, b = nova_lista(api, "A"), nova_lista(api, "B")
    t = nova_tarefa(api, a["id"])
    fica = nova_tarefa(api, b["id"])

    resposta = api.delete(f"/api/listas/{a['id']}")
    assert resposta.status_code == 204 and resposta.data == b""
    assert erro(api.patch(f"/api/tarefas/{t['id']}", json={"titulo": "x"}), 404) == SEM_TAREFA
    assert [x["id"] for x in ok(api.get("/api/listas"))] == [b["id"]]
    assert tarefas(api, b["id"]) == [fica]


def test_reordenar_listas(api):
    a, b, c = (nova_lista(api, n)["id"] for n in "ABC")
    resposta = api.put("/api/listas/ordem", json={"ids": [c, a, b]})
    assert resposta.status_code == 204 and resposta.data == b""
    assert [x["nome"] for x in ok(api.get("/api/listas"))] == ["C", "A", "B"]
    assert nova_lista(api, "D")["ordem"] == 3


@pytest.mark.parametrize(
    "ids",
    ["faltando", "sobrando", "repetido", "estranho", "texto", "booleano", "nao_lista", "ausente"],
)
def test_reordenar_listas_com_ids_errados_responde_400(api, ids):
    a, b = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    corpo = {
        "faltando": {"ids": [a]},
        "sobrando": {"ids": [a, b, 99]},
        "repetido": {"ids": [a, b, a]},
        "estranho": {"ids": [a, 99]},
        "texto": {"ids": [str(a), str(b)]},
        "booleano": {"ids": [True, b]} if a == 1 else {"ids": [a, True]},
        "nao_lista": {"ids": a},
        "ausente": {},
    }[ids]
    assert erro(api.put("/api/listas/ordem", json=corpo)) == ORDEM_LISTAS
    assert [x["nome"] for x in ok(api.get("/api/listas"))] == ["A", "B"]


# --- tarefas ----------------------------------------------------------------


def test_criar_tarefa(api):
    lista = nova_lista(api)
    t = nova_tarefa(api, lista["id"], "  Ler capítulo 3 📖 ")
    assert t == {"id": t["id"], "lista_id": lista["id"], "titulo": "Ler capítulo 3 📖",
                 "concluida": False, "ordem": 0,
                 "concluida_em": None}
    assert nova_tarefa(api, lista["id"])["ordem"] == 1


@pytest.mark.parametrize("metodo", ["post", "patch"])
@pytest.mark.parametrize(
    "corpo,esperado",
    [
        ({"titulo": ""}, INFORME_TITULO),
        ({"titulo": "   "}, INFORME_TITULO),
        ({"titulo": None}, INFORME_TITULO),
        ({"titulo": ["x"]}, INFORME_TITULO),
        ({"titulo": "x" * 201}, TITULO_LONGO),
        ({"titulo": "🚀" * 201}, TITULO_LONGO),
        ({"titulo": "ok", "lista_id": 2}, {"erros": {"lista_id": "Campo não permitido."}}),
    ],
)
def test_titulo_invalido_responde_400(api, metodo, corpo, esperado):
    lista = nova_lista(api)
    if metodo == "post":
        resposta = api.post(f"/api/listas/{lista['id']}/tarefas", json=corpo)
    else:
        resposta = api.patch(f"/api/tarefas/{nova_tarefa(api, lista['id'])['id']}", json=corpo)
    assert erro(resposta) == esperado


def test_criar_tarefa_exige_titulo_e_nao_aceita_concluida(api):
    url = f"/api/listas/{nova_lista(api)['id']}/tarefas"
    assert erro(api.post(url, json={})) == INFORME_TITULO
    assert erro(api.post(url, json={"titulo": "x", "concluida": True})) == {
        "erros": {"concluida": "Campo não permitido."}
    }
    assert erro(api.post(url, data="x", content_type="text/plain")) == {
        "erros": {"corpo": "Envie um JSON válido."}
    }


def test_titulo_aceita_limite_exato_e_unicode(api):
    lista_id = nova_lista(api)["id"]
    assert nova_tarefa(api, lista_id, "x" * 200)["titulo"] == "x" * 200
    assert nova_tarefa(api, lista_id, "🚀" * 200)["titulo"] == "🚀" * 200


def test_patch_altera_so_os_campos_enviados(api):
    lista_id = nova_lista(api)["id"]
    t = nova_tarefa(api, lista_id, "Antes")

    t = ok(api.patch(f"/api/tarefas/{t['id']}", json={"titulo": " Depois "}))
    assert (t["titulo"], t["concluida"]) == ("Depois", False)
    t = ok(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": True}))
    assert (t["titulo"], t["concluida"]) == ("Depois", True)
    assert ok(api.patch(f"/api/tarefas/{t['id']}", json={})) == t


@pytest.mark.parametrize("valor", ["true", 1, 0, None, "sim", [True]])
def test_concluida_so_aceita_booleano(api, valor):
    t = nova_tarefa(api, nova_lista(api)["id"])
    assert erro(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": valor})) == NAO_BOOL


def test_concluir_grava_concluida_em_e_cliques_repetidos_nao_alternam(api):
    t = nova_tarefa(api, nova_lista(api)["id"])
    url = f"/api/tarefas/{t['id']}"

    feita = ok(api.patch(url, json={"concluida": True}))
    assert feita["concluida"] is True and DATA.match(feita["concluida_em"])
    for _ in range(3):  # cliques repetidos enviam o mesmo valor: nada muda
        assert ok(api.patch(url, json={"concluida": True})) == feita

    reaberta = ok(api.patch(url, json={"concluida": False}))
    assert reaberta["concluida"] is False and reaberta["concluida_em"] is None
    for _ in range(3):
        assert ok(api.patch(url, json={"concluida": False})) == reaberta


def test_reabrir_manda_a_tarefa_para_o_fim_das_pendentes(api):
    lista_id = nova_lista(api)["id"]
    a, b, c = (nova_tarefa(api, lista_id, n) for n in "abc")
    ok(api.patch(f"/api/tarefas/{a['id']}", json={"concluida": True}))
    ok(api.put(f"/api/listas/{lista_id}/tarefas/ordem", json={"ids": [c["id"], b["id"]]}), 204)

    reaberta = ok(api.patch(f"/api/tarefas/{a['id']}", json={"concluida": False}))
    assert reaberta["ordem"] == 2
    assert [x["titulo"] for x in tarefas(api, lista_id)] == ["c", "b", "a"]


def test_listar_tarefas_pendentes_por_ordem_e_concluidas_mais_recentes_primeiro(api):
    lista_id = nova_lista(api)["id"]
    a, b, _c, d = (nova_tarefa(api, lista_id, n) for n in "abcd")
    for t in (b, d, a):
        ok(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": True}))

    resposta = tarefas(api, lista_id)
    assert [(x["titulo"], x["concluida"]) for x in resposta] == [
        ("c", False), ("a", True), ("d", True), ("b", True)
    ]


def test_tarefas_de_outra_lista_nao_aparecem(api):
    a, b = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    nova_tarefa(api, a, "de A")
    assert tarefas(api, b) == []
    assert nova_tarefa(api, b)["ordem"] == 0


def test_excluir_tarefa(api):
    lista_id = nova_lista(api)["id"]
    t = nova_tarefa(api, lista_id)
    resposta = api.delete(f"/api/tarefas/{t['id']}")
    assert resposta.status_code == 204 and resposta.data == b""
    assert tarefas(api, lista_id) == []
    assert erro(api.delete(f"/api/tarefas/{t['id']}"), 404) == SEM_TAREFA


def test_tarefa_inexistente_responde_404(api):
    assert erro(api.patch("/api/tarefas/99", json={"titulo": "x"}), 404) == SEM_TAREFA
    assert erro(api.patch("/api/tarefas/99", json={"concluida": "x"}), 404) == SEM_TAREFA
    assert erro(api.delete("/api/tarefas/99"), 404) == SEM_TAREFA


def test_reordenar_pendentes(api):
    lista_id = nova_lista(api)["id"]
    a, b, c = (nova_tarefa(api, lista_id, n)["id"] for n in "abc")
    resposta = api.put(f"/api/listas/{lista_id}/tarefas/ordem", json={"ids": [c, a, b]})
    assert resposta.status_code == 204 and resposta.data == b""
    assert [(x["titulo"], x["ordem"]) for x in tarefas(api, lista_id)] == [
        ("c", 0), ("a", 1), ("b", 2)
    ]


@pytest.mark.parametrize(
    "caso", ["faltando", "concluida", "outra_lista", "repetido", "estranho", "texto", "ausente"]
)
def test_reordenar_pendentes_com_ids_errados_responde_400(api, caso):
    lista_id, outra = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    a, b, feita = (nova_tarefa(api, lista_id, n)["id"] for n in "abf")
    de_fora = nova_tarefa(api, outra)["id"]
    ok(api.patch(f"/api/tarefas/{feita}", json={"concluida": True}))
    corpo = {
        "faltando": {"ids": [a]},
        "concluida": {"ids": [a, b, feita]},
        "outra_lista": {"ids": [a, b, de_fora]},
        "repetido": {"ids": [a, b, b]},
        "estranho": {"ids": [a, b, 999]},
        "texto": {"ids": [str(a), str(b)]},
        "ausente": {},
    }[caso]
    url = f"/api/listas/{lista_id}/tarefas/ordem"
    assert erro(api.put(url, json=corpo)) == ORDEM_TAREFAS
    assert [x["titulo"] for x in tarefas(api, lista_id)] == ["a", "b", "f"]


# --- AC06 -------------------------------------------------------------------


def test_dados_persistem_apos_reiniciar_o_processo(tmp_path):
    uri = f"sqlite:///{tmp_path / 'persistente.db'}"
    api = create_app({"SQLALCHEMY_DATABASE_URI": uri}).test_client()
    lista_id = nova_lista(api, "Pessoal ✨")["id"]
    t = nova_tarefa(api, lista_id, "Comprar pão")
    ok(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": True}))
    esperado = tarefas(api, lista_id)

    leitura = (
        "import json; from minski import create_app; "
        f"c = create_app({{'SQLALCHEMY_DATABASE_URI': {uri!r}}}).test_client(); "
        f"print(json.dumps([c.get('/api/listas').json, c.get('/api/listas/{lista_id}/tarefas').json]))"
    )
    saida = subprocess.run(
        [sys.executable, "-c", leitura], cwd=Path(__file__).parents[1],
        capture_output=True, text=True, check=True,
    ).stdout
    listas_lidas, tarefas_lidas = json.loads(saida)
    assert [x["nome"] for x in listas_lidas] == ["Pessoal ✨"]
    assert tarefas_lidas == esperado
