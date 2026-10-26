import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { z } from "zod";

export const SEM_CONEXAO =
  "Não foi possível falar com o servidor. Tente de novo.";

/** Erro no formato da Spec: {erro: {codigo, mensagem}}. */
export class ApiError extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

export async function api(caminho, { method = "GET", body } = {}) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "REDE", SEM_CONEXAO);
  }
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = dados?.erro;
    throw new ApiError(
      resposta.status,
      erro?.codigo ?? "SERVIDOR",
      erro?.mensagem ?? SEM_CONEXAO,
    );
  }
  return dados;
}

/** Toda falha de query ou mutation vira um aviso; os dados já em cache continuam na tela. */
export function criarQueryClient(avisar) {
  const onError = (erro) =>
    avisar(erro instanceof ApiError ? erro.message : SEM_CONEXAO);
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false } },
  });
}

// Mesmas regras de texto do servidor (trim antes de validar); o servidor continua a autoridade.
export const nomeDaLista = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da lista.")
    .max(60, "O nome da lista pode ter no máximo 60 caracteres."),
});
export const tituloDaTarefa = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, "Informe o título da tarefa.")
    .max(200, "O título da tarefa pode ter no máximo 200 caracteres."),
});
