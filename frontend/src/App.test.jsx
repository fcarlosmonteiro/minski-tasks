import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App.jsx";

function abrir(rota) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>,
  );
}

function respostas(...lista) {
  const fetch = vi.fn();
  for (const r of lista) {
    if (r instanceof Error) fetch.mockRejectedValueOnce(r);
    else
      fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(r.body), { status: r.status }),
      );
  }
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

test("tela inicial mostra nome, frase e Entrar, sem login", () => {
  abrir("/");
  expect(
    screen.getByRole("heading", { name: "Minski Tasks" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/listas temáticas/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/usuário|senha/i)).toBeNull();
});

test("Entrar leva às listas", async () => {
  respostas({ status: 200, body: [{ id: 1, nome: "Trabalho", ordem: 0 }] });
  abrir("/");
  await userEvent.click(screen.getByRole("link", { name: "Entrar" }));
  expect(await screen.findByText("Trabalho")).toBeInTheDocument();
});

test("rota das listas abre direto pelo endereço", async () => {
  const fetch = respostas({
    status: 200,
    body: [{ id: 1, nome: "Pessoal", ordem: 0 }],
  });
  abrir("/listas");
  expect(await screen.findByText("Pessoal")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith("/api/listas", expect.anything());
});

test("falha de rede mostra aviso", async () => {
  respostas(new TypeError("Failed to fetch"));
  abrir("/listas");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível falar com o servidor",
  );
  expect(screen.getByRole("heading", { name: "Listas" })).toBeInTheDocument();
});
