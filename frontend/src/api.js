// Chamadas à API JSON do backend Flask, sempre com fetch.

export const FALHA_AO_CRIAR_LISTA = 'Não foi possível salvar a lista. Tente novamente.'
export const FALHA_AO_CARREGAR_LISTAS = 'Não foi possível carregar as listas.'

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

// Envia o nome exatamente como foi digitado; quem apara e valida é o backend.
// Devolve { ok: true, lista } ou { ok: false, mensagem } e nunca lança.
export async function criarLista(nome, fetchFn = fetchPadrao) {
  let resposta
  try {
    resposta = await fetchFn('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    })
  } catch {
    return { ok: false, mensagem: FALHA_AO_CRIAR_LISTA }
  }

  const corpo = await lerJson(resposta)
  if (resposta.ok && corpo && corpo.id != null && typeof corpo.nome === 'string') {
    return { ok: true, lista: corpo }
  }
  const mensagem = corpo?.erro?.mensagem
  return {
    ok: false,
    mensagem: typeof mensagem === 'string' && mensagem ? mensagem : FALHA_AO_CRIAR_LISTA,
  }
}
