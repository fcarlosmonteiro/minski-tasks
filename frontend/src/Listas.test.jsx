import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App.jsx";
import { servidorFalso } from "./servidorFalso.js";

const tarefa = (id, lista_id, titulo, extra = {}) => ({
  id,
  lista_id,
  titulo,
  concluida: false,
  ordem: id,
  concluida_em: null,
  ...extra,
});
const DUAS_LISTAS = {
  listas: [
    { id: 2, nome: "Pessoal", ordem: 1 },
    { id: 1, nome: "Trabalho", ordem: 0 },
  ],
  tarefas: [
    tarefa(10, 1, "Relatório"),
    tarefa(11, 1, "Reunião"),
    tarefa(12, 1, "Antiga", {
      concluida: true,
      concluida_em: "2026-01-01T10:00:00Z",
    }),
    tarefa(13, 1, "Recente", {
      concluida: true,
      concluida_em: "2026-01-02T10:00:00Z",
    }),
    tarefa(20, 2, "Mercado"),
  ],
};

function abrir() {
  render(
    <MemoryRouter initialEntries={["/listas"]}>
      <App />
    </MemoryRouter>,
  );
  return userEvent.setup();
}
const pendentes = () => within(screen.getByRole("list", { name: "Pendentes" }));
const nomes = (lista) =>
  lista.getAllByRole("listitem").map((li) => li.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("sem listas mostra estado vazio com o campo de criar lista", async () => {
  servidorFalso();
  const user = abrir();
  expect(await screen.findByText(/Nenhuma lista ainda/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("Nova lista"), "  Casa  {Enter}");
  expect(await screen.findByRole("button", { name: "Casa" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(
    await screen.findByText("Nenhuma tarefa nesta lista."),
  ).toBeInTheDocument();
});

test("seleciona a primeira lista pela ordem e mostra só suas pendentes", async () => {
  servidorFalso(DUAS_LISTAS);
  const user = abrir();
  expect(
    await screen.findByRole("heading", { name: "Trabalho" }),
  ).toBeInTheDocument();
  const navegacao = within(screen.getByRole("navigation"));
  expect(navegacao.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Trabalho",
    "Pessoal",
  ]);
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual(["Relatório", "Reunião"]),
  );
  await user.click(screen.getByRole("button", { name: "Pessoal" }));
  await waitFor(() => expect(nomes(pendentes())).toEqual(["Mercado"]));
});

test.each([
  ["   ", "Informe o nome da lista."],
  ["x".repeat(61), "O nome da lista pode ter no máximo 60 caracteres."],
  ["TRABALHO", "Já existe uma lista com esse nome."],
])("criar lista %j é recusado com mensagem", async (nome, mensagem) => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await user.type(await screen.findByLabelText("Nova lista"), `${nome}{Enter}`);
  expect(await screen.findByText(mensagem)).toBeInTheDocument();
  expect(srv.listas).toHaveLength(2);
});

test("renomear lista com Enter; nome repetido mostra a mensagem do servidor", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await user.click(await screen.findByRole("button", { name: "Renomear" }));
  const campo = screen.getByLabelText("Nome da lista");
  await user.clear(campo);
  await user.type(campo, "pessoal{Enter}");
  expect(
    await screen.findByText("Já existe uma lista com esse nome."),
  ).toBeInTheDocument();
  await user.clear(campo);
  await user.type(campo, "Emprego{Enter}");
  expect(
    await screen.findByRole("heading", { name: "Emprego" }),
  ).toBeInTheDocument();
  expect(srv.listas.find((l) => l.id === 1).nome).toBe("Emprego");
});

test("excluir lista com tarefas pede confirmação", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const confirmar = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const user = abrir();
  await screen.findByText("Relatório");
  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(confirmar).toHaveBeenCalledWith(
    "Excluir a lista «Trabalho» e suas 4 tarefa(s)?",
  );
  expect(srv.listas).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(
    await screen.findByRole("heading", { name: "Pessoal" }),
  ).toBeInTheDocument();
  expect(srv.tarefas.map((t) => t.titulo)).toEqual(["Mercado"]);
});

test("excluir lista vazia não pede confirmação", async () => {
  const srv = servidorFalso({ listas: [{ id: 1, nome: "Vazia", ordem: 0 }] });
  const confirmar = vi.spyOn(window, "confirm");
  const user = abrir();
  await screen.findByText("Nenhuma tarefa nesta lista.");
  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(await screen.findByText(/Nenhuma lista ainda/)).toBeInTheDocument();
  expect(confirmar).not.toHaveBeenCalled();
  expect(srv.listas).toEqual([]);
});

test("lista excluída em outra aba: mostra «Lista não encontrada» e recarrega as listas", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = abrir();
  await screen.findByText("Relatório");
  srv.listas = srv.listas.filter((l) => l.id !== 1); // a outra aba excluiu
  await user.type(screen.getByLabelText("Nova tarefa"), "Nova{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Lista não encontrada.",
  );
  expect(
    await screen.findByRole("heading", { name: "Pessoal" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Trabalho" })).toBeNull();
});

test("criar tarefa com Enter; vazio não cria nada", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  const campo = await screen.findByLabelText("Nova tarefa");
  await user.type(campo, "  Ligar para o banco {Enter}");
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual([
      "Relatório",
      "Reunião",
      "Ligar para o banco",
    ]),
  );
  expect(campo).toHaveValue("");
  const antes = srv.chamadas.length;
  await user.type(campo, "   {Enter}");
  expect(srv.chamadas.filter(([m]) => m === "POST")).toHaveLength(1);
  expect(srv.chamadas.length).toBe(antes);
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each([
  ["y".repeat(201), "O título da tarefa pode ter no máximo 200 caracteres."],
  ["reunião", "Já existe uma tarefa com esse título nesta lista."],
])("criar tarefa %j é recusado com mensagem", async (titulo, mensagem) => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await user.type(
    await screen.findByLabelText("Nova tarefa"),
    `${titulo}{Enter}`,
  );
  expect(await screen.findByText(mensagem)).toBeInTheDocument();
  expect(srv.tarefas).toHaveLength(5);
});

test("Concluídas começa recolhida, abre/fecha sem chamar a API e vem da mais recente", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  const botao = await screen.findByRole("button", { name: "Concluídas (2)" });
  expect(botao).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list", { name: "Concluídas" })).toBeNull();
  const antes = srv.chamadas.length;
  await user.click(botao);
  expect(
    nomes(within(screen.getByRole("list", { name: "Concluídas" }))),
  ).toEqual(["Recente", "Antiga"]);
  await user.click(botao);
  expect(screen.queryByRole("list", { name: "Concluídas" })).toBeNull();
  expect(srv.chamadas.length).toBe(antes);
});

test("marcar conclui e desmarcar devolve às pendentes, enviando o valor desejado", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await user.click(await screen.findByLabelText("Relatório"));
  await waitFor(() => expect(nomes(pendentes())).toEqual(["Reunião"]));
  await user.click(screen.getByRole("button", { name: "Concluídas (3)" }));
  expect(
    nomes(within(screen.getByRole("list", { name: "Concluídas" })))[0],
  ).toBe("Relatório");
  await waitFor(() =>
    expect(srv.tarefas.find((t) => t.id === 10).concluida).toBe(true),
  );

  await user.click(screen.getByLabelText("Relatório"));
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual(["Reunião", "Relatório"]),
  );
  const patches = srv.chamadas
    .filter(([m]) => m === "PATCH")
    .map(([, , corpo]) => corpo);
  expect(patches).toEqual([{ concluida: true }, { concluida: false }]);
});

test("cliques rápidos saem em série e terminam no último valor", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await user.click(
    await screen.findByRole("button", { name: "Concluídas (2)" }),
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByLabelText("Relatório"));
  await waitFor(() =>
    expect(srv.chamadas.filter(([m]) => m === "PATCH")).toHaveLength(3),
  );
  await waitFor(() => expect(srv.emVoo).toBe(0));
  expect(
    srv.chamadas.filter(([m]) => m === "PATCH").map(([, , c]) => c.concluida),
  ).toEqual([true, false, true]);
  expect(srv.maxEmVoo).toBe(1);
  expect(srv.tarefas.find((t) => t.id === 10).concluida).toBe(true);
  await waitFor(() => expect(screen.getByLabelText("Relatório")).toBeChecked());
});

test("falha de rede ao concluir mostra aviso e mantém a tela", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await screen.findByText("Relatório");
  srv.offline = true;
  await user.click(screen.getByLabelText("Relatório"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível falar com o servidor",
  );
  expect(nomes(pendentes())).toEqual(["Relatório", "Reunião"]);
  expect(screen.getByLabelText("Relatório")).not.toBeChecked();
});

// --- arrastar e soltar ------------------------------------------------------

function arrastar(de, para) {
  fireEvent.dragStart(de);
  fireEvent.dragOver(para);
  fireEvent.drop(para);
  fireEvent.dragEnd(de);
}
const puts = (srv) =>
  srv.chamadas
    .filter(([m]) => m === "PUT")
    .map(([, url, corpo]) => [url, corpo]);
const botoesDeLista = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("button")
    .map((b) => b.textContent);

test("arrastar lista envia todos os ids na nova ordem e grava", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  abrir();
  await screen.findByRole("heading", { name: "Trabalho" });
  arrastar(
    screen.getByRole("button", { name: "Pessoal" }),
    screen.getByRole("button", { name: "Trabalho" }),
  );
  await waitFor(() => expect(botoesDeLista()).toEqual(["Pessoal", "Trabalho"]));
  await waitFor(() =>
    expect(puts(srv)).toEqual([["/api/listas/ordem", { ids: [2, 1] }]]),
  );
  expect(srv.listas.find((l) => l.id === 2).ordem).toBe(0);
});

test("arrastar tarefa envia só as pendentes da lista; concluídas não arrastam", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  await screen.findByText("Relatório");
  arrastar(
    screen.getByText("Reunião").closest("li"),
    screen.getByText("Relatório").closest("li"),
  );
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual(["Reunião", "Relatório"]),
  );
  await waitFor(() =>
    expect(puts(srv)).toEqual([
      ["/api/listas/1/tarefas/ordem", { ids: [11, 10] }],
    ]),
  );

  await user.click(screen.getByRole("button", { name: "Concluídas (2)" }));
  const concluidas = within(
    screen.getByRole("list", { name: "Concluídas" }),
  ).getAllByRole("listitem");
  concluidas.forEach((li) => expect(li).not.toHaveAttribute("draggable"));
  arrastar(concluidas[0], screen.getByText("Reunião").closest("li"));
  expect(puts(srv)).toHaveLength(1);
});

test("soltar tarefa sobre uma lista não move nada entre listas", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  abrir();
  await screen.findByText("Relatório");
  arrastar(
    screen.getByText("Relatório").closest("li"),
    screen.getByRole("button", { name: "Pessoal" }),
  );
  expect(puts(srv)).toEqual([]);
  expect(botoesDeLista()).toEqual(["Trabalho", "Pessoal"]);
});

test("Alt+seta reordena pelo teclado", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  const user = abrir();
  (await screen.findByLabelText("Reunião")).focus();
  await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual(["Reunião", "Relatório"]),
  );
  await waitFor(() =>
    expect(puts(srv)).toEqual([
      ["/api/listas/1/tarefas/ordem", { ids: [11, 10] }],
    ]),
  );
});

test("ordem desatualizada: servidor recusa, aviso aparece e a ordem atual é recarregada", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  abrir();
  await screen.findByText("Relatório");
  // Outra aba criou uma tarefa: a ordem desta tela ficou desatualizada.
  srv.tarefas.push({
    id: 99,
    lista_id: 1,
    titulo: "De outra aba",
    concluida: false,
    ordem: 99,
    concluida_em: null,
  });
  arrastar(
    screen.getByText("Reunião").closest("li"),
    screen.getByText("Relatório").closest("li"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A ordem enviada está desatualizada: recarregue as tarefas desta lista.",
  );
  await waitFor(() =>
    expect(nomes(pendentes())).toEqual([
      "Relatório",
      "Reunião",
      "De outra aba",
    ]),
  );
  expect(srv.tarefas.find((t) => t.id === 10).ordem).toBe(10); // nada foi gravado
});

test("lista excluída em outra aba: reordenar listas é recusado e recarrega", async () => {
  const srv = servidorFalso(DUAS_LISTAS);
  abrir();
  await screen.findByRole("heading", { name: "Trabalho" });
  srv.listas.push({ id: 3, nome: "Nova de outra aba", ordem: 2 });
  arrastar(
    screen.getByRole("button", { name: "Pessoal" }),
    screen.getByRole("button", { name: "Trabalho" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "recarregue as listas",
  );
  await waitFor(() =>
    expect(botoesDeLista()).toEqual([
      "Trabalho",
      "Pessoal",
      "Nova de outra aba",
    ]),
  );
});
