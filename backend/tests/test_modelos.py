import os

import pytest
from marshmallow import ValidationError
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError

from minski import create_app, db
from minski.listas import Lista, ListaSchema
from minski.tarefas import Tarefa, TarefaSchema


@pytest.fixture
def app(tmp_path):
    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'teste.db'}"})
    with app.app_context():
        yield app


def salvar(*objs):
    db.session.add_all(objs)
    db.session.commit()
    return objs[0] if len(objs) == 1 else objs


def test_schema_criado_com_os_campos_da_spec(app):
    insp = inspect(db.engine)
    colunas = lambda t: {c["name"] for c in insp.get_columns(t)}
    assert colunas("lista") == {"id", "nome", "ordem"}
    assert colunas("tarefa") == {
        "id", "lista_id", "titulo", "concluida", "concluida_em", "ordem"
    }
    [fk] = insp.get_foreign_keys("tarefa")
    assert fk["referred_table"] == "lista" and fk["options"]["ondelete"] == "CASCADE"


def test_defaults_de_lista_e_tarefa(app):
    a, b = salvar(Lista(nome="Trabalho"), Lista(nome="Pessoal"))
    assert (a.ordem, b.ordem) == (0, 1)

    t1 = salvar(Tarefa(lista_id=a.id, titulo="Relatório"))
    assert t1.concluida is False and t1.concluida_em is None
    assert t1.ordem == 0


def test_ordem_da_tarefa_vai_para_o_fim_das_pendentes_da_lista(app):
    a, b = salvar(Lista(nome="A"), Lista(nome="B"))
    salvar(Tarefa(lista_id=a.id, titulo="p0"), Tarefa(lista_id=a.id, titulo="p1"))
    salvar(Tarefa(lista_id=a.id, titulo="feita", concluida=True, ordem=99))
    assert salvar(Tarefa(lista_id=a.id, titulo="nova")).ordem == 2
    assert salvar(Tarefa(lista_id=b.id, titulo="outra lista")).ordem == 0


def test_concluir_preenche_e_reabrir_apaga_concluida_em(app):
    t = salvar(Tarefa(lista_id=salvar(Lista(nome="L")).id, titulo="x"))
    t.concluida = True
    db.session.commit()
    concluida_em = t.concluida_em
    assert concluida_em is not None
    t.concluida = True  # clique repetido: não regrava a data (comparação com microssegundos)
    db.session.commit()
    assert t.concluida_em == concluida_em
    t.concluida = False
    db.session.commit()
    assert t.concluida_em is None


def test_excluir_lista_exclui_suas_tarefas_em_cascata(app):
    a, b = salvar(Lista(nome="A"), Lista(nome="B"))
    salvar(Tarefa(lista_id=a.id, titulo="vai"), Tarefa(lista_id=b.id, titulo="fica"))
    db.session.execute(db.delete(Lista).where(Lista.id == a.id))
    db.session.commit()
    assert db.session.scalars(select(Tarefa.titulo)).all() == ["fica"]


def test_tarefa_sem_lista_existente_e_recusada(app):
    with pytest.raises(IntegrityError):
        salvar(Tarefa(lista_id=999, titulo="órfã"))


def test_nome_da_lista_unico_sem_diferenciar_maiusculas(app):
    salvar(Lista(nome="Trabalho"))
    with pytest.raises(IntegrityError):
        salvar(Lista(nome="TRABALHO"))


def test_persistencia_basica_via_schemas(app):
    lista = salvar(Lista(**ListaSchema().load({"nome": "  Universidade  "})))
    tarefa = salvar(Tarefa(lista_id=lista.id, **TarefaSchema(only=("titulo",)).load({"titulo": " Ler "})))
    db.session.expire_all()

    assert ListaSchema().dump(db.session.get(Lista, lista.id))["nome"] == "Universidade"
    dados = TarefaSchema().dump(db.session.get(Tarefa, tarefa.id))
    assert dados["titulo"] == "Ler" and dados["concluida"] is False


@pytest.mark.parametrize(
    "schema,dados",
    [
        (ListaSchema, {"nome": "   "}),
        (ListaSchema, {"nome": "x" * 61}),
        (TarefaSchema, {"titulo": ""}),
        (TarefaSchema, {"titulo": "x" * 201}),
        (TarefaSchema, {}),
    ],
)
def test_schemas_recusam_dados_invalidos(schema, dados):
    with pytest.raises(ValidationError):
        schema().load(dados)


def test_caminho_do_banco_vem_de_minski_db_path(tmp_path, monkeypatch):
    destino = tmp_path / "dados.db"
    monkeypatch.setenv("MINSKI_DB_PATH", str(destino))
    app = create_app()
    with app.app_context():
        salvar(Lista(nome="Casa"))
        db.engine.dispose()
    assert destino.exists()

    # Persistência: outra instância da aplicação lê o mesmo arquivo.
    with create_app().app_context():
        assert db.session.scalars(select(Lista.nome)).all() == ["Casa"]
        db.engine.dispose()


def test_padrao_do_banco_e_instance_minski_db(monkeypatch):
    monkeypatch.delenv("MINSKI_DB_PATH", raising=False)
    monkeypatch.setattr(db, "create_all", lambda: None)  # não cria o banco real
    app = create_app()
    with app.app_context():
        assert db.engine.url.database == os.path.join(app.instance_path, "minski.db")
    assert os.path.basename(app.instance_path) == "instance"
