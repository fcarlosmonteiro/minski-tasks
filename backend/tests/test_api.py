import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from minski import create_app

DATA = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def validacao(mensagem):
    return {"erro": {"codigo": "VALIDACAO", "mensagem": mensagem}}


def nao_encontrado(mensagem):
    return {"erro": {"codigo": "NAO_ENCONTRADO", "mensagem": mensagem}}


def duplicado(mensagem):
    return {"erro": {"codigo": "DUPLICADO", "mensagem": mensagem}}


INFORME_NOME = validacao("Informe o nome da lista.")
INFORME_TITULO = validacao("Informe o título da tarefa.")
NOME_LONGO = validacao("O nome da lista pode ter no máximo 60 caracteres.")
TITULO_LONGO = validacao("O título da tarefa pode ter no máximo 200 caracteres.")
JSON_INVALIDO = validacao("Envie um JSON válido.")
NAO_BOOL = validacao("Informe concluida como verdadeiro ou falso.")
LISTA_REPETIDA = duplicado("Já existe uma lista com esse nome.")
TAREFA_REPETIDA = duplicado("Já existe uma tarefa com esse título nesta lista.")
ORDEM_LISTAS = validacao("A ordem enviada está desatualizada: recarregue as listas.")
ORDEM_TAREFAS = validacao(
    "A ordem enviada está desatualizada: recarregue as tarefas desta lista."
)
SEM_LISTA = nao_encontrado("Lista não encontrada.")
SEM_TAREFA = nao_encontrado("Tarefa não encontrada.")


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


def concluir(api, tarefa_id, valor=True):
    return ok(api.patch(f"/api/tarefas/{tarefa_id}", json={"concluida": valor}))


def erro(resposta, status=400):
    assert resposta.status_code == status
    return resposta.get_json()


# --- listas -----------------------------------------------------------------


def test_criar_lista_grava_sem_espacos_e_vai_para_o_fim(api):
    a = nova_lista(api, "  Trabalho  ")
    b = nova_lista(api, "Pessoal")
    assert a == {"id": a["id"], "nome": "Trabalho", "ordem": 0}
    assert b == {"id": b["id"], "nome": "Pessoal", "ordem": 1}


def test_listar_listas_vazio_e_por_ordem(api):
    assert ok(api.get("/api/listas")) == []
    a, b = nova_lista(api, "A"), nova_lista(api, "B")
    assert ok(api.get("/api/listas")) == [a, b]


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
        ({"nome": "  " + "x" * 60 + "  "}, None),  # trim antes de validar: cabe
        ({"nome": "🎉" * 61}, NOME_LONGO),
        ({"nome": "ok", "ordem": 3}, validacao("Campo não permitido. (ordem)")),
        ({"nome": "ok", "cor": "azul"}, validacao("Campo não permitido. (cor)")),
    ],
)
def test_validacao_do_nome(api, metodo, corpo, esperado):
    url = "/api/listas" if metodo == "post" else f"/api/listas/{nova_lista(api, 'Outra')['id']}"
    resposta = getattr(api, metodo)(url, json=corpo)
    if esperado is None:
        assert resposta.status_code in (200, 201) and resposta.json["nome"] == "x" * 60
    else:
        assert erro(resposta) == esperado


@pytest.mark.parametrize("url", ["/api/listas", "/api/listas/1"])
@pytest.mark.parametrize("dados", ["nao e json", "[1, 2]", ""])
def test_corpo_que_nao_e_objeto_json_responde_400(api, url, dados):
    nova_lista(api)
    metodo = api.post if url == "/api/listas" else api.patch
    assert erro(metodo(url, data=dados, content_type="application/json")) == JSON_INVALIDO


def test_nome_aceita_limite_exato_e_unicode(api):
    assert nova_lista(api, "x" * 60)["nome"] == "x" * 60
    assert nova_lista(api, "🎉" * 60)["nome"] == "🎉" * 60
    assert nova_lista(api, " Universidade 📚 ")["nome"] == "Universidade 📚"


@pytest.mark.parametrize("repetido", ["Trabalho", "trabalho", "  TRABALHO  ", "TrAbAlHo"])
def test_nome_duplicado_responde_409(api, repetido):
    nova_lista(api, "Trabalho")
    assert erro(api.post("/api/listas", json={"nome": repetido}), 409) == LISTA_REPETIDA
    assert len(ok(api.get("/api/listas"))) == 1


def test_nome_duplicado_com_acentos(api):
    nova_lista(api, "Ação")
    assert erro(api.post("/api/listas", json={"nome": "AÇÃO"}), 409) == LISTA_REPETIDA


def test_renomear_lista(api):
    a, b = nova_lista(api, "Trabalho"), nova_lista(api, "Pessoal")
    renomeada = ok(api.patch(f"/api/listas/{a['id']}", json={"nome": " Emprego "}))
    assert renomeada == {**a, "nome": "Emprego"}
    assert ok(api.get("/api/listas"))[0]["nome"] == "Emprego"
    # mudar só a caixa do próprio nome não conflita com ela mesma
    assert ok(api.patch(f"/api/listas/{a['id']}", json={"nome": "EMPREGO"}))["nome"] == "EMPREGO"
    assert erro(api.patch(f"/api/listas/{b['id']}", json={"nome": "emprego"}), 409) == (
        LISTA_REPETIDA
    )


def test_lista_inexistente_responde_404(api):
    assert erro(api.patch("/api/listas/99", json={"nome": "x"}), 404) == SEM_LISTA
    assert erro(api.patch("/api/listas/99", json={"nome": ""}), 404) == SEM_LISTA
    assert erro(api.delete("/api/listas/99"), 404) == SEM_LISTA
    assert erro(api.get("/api/listas/99/tarefas"), 404) == SEM_LISTA
    assert erro(api.post("/api/listas/99/tarefas", json={"titulo": "x"}), 404) == SEM_LISTA
    assert erro(api.put("/api/listas/99/tarefas/ordem", json={"ids": []}), 404) == SEM_LISTA


def test_rota_inexistente_sob_api_usa_o_formato_de_erro(api):
    assert erro(api.get("/api/nada"), 404) == nao_encontrado("Recurso não encontrado.")
    assert erro(api.get("/api/listas/abc/tarefas"), 404)["erro"]["codigo"] == "NAO_ENCONTRADO"


def test_excluir_lista_apaga_suas_tarefas_em_cascata(api):
    a, b = nova_lista(api, "A"), nova_lista(api, "B")
    t = nova_tarefa(api, a["id"])
    fica = nova_tarefa(api, b["id"])

    resposta = api.delete(f"/api/listas/{a['id']}")
    assert resposta.status_code == 204 and resposta.data == b""
    assert erro(api.patch(f"/api/tarefas/{t['id']}", json={"concluida": True}), 404) == (
        SEM_TAREFA
    )
    assert ok(api.get("/api/listas")) == [b]
    assert tarefas(api, b["id"]) == {"pendentes": [fica], "concluidas": []}
    assert erro(api.delete(f"/api/listas/{a['id']}"), 404) == SEM_LISTA


def test_reordenar_listas(api):
    a, b, c = (nova_lista(api, n)["id"] for n in "ABC")
    resposta = ok(api.put("/api/listas/ordem", json={"ids": [c, a, b]}))
    assert resposta == ok(api.get("/api/listas"))
    assert [(x["nome"], x["ordem"]) for x in resposta] == [("C", 0), ("A", 1), ("B", 2)]
    assert nova_lista(api, "D")["ordem"] == 3


@pytest.mark.parametrize(
    "ids",
    ["faltando", "sobrando", "repetido", "estranho", "texto", "booleano", "nao_lista", "ausente"],
)
def test_reordenar_listas_com_ids_desatualizados_responde_400(api, ids):
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


def test_reordenar_depois_de_outra_aba_excluir_lista_e_recusado(api):
    a, b, c = (nova_lista(api, n)["id"] for n in "ABC")
    ok(api.delete(f"/api/listas/{b}"), 204)
    assert erro(api.put("/api/listas/ordem", json={"ids": [c, b, a]})) == ORDEM_LISTAS


# --- tarefas ----------------------------------------------------------------


def test_criar_tarefa(api):
    lista = nova_lista(api)
    t = nova_tarefa(api, lista["id"], "  Ler capítulo 3 📖 ")
    assert t == {"id": t["id"], "lista_id": lista["id"], "titulo": "Ler capítulo 3 📖",
                 "concluida": False, "ordem": 0, "concluida_em": None}
    assert nova_tarefa(api, lista["id"], "Outra")["ordem"] == 1


@pytest.mark.parametrize(
    "corpo,esperado",
    [
        ({}, INFORME_TITULO),
        ({"titulo": ""}, INFORME_TITULO),
        ({"titulo": "   "}, INFORME_TITULO),
        ({"titulo": None}, INFORME_TITULO),
        ({"titulo": ["x"]}, INFORME_TITULO),
        ({"titulo": "x" * 201}, TITULO_LONGO),
        ({"titulo": "🚀" * 201}, TITULO_LONGO),
        ({"titulo": "ok", "lista_id": 2}, validacao("Campo não permitido. (lista_id)")),
        ({"titulo": "ok", "concluida": True}, validacao("Campo não permitido. (concluida)")),
    ],
)
def test_validacao_do_titulo(api, corpo, esperado):
    lista_id = nova_lista(api)["id"]
    assert erro(api.post(f"/api/listas/{lista_id}/tarefas", json=corpo)) == esperado
    assert tarefas(api, lista_id) == {"pendentes": [], "concluidas": []}


def test_criar_tarefa_com_corpo_que_nao_e_json(api):
    url = f"/api/listas/{nova_lista(api)['id']}/tarefas"
    assert erro(api.post(url, data="x", content_type="text/plain")) == JSON_INVALIDO


def test_titulo_aceita_limite_exato_e_unicode(api):
    lista_id = nova_lista(api)["id"]
    assert nova_tarefa(api, lista_id, "x" * 200)["titulo"] == "x" * 200
    assert nova_tarefa(api, lista_id, "🚀" * 200)["titulo"] == "🚀" * 200
    assert nova_tarefa(api, lista_id, "  " + "y" * 200 + " ")["titulo"] == "y" * 200


@pytest.mark.parametrize("repetido", ["Comprar pão", "comprar PÃO", "  COMPRAR PÃO "])
def test_titulo_duplicado_na_lista_responde_409(api, repetido):
    lista_id = nova_lista(api)["id"]
    nova_tarefa(api, lista_id, "Comprar pão")
    url = f"/api/listas/{lista_id}/tarefas"
    assert erro(api.post(url, json={"titulo": repetido}), 409) == TAREFA_REPETIDA


def test_titulo_duplicado_vale_tambem_contra_concluidas(api):
    lista_id = nova_lista(api)["id"]
    concluir(api, nova_tarefa(api, lista_id, "Feita")["id"])
    url = f"/api/listas/{lista_id}/tarefas"
    assert erro(api.post(url, json={"titulo": "feita"}), 409) == TAREFA_REPETIDA


def test_mesmo_titulo_em_listas_diferentes_e_permitido(api):
    a, b = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    nova_tarefa(api, a, "Ler")
    assert nova_tarefa(api, b, "ler")["titulo"] == "ler"


@pytest.mark.parametrize(
    "corpo,esperado",
    [
        ({}, NAO_BOOL),
        ({"concluida": "true"}, NAO_BOOL),
        ({"concluida": 1}, NAO_BOOL),
        ({"concluida": 0}, NAO_BOOL),
        ({"concluida": None}, NAO_BOOL),
        ({"concluida": [True]}, NAO_BOOL),
        ({"titulo": "x"}, NAO_BOOL),  # editar título: fora do escopo
        ({"concluida": True, "ordem": 0}, validacao("Campo não permitido. (ordem)")),
    ],
)
def test_patch_so_aceita_concluida_booleana(api, corpo, esperado):
    t = nova_tarefa(api, nova_lista(api)["id"])
    assert erro(api.patch(f"/api/tarefas/{t['id']}", json=corpo)) == esperado
    assert tarefas(api, t["lista_id"])["pendentes"] == [t]


def test_patch_grava_o_valor_enviado_e_repetir_e_idempotente(api):
    t = nova_tarefa(api, nova_lista(api)["id"])

    feita = concluir(api, t["id"], True)
    assert feita["concluida"] is True and DATA.match(feita["concluida_em"])
    for _ in range(3):  # cliques repetidos enviam o mesmo valor: nada muda, nada inverte
        assert concluir(api, t["id"], True) == feita

    reaberta = concluir(api, t["id"], False)
    assert reaberta["concluida"] is False and reaberta["concluida_em"] is None
    for _ in range(3):
        assert concluir(api, t["id"], False) == reaberta


def test_marcar_de_novo_grava_novo_concluida_em(api, monkeypatch):
    from minski import tarefas as modulo

    instantes = iter(["2026-01-01T10:00:00", "2026-01-02T11:00:00"])
    monkeypatch.setattr(
        modulo, "_agora", lambda: modulo.datetime.fromisoformat(next(instantes))
    )
    t = nova_tarefa(api, nova_lista(api)["id"])
    assert concluir(api, t["id"])["concluida_em"] == "2026-01-01T10:00:00Z"
    concluir(api, t["id"], False)
    assert concluir(api, t["id"])["concluida_em"] == "2026-01-02T11:00:00Z"


def test_reabrir_manda_a_tarefa_para_o_fim_das_pendentes(api):
    lista_id = nova_lista(api)["id"]
    a, b, c = (nova_tarefa(api, lista_id, n) for n in "abc")
    concluir(api, a["id"])
    ok(api.put(f"/api/listas/{lista_id}/tarefas/ordem", json={"ids": [c["id"], b["id"]]}))

    assert concluir(api, a["id"], False)["ordem"] == 2
    assert [x["titulo"] for x in tarefas(api, lista_id)["pendentes"]] == ["c", "b", "a"]


def test_listar_pendentes_por_ordem_e_concluidas_mais_recentes_primeiro(api):
    lista_id = nova_lista(api)["id"]
    a, b, _c, d = (nova_tarefa(api, lista_id, n) for n in "abcd")
    for t in (b, d, a):
        concluir(api, t["id"])

    resposta = tarefas(api, lista_id)
    assert [x["titulo"] for x in resposta["pendentes"]] == ["c"]
    assert [x["titulo"] for x in resposta["concluidas"]] == ["a", "d", "b"]
    assert all(x["concluida"] for x in resposta["concluidas"])


def test_tarefas_de_outra_lista_nao_aparecem(api):
    a, b = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    nova_tarefa(api, a, "de A")
    assert tarefas(api, b) == {"pendentes": [], "concluidas": []}
    assert nova_tarefa(api, b)["ordem"] == 0


def test_tarefa_inexistente_responde_404(api):
    assert erro(api.patch("/api/tarefas/99", json={"concluida": True}), 404) == SEM_TAREFA
    assert erro(api.patch("/api/tarefas/99", json={"concluida": "x"}), 404) == SEM_TAREFA


@pytest.mark.parametrize(
    "metodo,url",
    [
        ("delete", "/api/tarefas/1"),  # excluir tarefa: fora do escopo
        ("put", "/api/tarefas/1"),  # editar título / mover de lista: fora do escopo
        ("put", "/api/listas/1/tarefas/concluidas/ordem"),  # reordenar concluídas
    ],
)
def test_rotas_fora_do_escopo_nao_existem(api, metodo, url):
    lista_id = nova_lista(api)["id"]
    nova_tarefa(api, lista_id)
    assert getattr(api, metodo)(url, json={"ids": []}).status_code in (404, 405)
    assert len(tarefas(api, lista_id)["pendentes"]) == 1


def test_reordenar_pendentes(api):
    lista_id = nova_lista(api)["id"]
    a, b, c = (nova_tarefa(api, lista_id, n)["id"] for n in "abc")
    resposta = ok(api.put(f"/api/listas/{lista_id}/tarefas/ordem", json={"ids": [c, a, b]}))
    assert resposta == tarefas(api, lista_id)
    assert [(x["titulo"], x["ordem"]) for x in resposta["pendentes"]] == [
        ("c", 0), ("a", 1), ("b", 2)
    ]


@pytest.mark.parametrize(
    "caso", ["faltando", "concluida", "outra_lista", "repetido", "estranho", "texto", "ausente"]
)
def test_reordenar_pendentes_com_ids_desatualizados_responde_400(api, caso):
    lista_id, outra = nova_lista(api, "A")["id"], nova_lista(api, "B")["id"]
    a, b, feita = (nova_tarefa(api, lista_id, n)["id"] for n in "abf")
    de_fora = nova_tarefa(api, outra)["id"]
    concluir(api, feita)
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
    assert [x["titulo"] for x in tarefas(api, lista_id)["pendentes"]] == ["a", "b"]


def test_reordenar_depois_de_concluir_em_outra_aba_e_recusado(api):
    lista_id = nova_lista(api)["id"]
    a, b = (nova_tarefa(api, lista_id, n)["id"] for n in "ab")
    concluir(api, a)  # outra aba conclui; esta ainda enviaria a ordem antiga
    url = f"/api/listas/{lista_id}/tarefas/ordem"
    assert erro(api.put(url, json={"ids": [b, a]})) == ORDEM_TAREFAS


# --- AC06 -------------------------------------------------------------------


def test_dados_persistem_apos_reiniciar_o_processo(tmp_path):
    uri = f"sqlite:///{tmp_path / 'persistente.db'}"
    api = create_app({"SQLALCHEMY_DATABASE_URI": uri}).test_client()
    a, b = nova_lista(api, "Pessoal ✨")["id"], nova_lista(api, "Casa")["id"]
    ok(api.put("/api/listas/ordem", json={"ids": [b, a]}))
    x, y = (nova_tarefa(api, a, n)["id"] for n in ("Comprar pão", "Ler"))
    ok(api.put(f"/api/listas/{a}/tarefas/ordem", json={"ids": [y, x]}))
    concluir(api, nova_tarefa(api, a, "Feita")["id"])
    esperado = [ok(api.get("/api/listas")), tarefas(api, a)]

    leitura = (
        "import json; from minski import create_app; "
        f"c = create_app({{'SQLALCHEMY_DATABASE_URI': {uri!r}}}).test_client(); "
        f"print(json.dumps([c.get('/api/listas').json, c.get('/api/listas/{a}/tarefas').json]))"
    )
    saida = subprocess.run(
        [sys.executable, "-c", leitura], cwd=Path(__file__).parents[1],
        capture_output=True, text=True, check=True,
    ).stdout
    assert json.loads(saida) == esperado
    assert [t["titulo"] for t in esperado[1]["pendentes"]] == ["Ler", "Comprar pão"]
