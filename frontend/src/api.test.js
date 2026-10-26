import { afterEach, expect, test, vi } from "vitest";
import {
  api,
  ApiError,
  criarQueryClient,
  nomeDaLista,
  SEM_CONEXAO,
  tituloDaTarefa,
} from "./api.js";

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

test("envia JSON e devolve o corpo", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(json(201, { id: 1, nome: "A", ordem: 0 }));
  vi.stubGlobal("fetch", fetch);
  expect(await api("/listas", { method: "POST", body: { nome: "A" } })).toEqual(
    { id: 1, nome: "A", ordem: 0 },
  );
  expect(fetch).toHaveBeenCalledWith("/api/listas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"nome":"A"}',
  });
});

test("204 devolve null", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(204)));
  expect(await api("/listas/1", { method: "DELETE" })).toBeNull();
});

test.each([
  [400, "VALIDACAO", "Informe o nome da lista."],
  [404, "NAO_ENCONTRADO", "Lista não encontrada."],
  [409, "DUPLICADO", "Já existe uma lista com esse nome."],
])(
  "erro %i vira ApiError com a mensagem do servidor",
  async (status, codigo, mensagem) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(status, { erro: { codigo, mensagem } })),
    );
    await expect(api("/listas")).rejects.toEqual(
      expect.objectContaining({ status, codigo, message: mensagem }),
    );
  },
);

test("erro fora do formato e falha de rede usam mensagem genérica", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })),
  );
  await expect(api("/listas")).rejects.toMatchObject({
    status: 500,
    message: SEM_CONEXAO,
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api("/listas")).rejects.toMatchObject({
    codigo: "REDE",
    message: SEM_CONEXAO,
  });
});

test("falha de refetch avisa e mantém os dados em cache", async () => {
  const avisar = vi.fn();
  const client = criarQueryClient(avisar);
  const queryKey = ["listas"];
  await client.fetchQuery({ queryKey, queryFn: () => [{ id: 1 }] });
  await client
    .fetchQuery({
      queryKey,
      staleTime: 0,
      queryFn: () =>
        Promise.reject(
          new ApiError(404, "NAO_ENCONTRADO", "Lista não encontrada."),
        ),
    })
    .catch(() => {});
  expect(avisar).toHaveBeenCalledWith("Lista não encontrada.");
  expect(client.getQueryData(queryKey)).toEqual([{ id: 1 }]);
});

test("schemas Zod aplicam trim e limites", () => {
  expect(nomeDaLista.parse({ nome: "  Casa " })).toEqual({ nome: "Casa" });
  expect(nomeDaLista.safeParse({ nome: "   " }).error.issues[0].message).toBe(
    "Informe o nome da lista.",
  );
  expect(nomeDaLista.safeParse({ nome: "x".repeat(61) }).success).toBe(false);
  expect(tituloDaTarefa.safeParse({ titulo: "y".repeat(200) }).success).toBe(
    true,
  );
  expect(tituloDaTarefa.safeParse({ titulo: "y".repeat(201) }).success).toBe(
    false,
  );
});
