import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Todo dado criado aqui começa com "E2E " e é apagado no fim (e no início, se
// uma execução anterior caiu no meio).
const P = "E2E ";
const PROJETO = process.env.E2E_PROJETO ?? "minski-e2e";
const PORTA = new URL(process.env.E2E_URL ?? "http://127.0.0.1:5174").port;

test.describe.configure({ mode: "serial" });

async function listasDaApi(request) {
  return (await request.get("/api/listas")).json();
}

async function limpar(request) {
  for (const l of await listasDaApi(request)) {
    if (l.nome.startsWith(P)) await request.delete(`/api/listas/${l.id}`);
  }
}

async function esperarApi(request) {
  await expect
    .poll(
      async () =>
        (await request.get("/api/listas").catch(() => null))?.status(),
      {
        timeout: 60_000,
      },
    )
    .toBe(200);
}

function compose(args) {
  execSync(`docker compose -p ${PROJETO} ${args}`, {
    cwd: new URL("../..", import.meta.url).pathname,
    env: { ...process.env, FRONTEND_PORT: PORTA },
    stdio: "inherit",
  });
}

const nav = (page) => page.getByRole("navigation");
const listaNoMenu = (page, nome) =>
  nav(page).getByRole("button", { name: nome, exact: true });
const pendentes = (page) =>
  page.getByRole("list", { name: "Pendentes" }).getByRole("listitem");
const concluidas = (page) =>
  page.getByRole("list", { name: "Concluídas" }).getByRole("listitem");
const caixa = (page, titulo) => page.getByLabel(titulo, { exact: true });

async function criarLista(page, nome) {
  await page.getByLabel("Nova lista").fill(nome);
  await page.getByLabel("Nova lista").press("Enter");
  await expect(listaNoMenu(page, nome.trim())).toBeVisible();
}

async function criarTarefa(page, titulo) {
  const antes = await pendentes(page).count();
  await page.getByLabel("Nova tarefa").fill(titulo);
  await page.getByLabel("Nova tarefa").press("Enter");
  await expect(pendentes(page)).toHaveCount(antes + 1);
}

async function idDaLista(request, nome) {
  return (await listasDaApi(request)).find((l) => l.nome === nome).id;
}

test.beforeAll(async ({ request }) => {
  await esperarApi(request);
  await limpar(request);
});

test.afterAll(async ({ request }) => {
  await limpar(request);
});

test("AC1/AC2: boas-vindas, «Entrar» e rota de listas direta, sem login", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Minski Tasks" }),
  ).toBeVisible();
  await expect(page.getByText(/listas temáticas/)).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/listas$/);
  await expect(page.getByRole("heading", { name: "Listas" })).toBeVisible();

  await page.goto("/listas");
  await expect(page.getByRole("heading", { name: "Listas" })).toBeVisible();
});

test("AC18: sem listas mostra estado vazio com a ação de criar", async ({
  page,
  request,
}) => {
  test.skip(
    (await listasDaApi(request)).length > 0,
    "o volume do E2E tem listas que não são do teste",
  );
  await page.goto("/listas");
  await expect(page.getByText(/Nenhuma lista ainda/)).toBeVisible();
  await expect(page.getByLabel("Nova lista")).toBeVisible();
});

test("AC3/AC15–17: criar listas, primeira selecionada, validações", async ({
  page,
}) => {
  await page.goto("/listas");
  await criarLista(page, `  ${P}Trabalho  `);
  await criarLista(page, `${P}Casa`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    `${P}Trabalho`,
  );

  const campo = page.getByLabel("Nova lista");
  for (const [nome, mensagem] of [
    ["   ", "Informe o nome da lista."],
    [P + "x".repeat(57), "O nome da lista pode ter no máximo 60 caracteres."],
    [`${P}TRABALHO`, "Já existe uma lista com esse nome."],
  ]) {
    await campo.fill(nome);
    await campo.press("Enter");
    await expect(page.getByText(mensagem)).toBeVisible();
  }
  await expect(nav(page).getByRole("button")).toHaveCount(2);
});

test("AC6/AC7/AC15–17: cinco tarefas em duas listas, Enter vazio e validações", async ({
  page,
}) => {
  await page.goto("/listas");
  await expect(page.getByText("Nenhuma tarefa nesta lista.")).toBeVisible();
  for (const t of ["Relatório", "Reunião", "E-mails"])
    await criarTarefa(page, t);
  await expect(pendentes(page)).toHaveText(["Relatório", "Reunião", "E-mails"]);

  const campo = page.getByLabel("Nova tarefa");
  await campo.fill("   ");
  await campo.press("Enter");
  await expect(pendentes(page)).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);

  for (const [titulo, mensagem] of [
    ["reunião", "Já existe uma tarefa com esse título nesta lista."],
    ["y".repeat(201), "O título da tarefa pode ter no máximo 200 caracteres."],
  ]) {
    await campo.fill(titulo);
    await campo.press("Enter");
    await expect(page.getByText(mensagem)).toBeVisible();
  }
  await expect(pendentes(page)).toHaveCount(3);

  await listaNoMenu(page, `${P}Casa`).click();
  await criarTarefa(page, "Mercado");
  await criarTarefa(page, "Reunião"); // mesmo título em outra lista é permitido
  await expect(pendentes(page)).toHaveText(["Mercado", "Reunião"]);
});

test("AC8/AC9/AC19: concluir, desconcluir, «Concluídas» recolhida e ordenada", async ({
  page,
}) => {
  await page.goto("/listas");
  await caixa(page, "Relatório").click();
  await expect(pendentes(page)).toHaveText(["Reunião", "E-mails"]);
  await caixa(page, "E-mails").click();
  await expect(pendentes(page)).toHaveText(["Reunião"]);

  const secao = page.getByRole("button", { name: "Concluídas (2)" });
  await expect(secao).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("list", { name: "Concluídas" })).toHaveCount(0);
  await secao.click();
  await expect(concluidas(page)).toHaveText(["E-mails", "Relatório"]); // mais recente primeiro
  await secao.click();
  await expect(page.getByRole("list", { name: "Concluídas" })).toHaveCount(0);

  await secao.click();
  await caixa(page, "E-mails").click();
  await expect(pendentes(page)).toHaveText(["Reunião", "E-mails"]);
  await expect(concluidas(page)).toHaveText(["Relatório"]);
});

test("edge: dois cliques rápidos terminam no estado do último clique", async ({
  page,
  request,
}) => {
  await page.goto("/listas");
  await page.getByRole("button", { name: /^Concluídas/ }).click(); // a caixa fica visível nas duas seções
  const enviados = [];
  page.on(
    "request",
    (r) => r.method() === "PATCH" && enviados.push(r.postDataJSON()),
  );

  // Dois cliques seguidos na mesma caixa, sem esperar resposta entre eles. (Um dblclick
  // físico cai em outro elemento: a tarefa muda de seção entre os cliques.)
  await caixa(page, "Reunião").click();
  await caixa(page, "Reunião").click();
  await expect(caixa(page, "Reunião")).not.toBeChecked();
  await expect
    .poll(() => enviados)
    .toEqual([{ concluida: true }, { concluida: false }]);
  const id = await idDaLista(request, `${P}Trabalho`);
  await expect
    .poll(async () => {
      const dados = await (
        await request.get(`/api/listas/${id}/tarefas`)
      ).json();
      return dados.pendentes.find((t) => t.titulo === "Reunião")?.concluida;
    })
    .toBe(false);
});

test("AC10/AC11: arrastar listas e pendentes grava a nova ordem", async ({
  page,
  request,
}) => {
  await page.goto("/listas");
  await listaNoMenu(page, `${P}Casa`).dragTo(listaNoMenu(page, `${P}Trabalho`));
  await expect(nav(page).getByRole("button")).toHaveText([
    `${P}Casa`,
    `${P}Trabalho`,
  ]);
  await expect
    .poll(async () => (await listasDaApi(request)).map((l) => l.nome))
    .toEqual([`${P}Casa`, `${P}Trabalho`]);

  await listaNoMenu(page, `${P}Trabalho`).click();
  const antes = await pendentes(page).allTextContents();
  await pendentes(page).last().dragTo(pendentes(page).first());
  const esperado = [antes.at(-1), ...antes.slice(0, -1)];
  await expect(pendentes(page)).toHaveText(esperado);
  await page.reload();
  await listaNoMenu(page, `${P}Trabalho`).click();
  await expect(pendentes(page)).toHaveText(esperado);
});

test("edge: reordenar com dados desatualizados é recusado e recarrega", async ({
  page,
  request,
}) => {
  await page.goto("/listas");
  await listaNoMenu(page, `${P}Trabalho`).click();
  await expect(pendentes(page).first()).toBeVisible();
  const id = await idDaLista(request, `${P}Trabalho`);
  await request.post(`/api/listas/${id}/tarefas`, {
    data: { titulo: "De outra aba" },
  });

  await pendentes(page).last().dragTo(pendentes(page).first());
  await expect(page.getByRole("alert")).toContainText(
    "A ordem enviada está desatualizada",
  );
  await expect(pendentes(page).last()).toHaveText("De outra aba");
});

test("persistência: listas, tarefas e ordens sobrevivem a reiniciar e recriar backend e frontend", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const id = await idDaLista(request, `${P}Trabalho`);
  const estado = async () => [
    await listasDaApi(request),
    await (await request.get(`/api/listas/${id}/tarefas`)).json(),
  ];
  const antes = await estado();

  for (const comando of [
    "restart backend frontend",
    "up -d --force-recreate backend frontend",
  ]) {
    compose(comando);
    await esperarApi(request);
    expect(await estado()).toEqual(antes);
  }

  await page.goto("/listas");
  await expect(nav(page).getByRole("button")).toHaveText(
    antes[0].map((l) => l.nome),
  );
  await listaNoMenu(page, `${P}Trabalho`).click();
  await expect(pendentes(page)).toHaveText(
    antes[1].pendentes.map((t) => t.titulo),
  );
});

test("AC4/AC5/AC14: renomear e excluir com confirmação e cascata", async ({
  page,
  request,
}) => {
  await page.goto("/listas");
  await listaNoMenu(page, `${P}Casa`).click();
  await page.getByRole("button", { name: "Renomear" }).click();
  const campo = page.getByLabel("Nome da lista");
  await campo.fill(`${P}trabalho`);
  await campo.press("Enter");
  await expect(
    page.getByText("Já existe uma lista com esse nome."),
  ).toBeVisible();
  await campo.fill(`${P}Lar`);
  await campo.press("Enter");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(`${P}Lar`);

  const id = await idDaLista(request, `${P}Lar`);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(listaNoMenu(page, `${P}Lar`)).toBeVisible();

  page.once("dialog", (d) => {
    expect(d.message()).toContain("2 tarefa(s)");
    d.accept();
  });
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(listaNoMenu(page, `${P}Lar`)).toHaveCount(0);
  expect((await request.get(`/api/listas/${id}/tarefas`)).status()).toBe(404);
});

test("edge: lista excluída em outra aba mostra «Lista não encontrada» e recarrega", async ({
  page,
  request,
}) => {
  await page.goto("/listas");
  await criarLista(page, `${P}Temporária`);
  await listaNoMenu(page, `${P}Temporária`).click();
  await request.delete(
    `/api/listas/${await idDaLista(request, `${P}Temporária`)}`,
  );

  await page.getByLabel("Nova tarefa").fill("Qualquer");
  await page.getByLabel("Nova tarefa").press("Enter");
  await expect(page.getByRole("alert")).toContainText("Lista não encontrada.");
  await expect(listaNoMenu(page, `${P}Temporária`)).toHaveCount(0);
});
