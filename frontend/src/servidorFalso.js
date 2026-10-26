import { vi } from "vitest";

/** Backend em memória com o contrato da Spec, para os testes de interface. */
export function servidorFalso({ listas = [], tarefas = [] } = {}) {
  const db = {
    listas: structuredClone(listas),
    tarefas: structuredClone(tarefas),
    offline: false,
  };
  db.chamadas = [];
  db.emVoo = 0;
  db.maxEmVoo = 0;
  let proximo = 100;
  const erro = (status, codigo, mensagem) => [
    status,
    { erro: { codigo, mensagem } },
  ];
  const textoInvalido = (texto, max, vazio, longo) =>
    !texto?.trim()
      ? erro(400, "VALIDACAO", vazio)
      : texto.trim().length > max
        ? erro(400, "VALIDACAO", longo)
        : null;

  function rotear(metodo, caminho, corpo) {
    let m;
    if (caminho === "/api/listas" && metodo === "GET")
      return [200, [...db.listas].sort((a, b) => a.ordem - b.ordem)];
    if (caminho === "/api/listas" && metodo === "POST") {
      const invalido = textoInvalido(
        corpo.nome,
        60,
        "Informe o nome da lista.",
        "O nome da lista pode ter no máximo 60 caracteres.",
      );
      if (invalido) return invalido;
      if (
        db.listas.some(
          (l) => l.nome.toLowerCase() === corpo.nome.trim().toLowerCase(),
        )
      )
        return erro(409, "DUPLICADO", "Já existe uma lista com esse nome.");
      const lista = {
        id: proximo++,
        nome: corpo.nome.trim(),
        ordem: db.listas.length,
      };
      db.listas.push(lista);
      return [201, lista];
    }
    const ordenar = (itens) => {
      const ids = corpo?.ids;
      const atuais = itens.map((x) => x.id).sort();
      if (
        !Array.isArray(ids) ||
        ids.length !== atuais.length ||
        [...ids].sort().some((id, i) => id !== atuais[i])
      )
        return null;
      ids.forEach((id, i) => (itens.find((x) => x.id === id).ordem = i));
      return true;
    };
    if (caminho === "/api/listas/ordem" && metodo === "PUT")
      return ordenar(db.listas)
        ? rotear("GET", "/api/listas")
        : erro(
            400,
            "VALIDACAO",
            "A ordem enviada está desatualizada: recarregue as listas.",
          );
    if (
      (m = caminho.match(/^\/api\/listas\/(\d+)\/tarefas\/ordem$/)) &&
      metodo === "PUT"
    ) {
      const id = Number(m[1]);
      if (!db.listas.some((l) => l.id === id))
        return erro(404, "NAO_ENCONTRADO", "Lista não encontrada.");
      return ordenar(
        db.tarefas.filter((t) => t.lista_id === id && !t.concluida),
      )
        ? rotear("GET", `/api/listas/${id}/tarefas`)
        : erro(
            400,
            "VALIDACAO",
            "A ordem enviada está desatualizada: recarregue as tarefas desta lista.",
          );
    }
    if ((m = caminho.match(/^\/api\/listas\/(\d+)(\/tarefas)?$/))) {
      const lista = db.listas.find((l) => l.id === Number(m[1]));
      if (!lista) return erro(404, "NAO_ENCONTRADO", "Lista não encontrada.");
      const daLista = db.tarefas.filter((t) => t.lista_id === lista.id);
      if (m[2] && metodo === "GET")
        return [
          200,
          {
            pendentes: daLista
              .filter((t) => !t.concluida)
              .sort((a, b) => a.ordem - b.ordem),
            concluidas: daLista
              .filter((t) => t.concluida)
              .sort((a, b) => b.concluida_em.localeCompare(a.concluida_em)),
          },
        ];
      if (m[2] && metodo === "POST") {
        const invalido = textoInvalido(
          corpo.titulo,
          200,
          "Informe o título da tarefa.",
          "O título da tarefa pode ter no máximo 200 caracteres.",
        );
        if (invalido) return invalido;
        if (
          daLista.some(
            (t) => t.titulo.toLowerCase() === corpo.titulo.trim().toLowerCase(),
          )
        )
          return erro(
            409,
            "DUPLICADO",
            "Já existe uma tarefa com esse título nesta lista.",
          );
        const t = {
          id: proximo++,
          lista_id: lista.id,
          titulo: corpo.titulo.trim(),
          concluida: false,
          ordem: proximo,
          concluida_em: null,
        };
        db.tarefas.push(t);
        return [201, t];
      }
      if (metodo === "PATCH") {
        if (
          db.listas.some(
            (l) =>
              l !== lista &&
              l.nome.toLowerCase() === corpo.nome.trim().toLowerCase(),
          )
        )
          return erro(409, "DUPLICADO", "Já existe uma lista com esse nome.");
        lista.nome = corpo.nome.trim();
        return [200, lista];
      }
      if (metodo === "DELETE") {
        db.listas = db.listas.filter((l) => l !== lista);
        db.tarefas = db.tarefas.filter((t) => t.lista_id !== lista.id);
        return [204, null];
      }
    }
    if ((m = caminho.match(/^\/api\/tarefas\/(\d+)$/)) && metodo === "PATCH") {
      const t = db.tarefas.find((x) => x.id === Number(m[1]));
      if (!t) return erro(404, "NAO_ENCONTRADO", "Tarefa não encontrada.");
      if (corpo.concluida && !t.concluida)
        t.concluida_em = new Date(Date.now() + proximo++).toISOString();
      if (!corpo.concluida) t.concluida_em = null;
      t.concluida = corpo.concluida;
      return [200, t];
    }
    return erro(404, "NAO_ENCONTRADO", "Recurso não encontrado.");
  }

  db.fetch = vi.fn(async (url, { method = "GET", body } = {}) => {
    if (db.offline) throw new TypeError("Failed to fetch");
    const corpo = body ? JSON.parse(body) : undefined;
    db.chamadas.push([method, url, corpo]);
    db.maxEmVoo = Math.max(db.maxEmVoo, ++db.emVoo);
    await new Promise((r) => setTimeout(r, method === "PATCH" ? 15 : 0));
    db.emVoo--;
    const [status, dados] = rotear(method, url, corpo);
    return new Response(dados === null ? null : JSON.stringify(dados), {
      status,
    });
  });
  vi.stubGlobal("fetch", db.fetch);
  return db;
}
