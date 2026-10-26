import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { api, ApiError, nomeDaLista, tituloDaTarefa } from "./api.js";

/** Campo de texto que salva com Enter; 400/409 do servidor aparecem abaixo do campo. */
function CampoTexto({
  schema,
  campo,
  rotulo,
  valorInicial = "",
  salvar,
  cancelar,
}) {
  const { register, handleSubmit, setError, reset, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { [campo]: valorInicial },
  });
  const enviar = handleSubmit(async (dados) => {
    try {
      await salvar(dados[campo]);
      reset();
    } catch (erro) {
      if (erro instanceof ApiError && [400, 409].includes(erro.status)) {
        setError(campo, { message: erro.message });
      }
    }
  });
  const mensagem = formState.errors[campo]?.message;
  return (
    <form onSubmit={enviar} noValidate>
      <input
        className={`form-control${mensagem ? " is-invalid" : ""}`}
        aria-label={rotulo}
        placeholder={rotulo}
        autoFocus={Boolean(cancelar)}
        onKeyDown={(e) => e.key === "Escape" && cancelar?.()}
        {...register(campo)}
      />
      {mensagem && <div className="invalid-feedback">{mensagem}</div>}
    </form>
  );
}

function useSalvar(mutationFn, invalidar) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { noFormulario: true },
    onSuccess: () =>
      invalidar.forEach((queryKey) => client.invalidateQueries({ queryKey })),
  }).mutateAsync;
}

function Tarefa({ tarefa, queryKey }) {
  const client = useQueryClient();
  const concluir = useMutation({
    mutationFn: ({ concluida }) =>
      api(`/tarefas/${tarefa.id}`, { method: "PATCH", body: { concluida } }),
    // Mesma tarefa, mesma fila: os PATCH saem em série e o último clique vence.
    scope: { id: `tarefa-${tarefa.id}` },
    onError: (_erro, { antes }) => client.setQueryData(queryKey, antes),
    onSettled: () => {
      // Só recarrega quando a fila desta tarefa esvaziou, para não piscar valores antigos.
      if (
        client.isMutating({
          predicate: (m) => m.options.scope?.id === `tarefa-${tarefa.id}`,
        }) <= 1
      ) {
        client.invalidateQueries({ queryKey });
      }
    },
  });

  function alternar(concluida) {
    const antes = client.getQueryData(queryKey);
    const outras = (t) => t.id !== tarefa.id;
    const movida = {
      ...tarefa,
      concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
    };
    // A tela mostra o clique na hora; o servidor recebe o valor desejado, nunca um "inverter".
    client.setQueryData(queryKey, ({ pendentes, concluidas }) =>
      concluida
        ? {
            pendentes: pendentes.filter(outras),
            concluidas: [movida, ...concluidas.filter(outras)],
          }
        : {
            pendentes: [...pendentes.filter(outras), movida],
            concluidas: concluidas.filter(outras),
          },
    );
    concluir.mutate({ concluida, antes });
  }

  return (
    <li className="list-group-item">
      <input
        type="checkbox"
        className="form-check-input me-2"
        id={`tarefa-${tarefa.id}`}
        checked={tarefa.concluida}
        onChange={(e) => alternar(e.target.checked)}
      />
      <label className="form-check-label" htmlFor={`tarefa-${tarefa.id}`}>
        {tarefa.titulo}
      </label>
    </li>
  );
}

function Tarefas({ lista }) {
  const queryKey = ["tarefas", lista.id];
  const [abertas, setAbertas] = useState(false);
  const { data } = useQuery({
    queryKey,
    queryFn: () => api(`/listas/${lista.id}/tarefas`),
  });
  const criar = useSalvar(
    (titulo) =>
      api(`/listas/${lista.id}/tarefas`, { method: "POST", body: { titulo } }),
    [queryKey],
  );
  if (!data) return null;

  return (
    <>
      <CampoTexto
        key={lista.id}
        schema={tituloDaTarefa}
        campo="titulo"
        rotulo="Nova tarefa"
        salvar={(titulo) => criar(titulo)}
      />
      {data.pendentes.length === 0 && data.concluidas.length === 0 ? (
        <p className="text-body-secondary mt-3">Nenhuma tarefa nesta lista.</p>
      ) : (
        <ul className="list-group mt-3" aria-label="Pendentes">
          {data.pendentes.map((t) => (
            <Tarefa key={t.id} tarefa={t} queryKey={queryKey} />
          ))}
        </ul>
      )}
      {data.concluidas.length > 0 && (
        <section className="mt-3">
          <button
            type="button"
            className="btn btn-link px-0"
            aria-expanded={abertas}
            onClick={() => setAbertas(!abertas)}
          >
            Concluídas ({data.concluidas.length})
          </button>
          {abertas && (
            <ul className="list-group" aria-label="Concluídas">
              {data.concluidas.map((t) => (
                <Tarefa key={t.id} tarefa={t} queryKey={queryKey} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function CabecalhoDaLista({ lista }) {
  const client = useQueryClient();
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useSalvar(
    (nome) => api(`/listas/${lista.id}`, { method: "PATCH", body: { nome } }),
    [["listas"]],
  );
  const excluir = useMutation({
    mutationFn: () => api(`/listas/${lista.id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ["tarefas", lista.id] });
      client.invalidateQueries({ queryKey: ["listas"] });
    },
  });

  function pedirExclusao() {
    const tarefas = client.getQueryData(["tarefas", lista.id]);
    const total = tarefas
      ? tarefas.pendentes.length + tarefas.concluidas.length
      : 0;
    if (
      total > 0 &&
      !window.confirm(
        `Excluir a lista «${lista.nome}» e suas ${total} tarefa(s)?`,
      )
    )
      return;
    excluir.mutate();
  }

  if (renomeando) {
    return (
      <div className="mb-3">
        <CampoTexto
          schema={nomeDaLista}
          campo="nome"
          rotulo="Nome da lista"
          valorInicial={lista.nome}
          salvar={async (nome) => {
            await renomear(nome);
            setRenomeando(false);
          }}
          cancelar={() => setRenomeando(false)}
        />
      </div>
    );
  }
  return (
    <div className="d-flex align-items-center gap-2 mb-3">
      <h2 className="h4 mb-0 me-auto">{lista.nome}</h2>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => setRenomeando(true)}
      >
        Renomear
      </button>
      <button
        type="button"
        className="btn btn-outline-danger btn-sm"
        onClick={pedirExclusao}
      >
        Excluir
      </button>
    </div>
  );
}

export default function Listas() {
  const { data: listas } = useQuery({
    queryKey: ["listas"],
    queryFn: () => api("/listas"),
  });
  const [selecionadaId, setSelecionadaId] = useState(null);
  const criar = useSalvar(
    (nome) => api("/listas", { method: "POST", body: { nome } }),
    [["listas"]],
  );
  // Sem seleção válida (primeira visita ou lista excluída), vale a primeira pela ordem.
  const selecionada =
    listas?.find((l) => l.id === selecionadaId) ?? listas?.[0];

  return (
    <main className="container py-4">
      <h1 className="h3">Listas</h1>
      <div className="row g-4">
        <nav className="col-md-4">
          {listas?.length === 0 && (
            <p className="text-body-secondary">
              Nenhuma lista ainda. Crie a primeira:
            </p>
          )}
          <div className="list-group mb-3">
            {listas?.map((lista) => (
              <button
                key={lista.id}
                type="button"
                className={`list-group-item list-group-item-action${lista === selecionada ? " active" : ""}`}
                aria-current={lista === selecionada}
                onClick={() => setSelecionadaId(lista.id)}
              >
                {lista.nome}
              </button>
            ))}
          </div>
          <CampoTexto
            schema={nomeDaLista}
            campo="nome"
            rotulo="Nova lista"
            salvar={(nome) => criar(nome)}
          />
        </nav>
        {selecionada && (
          <section className="col-md-8">
            <CabecalhoDaLista key={selecionada.id} lista={selecionada} />
            <Tarefas key={selecionada.id} lista={selecionada} />
          </section>
        )}
      </div>
    </main>
  );
}
