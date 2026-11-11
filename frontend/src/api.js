// Chamadas à API JSON do backend Flask, sempre com fetch.

export const FALHA_AO_CRIAR_LISTA = 'Não foi possível salvar a lista. Tente novamente.'
export const FALHA_AO_CARREGAR_LISTAS = 'Não foi possível carregar as listas.'
export const FALHA_AO_CARREGAR_TAREFAS = 'Não foi possível carregar as tarefas.'
export const FALHA_AO_CRIAR_TAREFA = 'Não foi possível salvar a tarefa. Tente novamente.'
export const FALHA_AO_ALTERAR_TAREFA = 'Não foi possível atualizar a tarefa. Tente novamente.'

const fetchPadrao = (...argumentos) => globalThis.fetch(...argumentos)

async function lerJson(resposta) {
  try {
    return await resposta.json()
  } catch {
    return null
  }
}

export async function buscarListas(fetchFn = fetchPadrao) {
  const resposta = await fetchFn('/api/lists')
  const corpo = await lerJson(resposta)
  if (!resposta.ok || !Array.isArray(corpo)) {
    throw new Error(FALHA_AO_CARREGAR_LISTAS)
  }
  return corpo
}

// POST/PATCH com corpo JSON. Devolve { ok: true, corpo } quando o backend
// confirma, ou { ok: false, mensagem } com a mensagem do backend (ou a genérica)
// e nunca lança.
async function enviarJson(url, method, dados, respostaValida, falha, fetchFn) {
  let resposta
  try {
    resposta = await fetchFn(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
  } catch {
    return { ok: false, mensagem: falha }
  }

  const corpo = await lerJson(resposta)
  if (resposta.ok && respostaValida(corpo)) {
    return { ok: true, corpo }
  }
  const mensagem = corpo?.erro?.mensagem
  return {
    ok: false,
    mensagem: typeof mensagem === 'string' && mensagem ? mensagem : falha,
  }
}

const ehLista = (corpo) => corpo != null && corpo.id != null && typeof corpo.nome === 'string'

const ehTarefa = (corpo) =>
  corpo != null &&
  corpo.id != null &&
  typeof corpo.titulo === 'string' &&
  typeof corpo.concluida === 'boolean' &&
  typeof corpo.criada_em === 'string'

const urlTarefasDaLista = (listaId) => `/api/lists/${encodeURIComponent(listaId)}/tasks`

// Envia o nome exatamente como foi digitado; quem apara e valida é o backend.
// Devolve { ok: true, lista } ou { ok: false, mensagem } e nunca lança.
export async function criarLista(nome, fetchFn = fetchPadrao) {
  const resultado = await enviarJson('/api/lists', 'POST', { nome }, ehLista, FALHA_AO_CRIAR_LISTA, fetchFn)
  return resultado.ok ? { ok: true, lista: resultado.corpo } : resultado
}

export async function buscarTarefas(listaId, fetchFn = fetchPadrao) {
  const resposta = await fetchFn(urlTarefasDaLista(listaId))
  const corpo = await lerJson(resposta)
  if (!resposta.ok || !Array.isArray(corpo)) {
    throw new Error(FALHA_AO_CARREGAR_TAREFAS)
  }
  return corpo
}

// Envia o título exatamente como foi digitado; quem apara e valida é o backend.
// Devolve { ok: true, tarefa } ou { ok: false, mensagem } e nunca lança.
export async function criarTarefa(listaId, titulo, fetchFn = fetchPadrao) {
  const resultado = await enviarJson(
    urlTarefasDaLista(listaId),
    'POST',
    { titulo },
    ehTarefa,
    FALHA_AO_CRIAR_TAREFA,
    fetchFn,
  )
  return resultado.ok ? { ok: true, tarefa: resultado.corpo } : resultado
}

// PATCH /api/tasks/<id> com { concluida }. Devolve { ok: true, tarefa } com a
// tarefa gravada ou { ok: false, mensagem } e nunca lança.
export async function alterarConclusao(tarefaId, concluida, fetchFn = fetchPadrao) {
  const resultado = await enviarJson(
    `/api/tasks/${encodeURIComponent(tarefaId)}`,
    'PATCH',
    { concluida },
    ehTarefa,
    FALHA_AO_ALTERAR_TAREFA,
    fetchFn,
  )
  return resultado.ok ? { ok: true, tarefa: resultado.corpo } : resultado
}
